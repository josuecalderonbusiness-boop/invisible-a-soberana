// scripts/borrar-compras-masterclass.js — borra TODAS las compras registradas en
// masterclass_compras. Uso puntual: limpiar datos de prueba antes de un test real de punta a punta.
//
// Uso: node --env-file=.env.local scripts/borrar-compras-masterclass.js
import { getToken, fsDelete } from '../api/_lib/firestore-rest.js';

const PROJECT = 'soberana-app';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

async function listarIds() {
  const token = await getToken();
  let pageToken = null;
  const ids = [];

  do {
    const url = new URL(`${BASE}/masterclass_compras`);
    url.searchParams.set('pageSize', '100');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();

    for (const doc of data.documents || []) {
      ids.push(doc.name.split('/').pop());
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return ids;
}

async function main() {
  const ids = await listarIds();
  if (ids.length === 0) {
    console.log('No hay nada que borrar.');
    return;
  }
  console.log(`Borrando ${ids.length} documento(s)...`);
  for (const id of ids) {
    await fsDelete('masterclass_compras', id);
    console.log(`- borrado: ${id}`);
  }
  console.log('Listo.');
}

main().catch(err => {
  console.error('Error al borrar:', err.message);
  process.exit(1);
});
