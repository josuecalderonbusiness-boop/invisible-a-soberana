// api/mi-espacio-login.js — busca las masterclasses activas de un correo en Firestore.
// El cliente (public/mi-espacio) no puede consultar Firestore directamente: las reglas de
// seguridad no cubren colecciones nuevas como masterclass_compras. Este endpoint usa la misma
// cuenta de servicio que ya usa api/hotmart-webhook.js para escribir, evitando depender de que
// alguien configure reglas de seguridad nuevas en la consola de Firebase.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const email = (req.body?.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'email inválido' });

  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    const { google } = await import('googleapis');
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/datastore']
    });
    const token = await auth.getAccessToken();

    const url = 'https://firestore.googleapis.com/v1/projects/soberana-app/databases/(default)/documents:runQuery';
    const body = {
      structuredQuery: {
        from: [{ collectionId: 'masterclass_compras' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              { fieldFilter: { field: { fieldPath: 'email' }, op: 'EQUAL', value: { stringValue: email } } },
              { fieldFilter: { field: { fieldPath: 'activo' }, op: 'EQUAL', value: { booleanValue: true } } }
            ]
          }
        }
      }
    };
    const fsRes = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const rows = await fsRes.json();

    const compras = (Array.isArray(rows) ? rows : [])
      .filter(r => r.document)
      .map(r => {
        const f = r.document.fields || {};
        return {
          producto: f.producto?.stringValue || '',
          nombre: f.nombre?.stringValue || '',
          fecha: f.fecha?.stringValue || ''
        };
      });

    return res.status(200).json({ ok: true, compras });
  } catch (err) {
    console.error('mi-espacio-login error:', err.message);
    return res.status(200).json({ ok: false, compras: [] });
  }
}
