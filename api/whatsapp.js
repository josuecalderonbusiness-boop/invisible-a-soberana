// api/whatsapp.js — Arquitectura v2
// Vercel solo recibe y guarda en Sheets. Apps Script procesa todo.

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
    console.log(`Trigger ejecutado: phone=${phone} paso=${paso}`);
    await ejecutarPaso(String(phone), paso, nombre || '');
    return res.status(200).json({ ok: true });
  }

  // ── POST: webhook entrante Meta ──────────────────────────────────
  if (req.method === 'POST' && req.body?.object === 'whatsapp_business_account') {
    const entry    = req.body.entry?.[0]?.changes?.[0]?.value;
    const messages = entry?.messages;

    if (!messages?.length) return res.status(200).json({ ok: true });

    const msg   = messages[0];
    const msgId = msg.id || '';
    const phone = msg.from || '';
    const tipo  = msg.type || '';

    // Extraer texto o botón
    let texto = '';
    let btnId = '';
    let btnTx = '';

    if (tipo === 'text') {
      texto = (msg.text?.body || '').trim();
    } else if (tipo === 'interactive') {
      btnId = msg.interactive?.button_reply?.id || '';
      btnTx = msg.interactive?.button_reply?.title || '';
    } else if (tipo === 'button') {
      btnTx = msg.button?.text || '';
      btnId = msg.button?.payload || btnTx;
    }

    // Guardar en Sheets — responder 200 inmediato
    const saved = await guardarMensajeEnSheets({
      msgId, phone, tipo, texto, btnId, btnTx,
      timestamp: new Date().toISOString()
    });

    console.log(`Mensaje guardado: ${msgId} tipo=${tipo} phone=${phone} saved=${saved}`);
    return res.status(200).json({ ok: true });
  }

  return res.status(200).json({ ok: true });
}

// ════════════════════════════════════════════════════════════════
// GUARDAR MENSAJE EN SHEETS
// ════════════════════════════════════════════════════════════════

async function guardarMensajeEnSheets(data) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'guardar_mensaje_entrante',
        ...data
      })
    });
    return res.ok;
  } catch (err) {
    console.error('guardarMensajeEnSheets error:', err.message);
    return false;
  }
}

// ════════════════════════════════════════════════════════════════
// EJECUTAR PASO — llamado desde Apps Script via trigger
// ════════════════════════════════════════════════════════════════

async function ejecutarPaso(phone, paso, nombre) {
  console.log(`Ejecutando paso: ${paso} para ${phone} (${nombre})`);

  const n = nombre || 'amiga';

  if (paso === 'bienvenida') {
    await sendTemplate(phone, n, 'bienvenida_pacto_soberana');
  }

  else if (paso === 'confirmacion_comunidad') {
    await sendButtons(phone,
      '¿Lograste unirte a la comunidad?',
      [
        { id: 'comunidad_si', title: '✅ Ya estoy dentro' },
        { id: 'comunidad_no', title: '⏳ Aún no' }
      ]
    );
  }

  else if (paso === 'dia2_no_vio') {
    await sendTemplateDia2(phone, n);
  }

  else if (paso === 'dia2_termino') {
    await programarTrigger(phone, 'dia4_reflexion', 5, n);
    await sendWhatsApp(phone, `Muy bien ${n}, te diré algo 👇`);
    await sendAudio(phone, '1620415032329794');
  }

  else if (paso === 'dia2_no_vio_confirmado') {
    await programarTrigger(phone, 'dia4_reflexion', 5, n);
    await sendWhatsApp(phone, `Entonces ${n}, hay algo que debes escuchar 👇`);
    await sendAudio(phone, '2362093030941177');
  }

  else if (paso === 'dia4_reflexion') {
    await programarTrigger(phone, 'dia6_audio', 6, n);
    await sendTemplateDia4(phone, n);
  }

  else if (paso === 'dia4_video_a') {
    await programarTrigger(phone, 'dia6_audio', 5, n);
    await sendWhatsApp(phone, `Ok, escúchame esto 👇 ${n}`);
    await sendVideo(phone, '1507744617738426');
  }

  else if (paso === 'dia4_video_b') {
    await programarTrigger(phone, 'dia6_audio', 5, n);
    await sendWhatsApp(phone, `Entonces quiero que escuches esto 👇 ${n}`);
    await sendVideo(phone, '976614471691735');
  }

  else if (paso === 'dia6_audio') {
    await sendTemplateDia6(phone, n);
  }

  else if (paso === 'respuesta_generica') {
    await sendWhatsApp(phone,
      `Recibí tu mensaje. 🙏\n\nSigue pendiente — en los próximos días te escribo de nuevo.`
    );
  }

  else if (paso === 'soporte_acceso') {
    await sendWhatsApp(phone,
      `Tranquila. Lo resolvemos ahora. 🙏\n\n` +
      `1️⃣ Busca en *spam* o *promociones* un correo de Hotmart\n\n` +
      `2️⃣ El correo viene de noreply@hotmart.com\n\n` +
      `3️⃣ Si no aparece — escríbeme tu correo aquí mismo y te reenvío el acceso en menos de 24 horas.`
    );
  }

  else if (paso === 'confirmar_correo_soporte') {
    // nombre aquí viene siendo el correo que escribió
    await sendWhatsApp(phone, `Recibí tu correo. ✅\n\nVoy a reenviar tu acceso en las próximas horas.\n\nSi en 24 horas no llega — escríbeme de nuevo aquí.`);
    await notificarSoporte(phone, nombre, '');
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
        htmlContent: `
          <h2>Compradora necesita reenvío de acceso</h2>
          <p><strong>Nombre:</strong> ${nombre || 'No disponible'}</p>
          <p><strong>WhatsApp:</strong> <a href="https://wa.me/${String(phone).replace(/[^0-9]/g,'')}">Escribirle aquí</a> (${phone})</p>
          <p><strong>Correo:</strong> ${correoCliente}</p>
          <p><strong>Acción:</strong> Buscar en Hotmart y reenviar acceso.</p>
        `
      })
    });
    console.log('Notificación soporte enviada');
  } catch (err) {
    console.error('notificarSoporte error:', err.message);
  }
}
