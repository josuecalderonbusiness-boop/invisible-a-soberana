export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      console.log('Webhook verificado ✅');
      return res.status(200).send(challenge);
    } else {
      return res.status(403).json({ error: 'Token inválido' });
    }
  }

  if (req.method === 'POST') {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') {
      return res.status(404).json({ error: 'Not WhatsApp' });
    }
    try {
      const messages = body.entry?.[0]?.changes?.[0]?.value?.messages;
      if (messages && messages.length > 0) {
        const message = messages[0];
        const from = message.from;
        const text = message.text?.body?.toLowerCase() || '';
        console.log(`Mensaje de ${from}: ${text}`);
        if (text.includes('acabo de comprar') || text.includes('bienvenida')) {
          await sendMessage(from, `¡Bienvenida! 🎉 Aquí tienes tu acceso al Workshop Código Soberana.\n\nEn los próximos días te acompaño. Estás en el lugar correcto. 💛`);
        } else if (text === 'info') {
          await sendMessage(from, `Hola 👋 Soy Josué Calderón.\n\nCódigo Soberana ayuda a mujeres a cambiar las dinámicas de su relación sin esperar que su pareja cambie primero.\n\nEscribe "quiero" para saber más.`);
        }
      }
      return res.status(200).json({ status: 'ok' });
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

async function sendMessage(to, text) {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text }
      })
    }
  );
  const data = await res.json();
  console.log('WhatsApp response:', JSON.stringify(data));
  return data;
}
