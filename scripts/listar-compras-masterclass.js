// scripts/listar-compras-masterclass.js — lista los correos y teléfonos ya registrados en
// masterclass_compras, para poder elegir datos que no colisionen al hacer una compra de prueba.
//
// Uso: node --env-file=.env.local scripts/listar-compras-masterclass.js
import { getToken } from '../api/_lib/firestore-rest.js';

const PROJECT = 'soberana-app';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

function fromValueEntry(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  return null;
}

async function listarTodas() {
  const token = await getToken();
  let pageToken = null;
  const filas = [];

  do {
    const url = new URL(`${BASE}/masterclass_compras`);
    url.searchParams.set('pageSize', '100');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();

    for (const doc of data.documents || []) {
      const f = doc.fields || {};
      filas.push({
        docId: doc.name.split('/').pop(),
        email: fromValueEntry(f.email),
        telefono: fromValueEntry(f.telefono),
        producto: fromValueEntry(f.producto),
        correo1_estado: fromValueEntry(f.correo1_estado),
        bienvenida_estado: fromValueEntry(f.bienvenida_estado)
      });
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return filas;
}

listarTodas().then(filas => {
  if (filas.length === 0) {
    console.log('No hay ninguna compra registrada todavía en masterclass_compras.');
    return;
  }
  console.log(`${filas.length} compra(s) registrada(s):\n`);
  for (const f of filas) {
    console.log(`- ${f.email}  |  tel: ${f.telefono}  |  producto: ${f.producto}  |  correo1: ${f.correo1_estado || '—'}  |  bienvenida: ${f.bienvenida_estado || '—'}`);
  }
}).catch(err => {
  console.error('Error al listar compras:', err.message);
  process.exit(1);
});
