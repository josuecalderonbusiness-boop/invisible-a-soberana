// api/instagram.js — Webhook de Instagram (Meta)
//
// VARIABLES DE ENTORNO:
//   INSTAGRAM_VERIFY_TOKEN  — soberana_ig_2026
//   INSTAGRAM_TOKEN         — token de acceso de la cuenta
//   INSTAGRAM_ACCOUNT_ID    — ID de la cuenta de Instagram
//   SHEETS_WEBHOOK_URL      — endpoint de registro en Sheets

async function sendMessage(recipientId, message) {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${process.env.INSTAGRAM_ACCOUNT_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.INSTAGRAM_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ recipient: { id: recipientId }, message })
    }
  );
  const data = await res.json();
  console.log('Instagram send:', JSON.stringify(data));
  return data;
}

const recentDMs = new Map();
function canSend(userId) {
  const last = recentDMs.get(userId);
  const now = Date.now();
  if (last && now - last < 3600000) return false;
  recentDMs.set(userId, now);
  return true;
}

export default async function handler(req, res) {

  // ── GET: verificación webhook Meta ──────────────────────────────
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': verifyToken, 'hub.challenge': challenge } = req.query;

    if (mode === 'subscribe' && verifyToken === process.env.INSTAGRAM_VERIFY_TOKEN) {
      console.log('Instagram webhook verificado ✓');
      return res.status(200).send(challenge);
    }
    console.warn(`Instagram webhook: verificación fallida. token recibido="${verifyToken}"`);
    return res.status(403).json({ error: 'Forbidden' });
  }

  // ── POST: eventos entrantes de Instagram ────────────────────────
  if (req.method === 'POST') {
    // Responde 200 inmediatamente
    res.status(200).end();

    const body = req.body;
    if (body.object !== 'instagram') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {

        // EVENTO A — Comentario con palabra clave
        if (change.field === 'comments') {
          const senderId = change.value?.from?.id;
          const text = change.value?.text || '';
          if (!senderId || !text.toLowerCase().includes('soberana')) continue;
          if (!canSend(senderId)) continue;

          await sendMessage(senderId, { text: 'Hola 👋 Vi que comentaste — aquí está lo que pediste.' });
          await sendMessage(senderId, {
            attachment: {
              type: 'template',
              payload: {
                template_type: 'generic',
                elements: [{
                  title: 'Descubre tu perfil de pareja',
                  subtitle: 'Un quiz de 3 minutos que te dice exactamente qué está pasando en tu relación.',
                  buttons: [{ type: 'web_url', url: 'https://invisible-a-soberana.josuecalderon.lat', title: 'Quiero verlo 👉' }]
                }]
              }
            }
          });

          await fetch(process.env.SHEETS_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sheet: 'INSTAGRAM_LEADS', fecha: new Date().toISOString(), senderId, tipo: 'comentario_keyword' })
          }).catch(console.error);
        }

        // EVENTO B — Nuevo seguidor
        if (change.field === 'follows') {
          const senderId = change.value?.id;
          if (!senderId) continue;
          if (!canSend(senderId)) continue;

          await sendMessage(senderId, { text: 'Hola 👋 Gracias por seguirme.' });
          await sendMessage(senderId, {
            attachment: {
              type: 'template',
              payload: {
                template_type: 'generic',
                elements: [{
                  title: 'Tengo algo para ti',
                  subtitle: 'Un quiz gratis de 3 minutos que te dice exactamente qué está pasando en tu relación.',
                  buttons: [{ type: 'web_url', url: 'https://invisible-a-soberana.josuecalderon.lat', title: 'Quiero verlo 👉' }]
                }]
              }
            }
          });

          await fetch(process.env.SHEETS_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sheet: 'INSTAGRAM_LEADS', fecha: new Date().toISOString(), senderId, tipo: 'nuevo_seguidor' })
          }).catch(console.error);
        }
      }
    }

    return;
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
