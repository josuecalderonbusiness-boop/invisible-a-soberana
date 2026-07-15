// api/mi-espacio-apuntes.js — lee/guarda los apuntes de una masterclase comprada.
// Mismo motivo que api/mi-espacio-login.js: el cliente no tiene permiso directo sobre
// colecciones nuevas de Firestore, así que este endpoint usa la cuenta de servicio.

async function getToken() {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const { google } = await import('googleapis');
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/datastore']
  });
  return auth.getAccessToken();
}

function docUrl(email, producto) {
  const docId = `${email}__${producto}`;
  return `https://firestore.googleapis.com/v1/projects/soberana-app/databases/(default)/documents/masterclass_apuntes/${encodeURIComponent(docId)}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const token = await getToken();

    if (req.method === 'GET') {
      const email = (req.query.email || '').trim().toLowerCase();
      const producto = req.query.producto || '';
      if (!email || !producto) return res.status(400).json({ error: 'faltan parámetros' });

      const fsRes = await fetch(docUrl(email, producto), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!fsRes.ok) return res.status(200).json({ ok: true, texto: '' });
      const data = await fsRes.json();
      return res.status(200).json({ ok: true, texto: data.fields?.texto?.stringValue || '' });
    }

    if (req.method === 'POST') {
      const { email, producto, texto } = req.body || {};
      if (!email || !producto) return res.status(400).json({ error: 'faltan parámetros' });

      await fetch(docUrl(String(email).trim().toLowerCase(), producto), {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            email: { stringValue: String(email).trim().toLowerCase() },
            producto: { stringValue: producto },
            texto: { stringValue: texto || '' },
            fecha: { stringValue: new Date().toISOString() }
          }
        })
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error('mi-espacio-apuntes error:', err.message);
    return res.status(200).json({ ok: false });
  }
}
