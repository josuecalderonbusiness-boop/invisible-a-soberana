export default async function handler(req, res) {

  // 1. Verificación del Webhook (GET) - Esto resuelve el error 403
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // Asegúrate de que WHATSAPP_VERIFY_TOKEN en Vercel sea IGUAL al que pusiste en Meta
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  // 2. Recepción de Mensajes (POST)
  if (req.method === 'POST') {
    try {
      const value = req.body.entry?.[0]?.changes?.[0]?.value;
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
        // Búsqueda en Brevo
        let contacto = await buscarPorHotmartPhone(phone);
        if (!contacto) contacto = await buscarCompradoraSinSMS();

        const nombreReal = contacto?.attributes?.FIRSTNAME || contacto?.attributes?.VORNAME || "Soberana";
        const email = contacto?.email || 'sin-match@soberana';

        // ENVÍO DE PLANTILLA (Tag: firstname)
        await sendWhatsAppTemplate(phone, "bienvenida_pacto_soberana", nombreReal);

        // Registro en Sheets
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
      console.error('Error:', err.message);
      return res.status(200).json({ ok: true });
    }
  }
}

// Función de envío mejorada
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
                parameter_name: 'firstname', // Tag corregido
                text: nameValue
              }]
            }]
          }
        })
      }
    );
    const data = await res.json();
    console.log('Respuesta Meta:', JSON.stringify(data));
    return !!data.messages;
  } catch (err) {
    return false;
  }
}

// --- MANTÉN TUS FUNCIONES ORIGINALES AQUÍ ABAJO (buscarPorHotmartPhone, etc.) ---
