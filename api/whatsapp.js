// api/whatsapp.js — Versión Final Pacto Soberana (Corrección de Envío)
export default async function handler(req, res) {

  // 1. Verificación Webhook Meta (GET)
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Forbidden' });
  }

  // 2. Recepción de Mensajes (POST)
  if (req.method === 'POST' && req.body?.object === 'whatsapp_business_account') {
    try {
      const entry = req.body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const messages = value?.messages;

      if (!messages?.length) return res.status(200).json({ ok: true });

      const msg   = messages[0];
      const phone = msg.from; 
      const text  = msg.text?.body || '';

      // Lógica de activación por palabras clave
      const esBienvenida = text.toLowerCase().includes('acabo de comprar') || 
                           text.toLowerCase().includes('comunidad vip') ||
                           text.toLowerCase().includes('soberana');

      if (esBienvenida) {
        // Búsqueda de la compradora en Brevo
        let contacto = await buscarPorHotmartPhone(phone);
        if (!contacto) contacto = await buscarCompradoraSinSMS();

        const nombreReal = contacto?.attributes?.FIRSTNAME || contacto?.attributes?.VORNAME || "Soberana";
        const email = contacto?.email || 'sin-match@soberana';
        
        // ENVÍO DE PLANTILLA APROBADA
        await sendWhatsAppTemplate(phone, "bienvenida_pacto_soberana", nombreReal);

        // Registro en Google Sheets
        await guardarEnSheets({
          fecha: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
          nombre: nombreReal,
          email: email,
          whatsapp: phone,
          mensaje: `Plantilla Enviada | ${text.substring(0, 30)}`
        });
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Error en el proceso:', err.message);
      return res.status(200).json({ ok: true });
    }
  }
}

// FUNCIÓN DE ENVÍO: Corrige número e idioma
async function sendWhatsAppTemplate(to, templateName, nameValue) {
  // Meta requiere el número sin el símbolo '+'
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
            // Cambiado a 'es' para evitar errores de región si Meta no reconoce es_MX
            language: { code: 'es' }, 
            components: [{
              type: 'body',
              parameters: [{
                type: 'text',
                parameter_name: 'firstname', // Coincide con tu corrección en la imagen
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
    console.error('Error sendWhatsAppTemplate:', err);
    return false;
  }
}

// --- FUNCIONES DE APOYO (Mantienen tu lógica original) ---

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
