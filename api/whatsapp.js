// api/whatsapp.js — Edge Runtime con waitUntil

export const config = { runtime: 'edge' };

export default async function handler(req) {

  // ── GET: verificación webhook Meta ──────────────────────────────
  if (req.method === 'GET') {
    const url    = new URL(req.url);
    const mode   = url.searchParams.get('hub.mode');
    const token  = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  const body = await req.json();

  // ── POST: trigger programado desde Apps Script ───────────────────
  if (body?.trigger === true) {
    const { phone, paso } = body;
    console.log(`Trigger: phone=${phone} paso=${paso}`);
    await ejecutarPaso(phone, paso);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  // ── POST desde Orbit: envío manual ──────────────────────────────
  if (body?.to && body?.message) {
    const sent = await sendWhatsApp(body.to, body.message);
    return new Response(JSON.stringify({ ok: sent }), { status: sent ? 200 : 500 });
  }

  // ── POST: webhook entrante Meta ──────────────────────────────────
  if (body?.object === 'whatsapp_business_account') {
    // Responder 200 inmediato a Meta
    const response = new Response(JSON.stringify({ ok: true }), { status: 200 });

    // Usar waitUntil para procesar después de responder
    const ctx = { waitUntil: (p) => p };
    try {
      // En Edge Runtime el contexto tiene waitUntil nativo
      // Procesamos directamente — Edge tiene 30s de tiempo
      await procesarMensaje(body);
    } catch (err) {
      console.error('Error procesando:', err.message);
    }

    return response;
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

// ════════════════════════════════════════════════════════════════
// PROCESAMIENTO PRINCIPAL
// ════════════════════════════════════════════════════════════════

async function procesarMensaje(body) {
  const entry    = body.entry?.[0]?.changes?.[0]?.value;
  const messages = entry?.messages;
  if (!messages?.length) return;

  const msg   = messages[0];
  const msgId = msg.id || '';
  const phone = '+' + msg.from;
  const text  = (msg.text?.body || '').toLowerCase().trim();
  const tipo  = msg.type;

  // Anti-duplicado via Apps Script
  if (msgId) {
    const duplicado = await verificarYMarcar(msgId);
    if (duplicado) {
      console.log(`Duplicado ignorado: ${msgId}`);
      return;
    }
  }

  console.log(`=== Mensaje WA de ${phone} [${tipo}]: "${text}" ===`);

  if (tipo === 'interactive') {
    const btnId = msg.interactive?.button_reply?.id || '';
    console.log(`Botón interactivo: id=${btnId}`);
    await manejarBotonInteractivo(phone, btnId);
    return;
  }

  if (tipo === 'button') {
    const btnTx = msg.button?.text || '';
    console.log(`Botón plantilla: "${btnTx}"`);
    await manejarBotonPlantilla(phone, btnTx);
    return;
  }

  const esBienvenida =
    text.includes('acabo de comprar') ||
    text.includes('comunidad vip') ||
    text.includes('soberana');

  if (!esBienvenida) {
    console.log('Mensaje no reconocido');
    return;
  }

  const contacto = await buscarEnSheetsPorTelefono(phone);
  const nombre   = contacto?.nombre || 'amiga';
  const email    = contacto?.email  || 'sin-match@soberana';
  console.log(`Contacto: ${email} (${nombre})`);
  await sendTemplate(phone, nombre);
}

// ════════════════════════════════════════════════════════════════
// ANTI-DUPLICADO
// ════════════════════════════════════════════════════════════════

async function verificarYMarcar(msgId) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return false;
  try {
    const res  = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'verificar_mensaje', msgId })
    });
    const data = await res.json();
    return data.duplicado === true;
  } catch (err) {
    console.error('verificarYMarcar error:', err.message);
    return false;
  }
}

// ════════════════════════════════════════════════════════════════
// BOTONES
// ════════════════════════════════════════════════════════════════

async function manejarBotonPlantilla(phone, boton) {
  const b = boton.toLowerCase();
  if (b.includes('pude') || b.includes('si')) {
    await sendUrlButton(phone,
      `Tu herramienta de trabajo ya está lista. 🛠️\n\nAquí vas a registrar tus respuestas del Workshop, activar tus recordatorios y aplicar cada palanca a tu ritmo.\n\n👇 Descárgala antes de empezar.`,
      'Ver herramienta', 'https://soberana-app.josuecalderon.lat'
    );
    await sendUrlButton(phone,
      `Únete también a la comunidad privada.\n\nAhí publico perspectiva masculina directa, casos reales y cosas que no digo en ningún otro lado.\n\nSolo para compradoras. 👇`,
      'Unirme ahora', 'https://chat.whatsapp.com/BqxkKzCjlFj5RdX7MYOJi2'
    );
    await programarTrigger(phone, 'confirmacion_comunidad', 3);
  } else if (b.includes('podido') || b.includes('no he')) {
    await sendWhatsApp(phone,
      `Tranquila. Lo resolvemos ahora. 🙏\n\n1️⃣ Busca en *spam* o *promociones* un correo de Hotmart\n\n2️⃣ El correo viene de noreply@hotmart.com\n\n3️⃣ Si no aparece — respóndeme con tu correo y te reenvío el acceso.`
    );
  }
}

async function manejarBotonInteractivo(phone, btnId) {
  if (btnId === 'comunidad_si') {
    await sendButtons(phone,
      `Ya tienes todo lo que necesitas. 🎯\n\nAhora solo falta una cosa: ver el Workshop completo. Sin saltar partes.\n\nHay un momento en el segundo módulo que lo cambia todo. Cuando llegues ahí — vas a saber exactamente de qué hablo.\n\n¿Cuándo vas a verlo?`,
      [
        { id: 'workshop_hoy',    title: '🔥 Hoy mismo' },
        { id: 'workshop_semana', title: '📅 Esta semana' },
        { id: 'workshop_nose',   title: '🤔 Aún no sé' }
      ]
    );
  } else if (btnId === 'comunidad_no') {
    await sendUrlButton(phone,
      `Toca el enlace y únete antes de empezar el Workshop.\n\nLa comunidad es parte de tu acceso.`,
      'Unirme ahora', 'https://chat.whatsapp.com/BqxkKzCjlFj5RdX7MYOJi2'
    );
    await programarTrigger(phone, 'confirmacion_comunidad', 3);
  } else if (btnId === 'workshop_hoy') {
    await sendWhatsApp(phone, `Perfecto. 💪\n\nCuando termines — escríbeme aquí. Una sola palabra.\n\nNos vemos adentro.`);
  } else if (btnId === 'workshop_semana') {
    await sendWhatsApp(phone, `Bien. Te escribo en unos días. 📅\n\nCuando lo veas — escríbeme.`);
  } else if (btnId === 'workshop_nose') {
    await sendWhatsApp(phone, `Sin problema. Aquí estaré. 🙏\n\nCuando estés lista — el Workshop te espera.`);
  }
}

async function ejecutarPaso(phone, paso) {
  if (paso === 'confirmacion_comunidad') {
    await sendButtons(phone, '¿Lograste unirte a la comunidad?', [
      { id: 'comunidad_si', title: '✅ Sí, ya estoy dentro' },
      { id: 'comunidad_no', title: '⏳ Aún no' }
    ]);
  }
}

// ════════════════════════════════════════════════════════════════
// SHEETS
// ════════════════════════════════════════════════════════════════

async function buscarEnSheetsPorTelefono(phone) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return null;
  try {
    const tel = phone.replace(/[^0-9]/g, '').slice(-10);
    const res = await fetch(`${url}?accion=buscar_por_telefono&telefono=${tel}`);
    const data = await res.json();
    return data.ok ? data : null;
  } catch (err) { return null; }
}

async function programarTrigger(phone, paso, minutos) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'programar_trigger', phone, paso, minutos,
        webhook: 'https://invisible-a-soberana.josuecalderon.lat/api/whatsapp'
      })
    });
  } catch (err) { console.error('programarTrigger error:', err.message); }
}

// ════════════════════════════════════════════════════════════════
// ENVÍOS
// ════════════════════════════════════════════════════════════════

const WA_URL = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
const WA_HEADERS = () => ({
  'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
  'Content-Type': 'application/json'
});

async function sendTemplate(to, nombre) {
  const number = to.replace(/[^0-9]/g, '');
  const res = await fetch(WA_URL, {
    method: 'POST', headers: WA_HEADERS(),
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
  const res = await fetch(WA_URL, {
    method: 'POST', headers: WA_HEADERS(),
    body: JSON.stringify({ messaging_product: 'whatsapp', to: number, type: 'text', text: { body: message } })
  });
  const data = await res.json();
  console.log(`WA → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}

async function sendButtons(to, body, buttons) {
  const number = to.replace(/[^0-9]/g, '');
  const res = await fetch(WA_URL, {
    method: 'POST', headers: WA_HEADERS(),
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
  const res = await fetch(WA_URL, {
    method: 'POST', headers: WA_HEADERS(),
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
