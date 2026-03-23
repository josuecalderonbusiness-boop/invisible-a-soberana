// api/whatsapp.js — Versión Unificada y Corregida
export default async function handler(req, res) {

  // 1. Verificación Webhook (GET)
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  // 2. Recepción de Mensajes (POST)
  if (req.method === 'POST') {
    try {
      const entry = req.body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const messages = value?.messages;

      if (!messages || messages.length === 0) {
        return res.status(200).json({ ok: true });
      }

      const msg = messages[0];
      const phone = msg.from; 
      const text = msg.text?.body || '';

      const esBienvenida = text.toLowerCase().includes('acabo de comprar') || 
                           text.toLowerCase().includes('comunidad vip') ||
                           text.toLowerCase().includes('soberana');

      if (esBienvenida) {
        // Estas funciones ahora SÍ están definidas abajo
        let contacto = await buscarPorHotmartPhone(phone);
        if (!contacto) contacto = await buscarCompradoraSinSMS();

        const nombreReal = contacto?.attributes?.FIRSTNAME || contacto?.attributes?.VORNAME || "Soberana";
        const email = contacto?.email || 'sin-match@soberana';

        // Envío de plantilla con idioma 'es' (más compatible)
        const enviado = await sendWhatsAppTemplate(phone, "bienvenida_pacto_soberana", nombreReal);

        await guardarEnSheets({
          fecha: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
          nombre: nombreReal,
          email: email,
          whatsapp: phone,
          mensaje: enviado ? "Plantilla Enviada ✅" : "Error al enviar Plantilla ❌"
        });
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Error General:', err.message);
      return res.status(200).json({ ok: true });
    }
  }
}

// --- FUNCIÓN DE ENVÍO DE PLANTILLA ---
async function sendWhatsAppTemplate(to, templateName, nameValue) {
  const cleanNumber = to.replace(/\D/g, ''); 
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
          to: cleanNumber,
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'es' }, 
            components: [{
              type: 'body',
              parameters: [{
                type: 'text',
                text: nameValue
              }]
            }]
          }
        })
      }
    );
    const data = await res.json();
    console.log(`Respuesta Meta (${cleanNumber}):`, JSON.stringify(data));
    return !!data.messages;
  } catch (err) {
    console.error('Error sendWhatsAppTemplate:', err.message);
    return false;
  }
}

// --- FUNCIONES DE APOYO (BREVO Y SHEETS) ---

async function buscarPorHotmartPhone(phone) {
  try {
    const url = `https://api.brevo.com/v3/contacts?limit=50&listId=11&sort=desc`;
    const res = await fetch(url, { headers: { 'api-key': process.env.BREVO_KEY } });
    if (!res.ok) return null;
    const data = await res.json();
    const phoneNorm = (phone || '').replace(/[^\d]/g, '').slice(-10);
    return (data.contacts || []).find(c => {
      const hp = (c.attributes?.HOTMART_PHONE || '').replace(/[^\d]/g, '').slice(-10);
      const sms = (c.attributes?.SMS || '').replace(/[^\d]/g, '').slice(-10);
      return (hp && hp === phoneNorm) || (sms && sms === phoneNorm);
    }) || null;
  } catch (err) { return null; }
}

async function buscarCompradoraSinSMS() {
  try {
    const url = `https://api.brevo.com/v3/contacts?limit=50&listId=11&sort=desc`;
    const res = await fetch(url, { headers: { 'api-key': process.env.BREVO_KEY } });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.contacts || []).find(c => !c.attributes?.SMS) || null;
  } catch (err) { return null; }
}

async function guardarEnSheets(data) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.ok;
  } catch (err) { return false; }
}
