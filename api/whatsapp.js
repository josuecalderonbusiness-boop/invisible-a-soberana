// ─────────────────────────────────────────────────────────────
// WhatsApp API Handler · invisible-a-soberana
// Josué Calderón · josuecalderon.lat
//
// Este archivo hace DOS cosas:
// 1. Recibe mensajes entrantes de WhatsApp (webhook de Meta)
// 2. Envía mensajes desde Orbit (POST con { to, message, type })
// ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {

  // ── Cabeceras CORS para que Orbit pueda llamar este endpoint ──
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ────────────────────────────────────────────────────────────
  // GET — Verificación del webhook con Meta
  // ────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      console.log('Webhook verificado ✅');
      return res.status(200).send(challenge);
    } else {
      return res.status(403).json({ error: 'Token inválido' });
    }
  }

  // ────────────────────────────────────────────────────────────
  // POST — Dos usos:
  //   A) Meta nos envía mensajes entrantes (body.object === 'whatsapp_business_account')
  //   B) Orbit nos pide enviar un mensaje ({ to, message, type })
  // ────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body;

    // ── B) Envío desde Orbit ──────────────────────────────────
    // Si el body tiene 'to' y 'message', es una petición de Orbit
    if (body.to && body.message) {
      try {
        const { to, message, type } = body;
        const result = await sendMessage(to, message, type || 'texto');

        if (result.error) {
          return res.status(400).json({ error: result.error.message, details: result.error });
        }

        return res.status(200).json({
          success: true,
          messageId: result.messages?.[0]?.id,
          to
        });

      } catch (error) {
        console.error('Error enviando desde Orbit:', error);
        return res.status(500).json({ error: error.message });
      }
    }

    // ── A) Webhook entrante de Meta ───────────────────────────
    if (body.object !== 'whatsapp_business_account') {
      return res.status(404).json({ error: 'Not WhatsApp' });
    }

    try {
      const messages = body.entry?.[0]?.changes?.[0]?.value?.messages;

      if (messages && messages.length > 0) {
        const message  = messages[0];
        const from     = message.from;
        const text     = message.text?.body?.toLowerCase() || '';
        console.log(`Mensaje de ${from}: ${text}`);

        // ── Respuestas automáticas (ramas) ──
        if (text.includes('acabo de comprar') || text.includes('bienvenida')) {
          await sendMessage(from, `¡Bienvenida! 🎉 Aquí tienes tu acceso al Workshop Código Soberana.\n\nEn los próximos días te acompaño. Estás en el lugar correcto. 💛`);

        } else if (text === 'info') {
          await sendMessage(from, `Hola 👋 Soy Josué Calderón.\n\nCódigo Soberana ayuda a mujeres a cambiar las dinámicas de su relación sin esperar que su pareja cambie primero.\n\nEscribe "quiero" para saber más.`);
        }
      }

      return res.status(200).json({ status: 'ok' });

    } catch (error) {
      console.error('Error procesando webhook:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ─────────────────────────────────────────────────────────────
// Función interna para enviar mensajes
// ─────────────────────────────────────────────────────────────
async function sendMessage(to, message, type = 'texto') {
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const token   = process.env.WHATSAPP_TOKEN;

  // Limpiar el número (quitar espacios y +)
  const cleanTo = to.replace(/\s+/g, '').replace(/^\+/, '');

  let messageBody = {};

  if (type === 'audio' && message.startsWith('http')) {
    messageBody = { type: 'audio', audio: { link: message } };

  } else if (type === 'imagen' && message.startsWith('http')) {
    messageBody = { type: 'image', image: { link: message } };

  } else if (type === 'video' && message.startsWith('http')) {
    messageBody = { type: 'video', video: { link: message } };

  } else {
    // Texto (default)
    messageBody = { type: 'text', text: { body: message, preview_url: false } };
  }

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${phoneId}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type:    'individual',
        to:                cleanTo,
        ...messageBody
      })
    }
  );

  const data = await res.json();
  console.log('WhatsApp API response:', JSON.stringify(data));
  return data;
}
