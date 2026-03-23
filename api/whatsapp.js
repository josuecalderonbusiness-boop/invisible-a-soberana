// api/whatsapp.js — Versión Final con Plantilla 'bienvenida_pacto_soberana'
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

      // LOGICA DE RESPUESTA A BOTONES O TEXTO
      const esBienvenida = text.toLowerCase().includes('acabo de comprar') || 
                           text.toLowerCase().includes('comunidad vip') ||
                           text.toLowerCase().includes('soberana');

      if (esBienvenida) {
        // BUSQUEDA EN BREVO (Tus funciones originales)
        let contacto = await buscarPorHotmartPhone(phone);
        if (!contacto) contacto = await buscarCompradoraSinSMS();

        const nombreReal = contacto?.attributes?.FIRSTNAME || contacto?.attributes?.VORNAME || "Soberana";
        const email = contacto?.email || 'sin-match@soberana';
        
        // ENVIAR LA PLANTILLA APROBADA
        await sendWhatsAppTemplate(phone, "bienvenida_pacto_soberana", nombreReal);

        // REGISTRAR EN SHEETS
        await guardarEnSheets({
          fecha: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
          nombre: nombreReal,
          email: email,
          whatsapp: phone,
          mensaje: `Plantilla Enviada: ${text.substring(0, 30)}`
        });
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Error:', err.message);
      return res.status(200).json({ ok: true });
    }
  }
}

// FUNCIÓN PARA ENVIAR LA PLANTILLA CON VARIABLE 'firstname'
async function sendWhatsAppTemplate(to, templateName, nameValue) {
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
          to: to,
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'es_MX' }, // El idioma que seleccionaste en Meta
            components: [{
              type: 'body',
              parameters: [{
                type: 'text',
                parameter_name: 'firstname', // El nombre que corregiste
                text: nameValue
              }]
            }]
          }
        })
      }
    );
    const data = await res.json();
    console.log(`Resultado Envío:`, data);
    return !!data.messages;
  } catch (err) {
    console.error('Error sendWhatsAppTemplate:', err);
    return false;
  }
}

// --- ABAJO PEGA TUS FUNCIONES: buscarPorHotmartPhone, buscarCompradoraSinSMS, guardarEnSheets, etc. ---
