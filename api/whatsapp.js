// api/whatsapp.js — Arquitectura híbrida v3
// Botones: procesados directamente en Vercel (inmediato)
// Textos libres: guardados en Sheets para Apps Script
// Triggers: siempre via Sheets

// ════════════════════════════════════════════════════════════════
// MEDIA IDs
// ════════════════════════════════════════════════════════════════
const AUDIO_DIA2_TERMINO = '1620415032329794';
const AUDIO_DIA2_NO_VIO  = '2362093030941177';
const VIDEO_DIA4_A       = '1507744617738426';
const VIDEO_DIA4_B       = '976614471691735';
const AUDIO_DIA6         = '4265678347083267';

export default async function handler(req, res) {

  // ── GET: verificación webhook Meta ──────────────────────────────
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Forbidden' });
  }

  // ── POST: trigger desde Apps Script ─────────────────────────────
  if (req.method === 'POST' && req.body?.trigger === true) {
    const { phone, paso, nombre } = req.body;
    console.log(`Trigger: phone=${phone} paso=${paso}`);
    await ejecutarPaso(String(phone), paso, nombre || '');
    return res.status(200).json({ ok: true });
  }

  // ── POST: webhook entrante Meta ──────────────────────────────────
  if (req.method === 'POST' && req.body?.object === 'whatsapp_business_account') {
    const entry    = req.body.entry?.[0]?.changes?.[0]?.value;
    const messages = entry?.messages;
    if (!messages?.length) return res.status(200).json({ ok: true });

    const msg  = messages[0];
    const tipo = msg.type || '';
    const phone = '+' + msg.from;

    // ── BOTONES → procesar inmediato en Vercel ──────────────────
    if (tipo === 'interactive' || tipo === 'button') {
      const msgId = msg.id || '';

      // Anti-duplicado rápido via Sheets
      if (msgId) {
        const dup = await verificarDuplicado(msgId);
        if (dup) {
          console.log(`Duplicado ignorado: ${msgId}`);
          return res.status(200).json({ ok: true });
        }
      }

      const btnId = tipo === 'interactive'
        ? (msg.interactive?.button_reply?.id || '').toLowerCase()
        : (msg.button?.payload || msg.button?.text || '').toLowerCase();
      const btnTx = tipo === 'interactive'
        ? (msg.interactive?.button_reply?.title || '').toLowerCase()
        : (msg.button?.text || '').toLowerCase();

      console.log(`Botón: id="${btnId}" tx="${btnTx}"`);

      // Responder 200 a Meta primero
      res.status(200).json({ ok: true });

      // Procesar botón con await
      await manejarBoton(phone, btnId, btnTx);
      return;
    }

    // ── TEXTOS → guardar en Sheets para Apps Script ─────────────
    if (tipo === 'text') {
      const msgId = msg.id || '';
      const texto = (msg.text?.body || '').trim();

      // Guardar en Sheets
      await guardarEnSheets({
        msgId, phone, tipo, texto,
        btnId: '', btnTx: '',
        timestamp: new Date().toISOString()
      });

      console.log(`Texto guardado en Sheets: "${texto.substring(0,30)}"`);
      return res.status(200).json({ ok: true });
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(200).json({ ok: true });
}

// ════════════════════════════════════════════════════════════════
// ANTI-DUPLICADO
// ════════════════════════════════════════════════════════════════
async function verificarDuplicado(msgId) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return false;
  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'verificar_duplicado', msgId }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    const data = await res.json();
    return data.duplicado === true;
  } catch {
    return false;
  }
}

// ════════════════════════════════════════════════════════════════
// GUARDAR TEXTO EN SHEETS
// ════════════════════════════════════════════════════════════════
async function guardarEnSheets(data) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'guardar_mensaje_entrante', ...data })
    });
  } catch (err) {
    console.error('guardarEnSheets error:', err.message);
  }
}

// ════════════════════════════════════════════════════════════════
// MANEJAR BOTONES — procesamiento inmediato
// ════════════════════════════════════════════════════════════════
async function manejarBoton(phone, btnId, btnTx) {
  // No buscamos contacto al inicio — evita delay
  // El nombre se obtiene solo cuando es necesario
  const nombre = '';
  const n      = 'amiga';

  // ── DÍA 0 — Botones de bienvenida ───────────────────────────
  if (btnTx.includes('pude') || btnTx.includes('ya pude')) {
    await sendUrlButton(phone,
      `Tu herramienta de trabajo ya está lista. 🛠️\n\nAquí vas a registrar tus respuestas del Workshop, activar tus recordatorios y aplicar cada palanca a tu ritmo.\n\n👇 Descárgala antes de empezar.`,
      'Ver herramienta', 'https://soberana-app.josuecalderon.lat'
    );
    await sendUrlButton(phone,
      `Únete también a la comunidad privada.\n\nAhí publico perspectiva masculina directa, casos reales y cosas que no digo en ningún otro lado.\n\nSolo para compradoras. 👇`,
      'Unirme ahora', 'https://chat.whatsapp.com/BqxkKzCjlFj5RdX7MYOJi2'
    );
    await programarTrigger(phone, 'confirmacion_comunidad', 1, n);
  }

  else if (btnTx.includes('no he') || btnTx.includes('podido')) {
    await guardarEstadoSheets(phone, 'esperando_correo_soporte');
    await sendWhatsApp(phone,
      `Tranquila. Lo resolvemos ahora. 🙏\n\n` +
      `1️⃣ Busca en *spam* o *promociones* un correo de Hotmart\n\n` +
      `2️⃣ El correo viene de noreply@hotmart.com\n\n` +
      `3️⃣ Si no aparece — escríbeme tu correo aquí mismo y te reenvío el acceso en menos de 24 horas.`
    );
  }

  // ── DÍA 0 — Confirmación comunidad ──────────────────────────
  else if (btnId === 'comunidad_si') {
    await sendButtons(phone,
      `Ya tienes todo lo que necesitas. 🎯\n\nAhora solo falta una cosa: ver el Workshop completo. Sin saltar partes.\n\nHay un momento en el segundo módulo que lo cambia todo. Cuando llegues ahí — vas a saber exactamente de qué hablo.\n\n¿Cuándo vas a verlo?`,
      [
        { id: 'workshop_hoy',    title: '🔥 Hoy mismo' },
        { id: 'workshop_semana', title: '📅 Esta semana' },
        { id: 'workshop_nose',   title: '🤔 Aún no sé' }
      ]
    );
  }

  else if (btnId === 'comunidad_no') {
    await sendUrlButton(phone,
      `Toca el enlace y únete antes de empezar el Workshop.\n\nLa comunidad es parte de tu acceso.`,
      'Unirme ahora', 'https://chat.whatsapp.com/BqxkKzCjlFj5RdX7MYOJi2'
    );
    await programarTrigger(phone, 'confirmacion_comunidad', 1, n);
  }

  // ── DÍA 0 — Encargo ─────────────────────────────────────────
  else if (btnId === 'workshop_hoy') {
    await programarTrigger(phone, 'dia2_no_vio', 2, n);
    await sendWhatsApp(phone,
      `Perfecto. 💪\n\nCuando termines el Workshop — escríbeme:\n*Ya tengo el código*\n\nNos vemos adentro.`
    );
  }

  else if (btnId === 'workshop_semana') {
    await programarTrigger(phone, 'dia2_no_vio', 2, n);
    await sendWhatsApp(phone,
      `Bien. 📅\n\nCuando lo termines — escríbeme:\n*Ya tengo el código*\n\nTe escribo en unos días.`
    );
  }

  else if (btnId === 'workshop_nose') {
    await programarTrigger(phone, 'dia2_no_vio', 2, n);
    await sendWhatsApp(phone,
      `Sin problema. 🙏\n\nCuando lo termines — escríbeme:\n*Ya tengo el código*\n\nAquí estaré.`
    );
  }

  // ── DÍA 2 — Plantilla ────────────────────────────────────────
  else if (btnId === 'dia2_termino' || btnTx.includes('ya lo termin') || btnTx.includes('termin')) {
    await cancelarTrigger(phone, 'dia2_no_vio');
    await programarTrigger(phone, 'dia4_reflexion', 5, n);
    await sendWhatsApp(phone, `Muy bien ${n}, te diré algo 👇`);
    await sendAudio(phone, AUDIO_DIA2_TERMINO);
  }

  else if (btnId === 'dia2_no_vio' || btnTx.includes('aún no') || btnTx.includes('aun no')) {
    await programarTrigger(phone, 'dia4_reflexion', 5, n);
    await sendWhatsApp(phone, `Entonces ${n}, hay algo que debes escuchar 👇`);
    await sendAudio(phone, AUDIO_DIA2_NO_VIO);
  }

  // ── DÍA 4 — Plantilla ────────────────────────────────────────
  else if (btnId === 'dia4_si_cuento' || btnTx.includes('quiero contarte')) {
    await programarTrigger(phone, 'dia6_audio', 5, n);
    await guardarEstadoSheets(phone, 'esperando_dia4');
    await sendWhatsApp(phone,
      `Estoy aquí.\n\nCuando quieras — escríbeme lo que notaste. No hay prisa. 👇`
    );
  }

  else if (btnId === 'dia4_otra_ocasion' || btnTx.includes('te cuento en otra') || btnTx.includes('otra ocasi')) {
    await programarTrigger(phone, 'dia6_audio', 5, n);
    await sendWhatsApp(phone, `Entonces quiero que escuches esto 👇 ${n}`);
    await sendVideo(phone, VIDEO_DIA4_B);
  }

  // ── DÍA 6 — Plantilla ────────────────────────────────────────
  else if (btnId === 'dia6_escuchar' || btnTx.includes('escuchar mensaje') || btnTx.includes('escuchar')) {
    await sendAudio(phone, AUDIO_DIA6);
  }

  else {
    console.log(`Botón no reconocido: id="${btnId}" tx="${btnTx}"`);
  }
}

// ════════════════════════════════════════════════════════════════
// PASOS — llamados desde Apps Script via trigger
// ════════════════════════════════════════════════════════════════
async function ejecutarPaso(phone, paso, nombre) {
  console.log(`Paso: ${paso} para ${phone} (${nombre})`);
  const n = nombre || 'amiga';

  if (paso === 'bienvenida') {
    await sendTemplate(phone, n, 'bienvenida_pacto_soberana');
  }
  else if (paso === 'confirmacion_comunidad') {
    await sendButtons(phone, '¿Lograste unirte a la comunidad?', [
      { id: 'comunidad_si', title: '✅ Ya estoy dentro' },
      { id: 'comunidad_no', title: '⏳ Aún no' }
    ]);
  }
  else if (paso === 'dia2_no_vio') {
    await programarTrigger(phone, 'dia4_reflexion', 5, n);
    await sendTemplateDia2(phone, n);
  }
  else if (paso === 'dia4_reflexion') {
    await programarTrigger(phone, 'dia6_audio', 6, n);
    await sendTemplateDia4(phone, n);
  }
  else if (paso === 'dia4_video_a') {
    await sendWhatsApp(phone, `Ok, escúchame esto 👇 ${n}`);
    await sendVideo(phone, VIDEO_DIA4_A);
  }
  else if (paso === 'dia6_audio') {
    await sendTemplateDia6(phone, n);
  }
  else if (paso === 'soporte_acceso') {
    await sendWhatsApp(phone,
      `Tranquila. Lo resolvemos ahora. 🙏\n\n` +
      `1️⃣ Busca en *spam* o *promociones* un correo de Hotmart\n\n` +
      `2️⃣ El correo viene de noreply@hotmart.com\n\n` +
      `3️⃣ Si no aparece — escríbeme tu correo aquí mismo.`
    );
  }
  else if (paso === 'confirmar_correo_soporte') {
    // nombre aquí es el correo que escribió
    await sendWhatsApp(phone, `Recibí tu correo. ✅\n\nVoy a reenviar tu acceso en las próximas horas.\n\nSi en 24 horas no llega — escríbeme de nuevo aquí.`);
    await notificarSoporte(phone, nombre, '');
  }
  else if (paso === 'dia2_termino') {
    await programarTrigger(phone, 'dia4_reflexion', 5, n);
    await sendWhatsApp(phone, `Muy bien ${n}, te diré algo 👇`);
    await sendAudio(phone, AUDIO_DIA2_TERMINO);
  }
  else if (paso === 'dia2_no_vio_confirmado') {
    await programarTrigger(phone, 'dia4_reflexion', 5, n);
    await sendWhatsApp(phone, `Entonces ${n}, hay algo que debes escuchar 👇`);
    await sendAudio(phone, AUDIO_DIA2_NO_VIO);
  }
}

// ════════════════════════════════════════════════════════════════
// PROGRAMAR TRIGGER EN SHEETS
// ════════════════════════════════════════════════════════════════
async function programarTrigger(phone, paso, minutos, nombre) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return;
  const fechaEjecucion = new Date(Date.now() + minutos * 60 * 1000).toISOString();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'guardar_trigger_sheets',
        phone, paso, nombre: nombre || '',
        fechaEjecucion,
        webhook: 'https://invisible-a-soberana.josuecalderon.lat/api/whatsapp'
      })
    });
    const data = await res.json();
    console.log(`Trigger (${paso} en ${minutos}min):`, data.ok ? 'OK' : JSON.stringify(data));
  } catch (err) {
    console.error('programarTrigger error:', err.message);
  }
}

async function cancelarTrigger(phone, paso) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'cancelar_trigger', phone, paso })
    });
  } catch (err) {
    console.error('cancelarTrigger error:', err.message);
  }
}

async function guardarEstadoSheets(phone, estado) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'guardar_estado', phone, estado })
    });
  } catch (err) {
    console.error('guardarEstadoSheets error:', err.message);
  }
}

// ════════════════════════════════════════════════════════════════
// BUSCAR CONTACTO
// ════════════════════════════════════════════════════════════════
async function buscarContacto(phone) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return null;
  try {
    const tel = phone.replace(/[^0-9]/g, '').slice(-10);
    const res = await fetch(`${url}?accion=buscar_por_telefono&telefono=${tel}`);
    const data = await res.json();
    return data.ok ? data : null;
  } catch { return null; }
}

// ════════════════════════════════════════════════════════════════
// FUNCIONES DE ENVÍO
// ════════════════════════════════════════════════════════════════
const WA_BASE = () => `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
const WA_HDR  = () => ({
  'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
  'Content-Type':  'application/json'
});

async function sendTemplate(to, nombre, templateName) {
  const number = String(to).replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'template',
      template: {
        name: templateName, language: { code: 'es_MX' },
        components: [{ type: 'body', parameters: [{ type: 'text', parameter_name: 'firstname', text: nombre }] }]
      }
    })
  });
  const data = await res.json();
  console.log(`Template ${templateName} → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}

async function sendTemplateDia2(to, nombre) {
  const number = String(to).replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'template',
      template: {
        name: 'dia2_workshop_cs', language: { code: 'es_MX' },
        components: [
          { type: 'body', parameters: [{ type: 'text', parameter_name: 'firstname', text: nombre }] },
          { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: 'dia2_termino' }] },
          { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: 'dia2_no_vio' }] }
        ]
      }
    })
  });
  const data = await res.json();
  console.log(`Template día 2 → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}

async function sendTemplateDia4(to, nombre) {
  const number = String(to).replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'template',
      template: {
        name: 'dia4b_reflexion_cs', language: { code: 'es_MX' },
        components: [
          { type: 'body', parameters: [{ type: 'text', parameter_name: 'firstname', text: nombre }] },
          { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: 'dia4_si_cuento' }] },
          { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: 'dia4_otra_ocasion' }] }
        ]
      }
    })
  });
  const data = await res.json();
  console.log(`Template día 4 → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}

async function sendTemplateDia6(to, nombre) {
  const number = String(to).replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'template',
      template: {
        name: 'dia6_audio_cs', language: { code: 'es_MX' },
        components: [
          { type: 'body', parameters: [{ type: 'text', parameter_name: 'firstname', text: nombre }] },
          { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: 'dia6_escuchar' }] }
        ]
      }
    })
  });
  const data = await res.json();
  console.log(`Template día 6 → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}

async function sendWhatsApp(to, message) {
  const number = String(to).replace(/[^0-9]/g, '');
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
  const number = String(to).replace(/[^0-9]/g, '');
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
  const number = String(to).replace(/[^0-9]/g, '');
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

async function sendAudio(to, mediaId) {
  const number = String(to).replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'audio',
      audio: { id: mediaId }
    })
  });
  const data = await res.json();
  console.log(`Audio → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}

async function sendVideo(to, mediaId) {
  const number = String(to).replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'video',
      video: { id: mediaId }
    })
  });
  const data = await res.json();
  console.log(`Video → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}

async function notificarSoporte(phone, correoCliente, nombre) {
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Código Soberana', email: 'soporte@josuecalderon.lat' },
        to: [{ email: 'soporte@josuecalderon.lat' }],
        subject: '⚠️ Soporte acceso — compradora necesita ayuda',
        htmlContent: `<h2>Compradora necesita reenvío de acceso</h2><p><strong>Nombre:</strong> ${nombre||'No disponible'}</p><p><strong>WhatsApp:</strong> <a href="https://wa.me/${String(phone).replace(/[^0-9]/g,'')}">Escribirle aquí</a></p><p><strong>Correo:</strong> ${correoCliente}</p><p><strong>Acción:</strong> Buscar en Hotmart y reenviar acceso.</p>`
      })
    });
    console.log('Soporte notificado ✓');
  } catch (err) {
    console.error('notificarSoporte error:', err.message);
  }
}
