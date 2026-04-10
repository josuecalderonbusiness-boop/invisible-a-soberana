// api/instagram.js — Webhook de Instagram (Meta)
//
// VARIABLES DE ENTORNO:
//   INSTAGRAM_VERIFY_TOKEN  — soberana_ig_2026
//   INSTAGRAM_TOKEN         — token de acceso de la cuenta (agregar después)
//   INSTAGRAM_ACCOUNT_ID    — ID de la cuenta de Instagram (agregar después)

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
    console.log('Instagram webhook POST recibido:', JSON.stringify(req.body, null, 2));

    const entries = req.body?.entry || [];

    for (const entry of entries) {
      const changes = entry.changes || [];

      for (const change of changes) {
        const field = change.field;
        const value = change.value;

        if (field === 'comments') {
          // Alguien comentó en un post/reel
          console.log('Evento: comment', JSON.stringify(value));
          // TODO: enviar DM de respuesta
        }

        else if (field === 'follows') {
          // Alguien nuevo siguió la cuenta
          console.log('Evento: follow', JSON.stringify(value));
          // TODO: enviar DM de bienvenida
        }

        else {
          console.log(`Evento no manejado: field="${field}"`, JSON.stringify(value));
        }
      }
    }

    // Siempre 200 para que Meta no desconecte el webhook
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
