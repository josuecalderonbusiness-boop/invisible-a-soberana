// api/whatsapp.js — Arquitectura correcta: respuesta inmediata + triggers via Apps Script

export default async function handler(req, res) {

  // ── GET: verificación webhook Meta ──────────────────────────────
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      console.log('Webhook verificado OK');
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Forbidden' });
  }

  // ── POST: trigger programado desde Apps Script ───────────────────
  if (req.method === 'POST' && req.body?.trigger === true) {
    const { phone, paso } = req.body;
    console.log(`Trigger recibido: phone=${phone} paso=${paso}`);
    await ejecutarPaso(phone, paso);
    return res.status(200).json({ ok: true });
  }

  // ── POST desde Orbit: envío manual ──────────────────────────────
  if (req.method === 'POST' && req.body?.to && req.body?.message) {
    const sent = await sendWhatsApp(req.body.to, req.body.message);
    return res.status(sent ? 200 : 500).json({ ok: sent });
  }

  // ── POST: webhook entrante Meta ──────────────────────────────────
  if (req.method === 'POST' && req.body?.object === 'whatsapp_business_account') {

    // CRÍTICO: responder 200 a Meta INMEDIATAMENTE para evitar reintentos
    res.status(200).json({ ok: true });

    // Procesar en segundo plano
    procesarMensaje(req.body).catch(err => {
      console.error('Error procesando mensaje:', err.message);
    });

    return;
  }

  return res.status(200).json({ ok: true });
}

// ════════════════════════════════════════════════════════════════
// PROCESAMIENTO PRINCIPAL (en segundo plano)
// ════════════════════════════════════════════════════════════════

async function procesarMensaje(body) {
  const entry    = body.entry?.[0]?.changes?.[0]?.value;
  const messages = entry?.messages;
  if (!messages?.length) return;

  const msg   = messages[0];
  const phone = '+' + msg.from;
  const text  = (msg.text?.body || '').toLowerCase().trim();
  const tipo  = msg.type;

  console.log(`=== Mensaje WA de ${phone} [${tipo}]: "${text}" ===`);

  // ── BOTONES INTERACTIVOS ─────────────────────────────────────────
  if (tipo === 'interactive') {
    const btnId = msg.interactive?.button_reply?.id || '';
    const btnTx = msg.interactive?.button_reply?.title || '';
    console.log(`Botón interactivo: id=${btnId} title=${btnTx}`);
    await manejarBotonInteractivo(phone, btnId);
    return;
  }

  // ── BOTONES DE PLANTILLA ─────────────────────────────────────────
  if (tipo === 'button') {
    const btnTx = msg.button?.text || '';
    console.log(`Botón plantilla: "${btnTx}"`);
    await manejarBotonPlantilla(phone, btnTx);
    return;
  }

  // ── MENSAJE DE BIENVENIDA ────────────────────────────────────────
  const esBienvenida =
    text.includes('acabo de comprar') ||
    text.includes('comunidad vip') ||
    text.includes('soberana');

  if (esBienvenida) {
    let contacto  = await buscarPorHotmartPhone(phone);
    let matchTipo = 'hotmart_phone';
    if (!contacto) {
      contacto  = await buscarCompradoraSinSMS();
      matchTipo = 'reciente_sin_sms';
    }

    let nombre = '';
    let email  = '';
    let found  = false;

    if (contacto) {
      nombre = contacto.attributes?.NOMBRE || contacto.attributes?.FIRSTNAME || '';
      email  = contacto.email;
      found  = true;
      console.log(`Compradora encontrada (${matchTipo}): ${email} (${nombre})`);
      const hotmartPhone = contacto.attributes?.HOTMART_PHONE || '';
      if (!contacto.attributes?.SMS || normalizar(hotmartPhone) !== normalizar(phone)) {
        await actualizarSMS(email, phone);
      }
    } else {
      email = 'sin-match@soberana';
    }

    await guardarEnSheets({
      fecha:    now(),
      nombre:   nombre,
      email:    email,
      whatsapp: phone,
      perfil:   contacto?.attributes?.QUIZ_PROFILE || '',
      lista:    found ? '11' : 'sin-match',
      mensaje:  `match:${matchTipo} | bienvenida`
    });

    await sendTemplate(phone, nombre || 'amiga');
    return;
  }

  console.log('Mensaje no reconocido, ignorando');
}

// ════════════════════════════════════════════════════════════════
// LÓGICA DE BOTONES
// ════════════════════════════════════════════════════════════════

async function manejarBotonPlantilla(phone, boton) {
  const b = boton.toLowerCase();

  if (b.includes('ya pude entrar') || b.includes('sí')) {
    // Enviar herramienta y comunidad INMEDIATAMENTE
    await sendUrlButton(phone,
      `Tu herramienta de trabajo ya está lista. 🛠️\n\n` +
      `Aquí vas a registrar tus respuestas del Workshop, activar tus recordatorios y aplicar cada palanca a tu ritmo.\n\n` +
      `👇 Descárgala antes de empezar.`,
      'Ver herramienta',
      'https://soberana-app.josuecalderon.lat'
    );

    await sendUrlButton(phone,
      `Únete también a la comunidad privada.\n\n` +
      `Ahí publico perspectiva masculina directa, casos reales y cosas que no digo en ningún otro lado.\n\n` +
      `Solo para compradoras. 👇`,
      'Unirme ahora',
      'https://chat.whatsapp.com/BqxkKzCjlFj5RdX7MYOJi2'
    );

    // Programar confirmación comunidad en 3 minutos via Apps Script
    await programarTrigger(phone, 'confirmacion_comunidad', 3);
  }

  else if (b.includes('no he podido') || b.includes('no')) {
    await flujoB_ayuda(phone);
  }
}

async function manejarBotonInteractivo(phone, btnId) {

  // Confirmación comunidad: Sí ya estoy dentro
  if (btnId === 'comunidad_si') {
    await flujoA_encargo(phone);
  }

  // Confirmación comunidad: Aún no
  else if (btnId === 'comunidad_no') {
    await sendUrlButton(phone,
      `Toca el enlace y únete antes de empezar el Workshop.\n\n` +
      `La comunidad es parte de tu acceso. Lo que publico ahí complementa directamente lo que vas a ver adentro.`,
      'Unirme ahora',
      'https://chat.whatsapp.com/BqxkKzCjlFj5RdX7MYOJi2'
    );
    // Reintentar confirmación en 3 minutos
    await programarTrigger(phone, 'confirmacion_comunidad', 3);
  }

  // Workshop: Hoy mismo
  else if (btnId === 'workshop_hoy') {
    await sendWhatsApp(phone,
      `Perfecto. 💪\n\n` +
      `Cuando termines — escríbeme aquí. Una sola palabra. Lo que sea que sientas.\n\n` +
      `Nos vemos adentro.`
    );
  }

  // Workshop: Esta semana
  else if (btnId === 'workshop_semana') {
    await sendWhatsApp(phone,
      `Bien. Te escribo en unos días. 📅\n\n` +
      `Cuando lo veas — escríbeme.`
    );
  }

  // Workshop: Aún no sé
  else if (btnId === 'workshop_nosé') {
    await sendWhatsApp(phone,
      `Sin problema. Aquí estaré. 🙏\n\n` +
      `Cuando estés lista — el Workshop te espera.`
    );
  }
}

// ════════════════════════════════════════════════════════════════
// PASOS PROGRAMADOS (ejecutados por triggers de Apps Script)
// ════════════════════════════════════════════════════════════════

async function ejecutarPaso(phone, paso) {
  if (paso === 'confirmacion_comunidad') {
    await sendButtons(phone,
      '¿Lograste unirte a la comunidad?',
      [
        { id: 'comunidad_si', title: '✅ Sí, ya estoy dentro' },
        { id: 'comunidad_no', title: '⏳ Aún no' }
      ]
    );
  }
}

// ════════════════════════════════════════════════════════════════
// FLUJOS
// ════════════════════════════════════════════════════════════════

async function flujoA_encargo(phone) {
  await sendButtons(phone,
    `Ya tienes todo lo que necesitas. 🎯\n\n` +
    `Ahora solo falta una cosa: ver el Workshop completo. Sin saltar partes.\n\n` +
    `Hay un momento en el segundo módulo que lo cambia todo. Cuando llegues ahí — vas a saber exactamente de qué hablo.\n\n` +
    `¿Cuándo vas a verlo?`,
    [
      { id: 'workshop_hoy',    title: '🔥 Hoy mismo' },
      { id: 'workshop_semana', title: '📅 Esta semana' },
      { id: 'workshop_nosé',   title: '🤔 Aún no sé' }
    ]
  );
}

async function flujoB_ayuda(phone) {
  await sendWhatsApp(phone,
    `Tranquila. Lo resolvemos ahora. 🙏\n\n` +
    `Revisa estas tres cosas:\n\n` +
    `1️⃣ Busca en *spam* o *promociones* un correo de Hotmart\n\n` +
    `2️⃣ El correo viene de noreply@hotmart.com\n\n` +
    `3️⃣ Si no aparece — respóndeme aquí con tu correo y te reenvío el acceso manualmente.`
  );
}

// ════════════════════════════════════════════════════════════════
// PROGRAMAR TRIGGER EN APPS SCRIPT
// ════════════════════════════════════════════════════════════════

async function programarTrigger(phone, paso, minutos) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) { console.log('Sin SHEETS_WEBHOOK_URL'); return; }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion:   'programar_trigger',
        phone:    phone,
        paso:     paso,
        minutos:  minutos,
        webhook:  'https://invisible-a-soberana.josuecalderon.lat/api/whatsapp'
      })
    });
    console.log(`Trigger programado (${paso} en ${minutos}min):`, res.ok ? 'OK' : res.status);
  } catch (err) {
    console.error('programarTrigger error:', err.message);
  }
}

// ════════════════════════════════════════════════════════════════
// FUNCIONES DE ENVÍO
// ════════════════════════════════════════════════════════════════

async function sendTemplate(to, nombre) {
  const number = to.replace(/[^0-9]/g, '');
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: number,
          type: 'template',
          template: {
            name: 'bienvenida_pacto_soberana',
            language: { code: 'es_MX' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', parameter_name: 'firstname', text: nombre }
                ]
              }
            ]
          }
        })
      }
    );
    const data = await res.json();
    const ok = !!data.messages?.[0]?.id;
    console.log(`Template → ${number}: ${ok ? '✓ enviado' : JSON.stringify(data)}`);
    return ok;
  } catch (err) {
    console.error('sendTemplate error:', err.message);
    return false;
  }
}

async function sendWhatsApp(to, message) {
  const number = to.replace(/[^0-9]/g, '');
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: number,
          type: 'text',
          text: { body: message }
        })
      }
    );
    const data = await res.json();
    const ok   = !!data.messages?.[0]?.id;
    console.log(`WA → ${number}: ${ok ? '✓ enviado' : JSON.stringify(data)}`);
    return ok;
  } catch (err) {
    console.error('sendWhatsApp error:', err.message);
    return false;
  }
}

async function sendButtons(to, body, buttons) {
  const number = to.replace(/[^0-9]/g, '');
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: number,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: body },
            action: {
              buttons: buttons.map(b => ({
                type: 'reply',
                reply: { id: b.id, title: b.title }
              }))
            }
          }
        })
      }
    );
    const data = await res.json();
    const ok   = !!data.messages?.[0]?.id;
    console.log(`Buttons → ${number}: ${ok ? '✓ enviado' : JSON.stringify(data)}`);
    return ok;
  } catch (err) {
    console.error('sendButtons error:', err.message);
    return false;
  }
}

async function sendUrlButton(to, body, buttonText, url) {
  const number = to.replace(/[^0-9]/g, '');
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: number,
          type: 'interactive',
          interactive: {
            type: 'cta_url',
            body: { text: body },
            action: {
              name: 'cta_url',
              parameters: {
                display_text: buttonText,
                url: url
              }
            }
          }
        })
      }
    );
    const data = await res.json();
    const ok   = !!data.messages?.[0]?.id;
    console.log(`UrlBtn → ${number}: ${ok ? '✓ enviado' : JSON.stringify(data)}`);
    return ok;
  } catch (err) {
    console.error('sendUrlButton error:', err.message);
    return false;
  }
}

// ════════════════════════════════════════════════════════════════
// BREVO Y SHEETS
// ════════════════════════════════════════════════════════════════

async function buscarPorHotmartPhone(phone) {
  try {
    const res = await fetch(
      `https://api.brevo.com/v3/contacts?limit=50&listId=11&sort=desc`,
      { headers: { 'api-key': process.env.BREVO_KEY } }
    );
    const raw = await res.text();
    if (!res.ok) { console.error('Error Brevo:', raw); return null; }
    const data      = JSON.parse(raw);
    const contactos = data.contacts || [];
    const phoneNorm = normalizar(phone);
    return contactos.find(c => {
      const hp  = normalizar(c.attributes?.HOTMART_PHONE || '');
      const sms = normalizar(c.attributes?.SMS || '');
      return (hp && hp === phoneNorm) || (sms && sms === phoneNorm);
    }) || null;
  } catch (err) {
    console.error('buscarPorHotmartPhone error:', err.message);
    return null;
  }
}

async function buscarCompradoraSinSMS() {
  try {
    const res = await fetch(
      `https://api.brevo.com/v3/contacts?limit=50&listId=11&sort=desc`,
      { headers: { 'api-key': process.env.BREVO_KEY } }
    );
    const raw = await res.text();
    if (!res.ok) { console.error('Error Brevo:', raw); return null; }
    const data      = JSON.parse(raw);
    const contactos = data.contacts || [];
    return contactos.find(c => {
      const sms = c.attributes?.SMS;
      return !sms || sms === '';
    }) || null;
  } catch (err) {
    console.error('buscarCompradoraSinSMS error:', err.message);
    return null;
  }
}

async function actualizarSMS(email, phone) {
  try {
    const res = await fetch(
      `https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`,
      {
        method: 'PUT',
        headers: { 'api-key': process.env.BREVO_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ attributes: { SMS: phone } })
      }
    );
    console.log(`PUT Brevo ${email} → status ${res.status}`);
    return res.status === 204 || res.status === 200;
  } catch (err) {
    console.error('actualizarSMS error:', err.message);
    return false;
  }
}

async function guardarEnSheets(data) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) { console.log('Sin SHEETS_WEBHOOK_URL'); return false; }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    console.log('Sheets:', res.ok ? 'OK' : res.status);
    return res.ok;
  } catch (err) {
    console.error('guardarEnSheets error:', err.message);
    return false;
  }
}

// ════════════════════════════════════════════════════════════════
// UTILIDADES
// ════════════════════════════════════════════════════════════════

function normalizar(tel) {
  return (tel || '').replace(/[^\d]/g, '').slice(-10);
}

function now() {
  return new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
}
