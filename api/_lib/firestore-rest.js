// api/_lib/firestore-rest.js — helper compartido de acceso a Firestore vía REST + GoogleAuth.
//
// Mismo patrón ya usado en mi-espacio-login.js / mi-espacio-apuntes.js / _lib/programa.js,
// centralizado acá para no repetir getToken()/conversión de campos en cada archivo nuevo
// del sistema de Login (Fase 3, subfase 3.1).

const PROJECT = 'soberana-app';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

let cachedAuth = null;

async function getToken() {
  if (!cachedAuth) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    const { google } = await import('googleapis');
    cachedAuth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/datastore']
    });
  }
  return cachedAuth.getAccessToken();
}

function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'object') return { mapValue: { fields: toFields(v) } };
  throw new Error(`toValue: tipo no soportado (${typeof v})`);
}

function toFields(obj) {
  const fields = {};
  for (const k of Object.keys(obj)) fields[k] = toValue(obj[k]);
  return fields;
}

function fromValueEntry(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return parseInt(v.integerValue, 10);
  if ('doubleValue' in v) return v.doubleValue;
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  return null;
}

function fromFields(fields) {
  const obj = {};
  for (const k in fields || {}) obj[k] = fromValueEntry(fields[k]);
  return obj;
}

async function fsGet(coleccion, docId) {
  const token = await getToken();
  const res = await fetch(`${BASE}/${coleccion}/${encodeURIComponent(docId)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.fields ? fromFields(data.fields) : null;
}

// Escribe el documento completo. Con exigirNoExiste=true falla si el documento ya existe
// (precondición atómica de Firestore) — es la base de la unicidad de Cuenta por correo.
async function fsSet(coleccion, docId, datos, { exigirNoExiste = false, exigirExiste = false } = {}) {
  const token = await getToken();
  const params = new URLSearchParams();
  if (exigirNoExiste) params.set('currentDocument.exists', 'false');
  if (exigirExiste) params.set('currentDocument.exists', 'true');
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${BASE}/${coleccion}/${encodeURIComponent(docId)}${qs}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFields(datos) })
  });
  if (!res.ok) {
    let cuerpo = null;
    try {
      cuerpo = await res.json();
    } catch {
      // respuesta sin cuerpo JSON — se ignora, err.status ya alcanza para diagnosticar
    }
    const err = new Error(`Firestore fsSet falló: ${res.status}`);
    err.status = res.status;
    err.firestoreStatus = cuerpo?.error?.status || null;
    err.firestoreMessage = cuerpo?.error?.message || null;
    throw err;
  }
  return true;
}

// Actualiza solo los campos indicados (updateMask), sin tocar el resto del documento.
async function fsUpdate(coleccion, docId, datos, { exigirExiste = true } = {}) {
  const token = await getToken();
  const params = new URLSearchParams();
  for (const k of Object.keys(datos)) params.append('updateMask.fieldPaths', k);
  if (exigirExiste) params.set('currentDocument.exists', 'true');
  const res = await fetch(`${BASE}/${coleccion}/${encodeURIComponent(docId)}?${params.toString()}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFields(datos) })
  });
  if (!res.ok) {
    const err = new Error(`Firestore fsUpdate falló: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return true;
}

async function fsDelete(coleccion, docId) {
  const token = await getToken();
  await fetch(`${BASE}/${coleccion}/${encodeURIComponent(docId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
}

export { getToken, fsGet, fsSet, fsUpdate, fsDelete };
