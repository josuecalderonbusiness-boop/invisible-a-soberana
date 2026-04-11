// api/messenger.js — Webhook de Messenger / Facebook Page (Meta)
//
// VARIABLES DE ENTORNO:
//   MESSENGER_VERIFY_TOKEN  — soberana_messenger_2026
//   MESSENGER_TOKEN         — token de página de Facebook
//   SHEETS_WEBHOOK_URL      — endpoint de registro en Sheets

async function sendMessage(recipientId, message) {
  const res = await fetch(
    'https://graph.facebook.com/v21.0/me/messages',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MESSENGER_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ recipient: { id: recipientId }, message })
    }
  );
  const data = await res.json();
  console.log('Messenger send:', JSON.stringify(data));
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
  console.log('MESSENGER HIT - method:', req.method);
  console.log('MESSENGER BODY:', JSON.stringify(req.body));
  console.log('MESSENGER HEADERS:', JSON.stringify(req.headers));

  // ── GET: verificación webhook Meta ──────────────────────────────
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': verifyToken, 'hub.challenge': challenge } = req.query;

    if (mode === 'subscribe' && verifyToken === process.env.MESSENGER_VERIFY_TOKEN) {
      console.log('Messenger webhook verificado ✓');
      return res.status(200).send(challenge);
    }
    console.warn(`Messenger webhook: verificación fallida. token recibido="${verifyToken}"`);
    return res.status(403).json({ error: 'Forbidden' });
  }

  // ── POST: eventos entrantes de Messenger ────────────────────────
  if (req.method === 'POST') {
    console.log('Messenger POST recibido. object:', req.body?.object);
    console.log('Body completo:', JSON.stringify(req.body, null, 2));

    const body = req.body;
    if (body.object !== 'page') {
      console.log('Ignorado — object no es page:', body.object);
      return res.status(200).json({ ok: true });
    }

    for (const entry of body.entry || []) {
      // EVENTO A — Comentario en post de Facebook
      for (const change of entry.changes || []) {
        console.log(`Procesando change: field="${change.field}"`, JSON.stringify(change.value));

        if (change.field === 'feed' && change.value?.item === 'comment') {
          const senderId = change.value?.from?.id;
          const text = change.value?.message || '';
          console.log(`Comentario de senderId=${senderId}: "${text}"`);
          if (!senderId || !text.toLowerCase().includes('soberana')) {
            console.log('Comentario ignorado — sin keyword o sin senderId');
            continue;
          }
          if (!canSend(senderId)) {
            console.log(`Anti-dup: ya enviado DM a ${senderId} recientemente`);
            continue;
          }

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
            body: JSON.stringify({ sheet: 'MESSENGER_LEADS', fecha: new Date().toISOString(), senderId, tipo: 'comentario_keyword' })
          }).catch(console.error);
        }

        // EVENTO B — Nuevo seguidor de página
        if (change.field === 'feed' && change.value?.item === 'like' && change.value?.verb === 'add') {
          // Page likes llegan como item=like verb=add
          const senderId = change.value?.from?.id;
          console.log(`Nuevo seguidor/like senderId=${senderId}`);
          if (!senderId) continue;
          if (!canSend(senderId)) {
            console.log(`Anti-dup: ya enviado DM a ${senderId} recientemente`);
            continue;
          }

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
            body: JSON.stringify({ sheet: 'MESSENGER_LEADS', fecha: new Date().toISOString(), senderId, tipo: 'nuevo_seguidor' })
          }).catch(console.error);
        }
      }

      // Mensajes directos entrantes (para futura extensión)
      for (const messaging of entry.messaging || []) {
        console.log('Messaging event:', JSON.stringify(messaging));
      }
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
