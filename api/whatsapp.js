// api/whatsapp.js — Runtime normal, sin Edge

export default async function handler(req, res) {

  // ── GET: verificación webhook Meta ──────────────────────────────
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Forbidden' });
  }

  // ── POST: trigger programado desde Apps Script ───────────────────
  if (req.method === 'POST' && req.body?.trigger === true) {
    const { phone, paso } = req.body;
    console.log(`Trigger: phone=${phone} paso=${paso}`);
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
    const entry    = req.body.entry?.[0]?.changes?.[0]?.value;
    const messages = entry?.messages;
    if (!messages?.length) return res.status(200).json({ ok: true });

    const msg      = messages[0];
    const msgId    = msg.id || '';
    const msgTime  = parseInt(msg.timestamp || '0');

    // Anti-duplicado: verificar en Apps Script ANTES de procesar
    if (msgId) {
      const duplicado = await verificarYMarcar(msgId, msgTime);
      if (duplicado) {
        console.log(`Duplicado ignorado: ${msgId}`);
        return res.status(200).json({ ok: true });
      }
    }

    await procesarMensaje(msg);
    return res.status(200).json({ ok: true });
  }

  return res.status(200).json({ ok: true });
}

// ════════════════════════════════════════════════════════════════
// ANTI-DUPLICADO — rápido, solo verifica el ID
// ════════════════════════════════════════════════════════════════

async function verificarYMarcar(msgId, msgTime) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return false;
  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 2000); // 2s máximo
    const res  = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ accion: 'verificar_mensaje', msgId, msgTime }),
      signal:  controller.signal
    });
    clearTimeout(timeout);
    const data = await res.json();
    return data.duplicado === true;
  } catch (err) {
    // Si falla o tarda — asumir que NO es duplicado para no perder mensajes
    console.log('verificarYMarcar timeout/error — procesando igual');
    return false;
  }
}

// ════════════════════════════════════════════════════════════════
// PROCESAMIENTO PRINCIPAL
// ════════════════════════════════════════════════════════════════

async function procesarMensaje(msg) {
  const phone = '+' + msg.from;
  const text  = (msg.text?.body || '').toLowerCase().trim();
  const tipo  = msg.type;

  console.log(`=== Mensaje WA de ${phone} [${tipo}]: "${text}" ===`);

  // ── BOTONES INTERACTIVOS ─────────────────────────────────────────
  if (tipo === 'interactive') {
    const btnId = msg.interactive?.button_reply?.id || '';
    console.log(`Botón interactivo: id=${btnId}`);
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

  if (!esBienvenida) {
    console.log('Mensaje no reconocido, ignorando');
    return;
  }

  const contacto = await buscarEnSheetsPorTelefono(phone);
  const nombre   = contacto?.nombre || 'amiga';
  const email    = contacto?.email  || 'sin-match@soberana';
  console.log(`Contacto: ${email} (${nombre})`);
  await sendTemplate(phone, nombre);
}

// ════════════════════════════════════════════════════════════════
// LÓGICA DE BOTONES
// ════════════════════════════════════════════════════════════════

async function manejarBotonPlantilla(phone, boton) {
  const b = boton.toLowerCase();
  console.log(`Procesando botón plantilla: "${b}"`);

  if (b.includes('pude') || b.includes('si')) {
    console.log('→ Flujo A: herramienta + comunidad');

    await sendUrlButton(phone,
      `Tu herramienta de trabajo ya está lista. 🛠️\n\n` +
      `Aquí vas a registrar tus respuestas del Workshop, activar tus recordatorios y aplicar cada palanca a tu ritmo.\n\n` +
      `👇 Descárgala antes de empezar.`,
      'Ver herramienta',
      'https://soberana-app.josuecalderon.lat'
    );
    console.log('→ Herramienta enviada');

    await sendUrlButton(phone,
      `Únete también a la comunidad privada.\n\n` +
      `Ahí publico perspectiva masculina directa, casos reales y cosas que no digo en ningún otro lado.\n\n` +
      `Solo para compradoras. 👇`,
      'Unirme ahora',
      'https://chat.whatsapp.com/BqxkKzCjlFj5RdX7MYOJi2'
    );
    console.log('→ Comunidad enviada');

    await programarTrigger(phone, 'confirmacion_comunidad', 3);
    console.log('→ Trigger programado');
  }

  else if (b.includes('podido') || b.includes('no he')) {
    await sendWhatsApp(phone,
      `Tranquila. Lo resolvemos ahora. 🙏\n\n` +
      `Revisa estas tres cosas:\n\n` +
      `1️⃣ Busca en *spam* o *promociones* un correo de Hotmart\n\n` +
      `2️⃣ El correo viene de noreply@hotmart.com\n\n` +
      `3️⃣ Si no aparece — respóndeme aquí con tu correo y te reenvío el acceso manualmente.`
    );
  }

  else {
    console.log(`Botón no reconocido: "${b}"`);
  }
}

async function manejarBotonInteractivo(phone, btnId) {
  if (btnId === 'comunidad_si') {
    await sendButtons(phone,
      `Ya tienes todo lo que necesitas. 🎯\n\n` +
      `Ahora solo falta una cosa: ver el Workshop completo. Sin saltar partes.\n\n` +
      `Hay un momento en el segundo módulo que lo cambia todo. Cuando llegues ahí — vas a saber exactamente de qué hablo.\n\n` +
      `¿Cuándo vas a verlo?`,
      [
        { id: 'workshop_hoy',    title: '🔥 Hoy mismo' },
        { id: 'workshop_semana', title: '📅 Esta semana' },
        { id: 'workshop_nose',   title: '🤔 Aún no sé' }
      ]
    );
  }
  else if (btnId === 'comunidad_no') {
    await sendUrlButton(phone,
      `Toca el enlace y únete antes de empezar el Workshop.\n\n` +
      `La comunidad es parte de tu acceso. Lo que publico ahí complementa directamente lo que vas a ver adentro.`,
      'Unirme ahora',
      'https://chat.whatsapp.com/BqxkKzCjlFj5RdX7MYOJi2'
    );
    await programarTrigger(phone, 'confirmacion_comunidad', 3);
  }
  else if (btnId === 'workshop_hoy') {
    await sendWhatsApp(phone,
      `Perfecto. 💪\n\nCuando termines — escríbeme aquí. Una sola palabra.\n\nNos vemos adentro.`
    );
  }
  else if (btnId === 'workshop_semana') {
    await sendWhatsApp(phone, `Bien. Te escribo en unos días. 📅\n\nCuando lo veas — escríbeme.`);
  }
  else if (btnId === 'workshop_nose') {
    await sendWhatsApp(phone, `Sin problema. Aquí estaré. 🙏\n\nCuando estés lista — el Workshop te espera.`);
  }
}

async function ejecutarPaso(phone, paso) {
  console.log(`Ejecutando paso: ${paso} para ${phone}`);
  if (paso === 'confirmacion_comunidad') {
    await sendButtons(phone,
      '¿Lograste unirte a la comunidad?',
      [
        { id: 'comunidad_si', title: '✅ Sí, ya estoy dentro' },
        { id: 'comunidad_no', title: '⏳ Aún no' }
      ]
    );
    console.log('→ Confirmación comunidad enviada');
  }
}

// ════════════════════════════════════════════════════════════════
// SHEETS Y TRIGGER
// ════════════════════════════════════════════════════════════════

async function buscarEnSheetsPorTelefono(phone) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return null;
  try {
    const tel = phone.replace(/[^0-9]/g, '').slice(-10);
    const res = await fetch(`${url}?accion=buscar_por_telefono&telefono=${tel}`);
    const data = await res.json();
    console.log('Sheets búsqueda:', JSON.stringify(data));
    return data.ok ? data : null;
  } catch (err) {
    console.error('buscarEnSheetsPorTelefono error:', err.message);
    return null;
  }
}

async function programarTrigger(phone, paso, minutos) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion:  'programar_trigger',
        phone:   phone,
        paso:    paso,
        minutos: minutos,
        webhook: 'https://invisible-a-soberana.josuecalderon.lat/api/whatsapp'
      })
    });
    const data = await res.json();
    console.log(`Trigger (${paso} en ${minutos}min):`, data.ok ? 'OK' : JSON.stringify(data));
  } catch (err) {
    console.error('programarTrigger error:', err.message);
  }
}

// ════════════════════════════════════════════════════════════════
// FUNCIONES DE ENVÍO
// ════════════════════════════════════════════════════════════════

const WA_BASE = () => `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
const WA_HDR  = () => ({
  'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
  'Content-Type':  'application/json'
});

async function sendTemplate(to, nombre) {
  const number = to.replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'template',
      template: {
        name: 'bienvenida_pacto_soberana', language: { code: 'es_MX' },
        components: [{ type: 'body', parameters: [{ type: 'text', parameter_name: 'firstname', text: nombre }] }]
      }
    })
  });
  const data = await res.json();
  console.log(`Template → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}

async function sendWhatsApp(to, message) {
  const number = to.replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'text', text: { body: message }
    })
  });
  const data = await res.json();
  console.log(`WA → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}

async function sendButtons(to, body, buttons) {
  const number = to.replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'interactive',
      interactive: {
        type: 'button', body: { text: body },
        action: { buttons: buttons.map(b => ({ type: 'reply', reply: { id: b.id, title: b.title } })) }
      }
    })
  });
  const data = await res.json();
  console.log(`Buttons → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}

async function sendUrlButton(to, body, buttonText, url) {
  const number = to.replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'interactive',
      interactive: {
        type: 'cta_url', body: { text: body },
        action: { name: 'cta_url', parameters: { display_text: buttonText, url } }
      }
    })
  });
  const data = await res.json();
  console.log(`UrlBtn → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}
