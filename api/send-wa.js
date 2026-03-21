// api/send-wa.js
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const auth = req.headers['authorization'];
  if (auth !== 'Bearer soberana2026orbit') return res.status(401).json({ error: 'No autorizado' });

  const { to, message } = req.body;
  if (!to || !message) return res.status(400).json({ error: 'Faltan campos: to, message' });

  const phone = to.replace(/[^0-9]/g, '');
  if (phone.length < 10) return res.status(400).json({ error: 'Número inválido: ' + to });

  const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
  const TOKEN = process.env.WHATSAPP_TOKEN;

  if (!PHONE_ID || !TOKEN) return res.status(500).json({ error: 'Variables de entorno no configuradas' });

  try {
    const waRes = await fetch(
      `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TOKEN}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phone,
          type: 'text',
          text: { preview_url: false, body: message },
        }),
      }
    );

    const data = await waRes.json();
    if (!waRes.ok || data.error) return res.status(400).json({ error: 'Error de WhatsApp API', detail: data.error || data });

    return res.status(200).json({ success: true, message_id: data.messages?.[0]?.id, to: phone });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
