// api/_lib/programa.js — acceso mínimo a Firestore para Programa y Edición.
//
// "Programa" es la identidad permanente del catálogo (DR-006): lo que la
// persona compra conceptualmente, nunca cambia. "Edición" es el ciclo de
// venta de un Programa (BORRADOR→LIVE→REPLAY→EVERGREEN) — normalmente una
// sola por Programa (DR-006: sin relanzamientos recurrentes).
//
// Aislado a propósito de api/_lib/orbit-domain.js (el "Orbit viejo" sobre
// Firestore, ver auditoría MVP 2.1 / 2026-07-31): no se importa ni se
// reutiliza ese módulo aquí.
//
// Colecciones Firestore:
//   - programas/{programa_id}  → { programa_id, edicion_activa_para_compra }
//   - ediciones/{edicion_id}   → { edicion_id, programa_id, estado }
// Ambos documentos se seedean a mano — este módulo solo lee.

const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/soberana-app/databases/(default)/documents';

async function getToken() {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const { google } = await import('googleapis');
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/datastore']
  });
  return auth.getAccessToken();
}

function fromFirestoreFields(fields) {
  const obj = {};
  for (const k in fields || {}) {
    obj[k] = 'stringValue' in fields[k] ? fields[k].stringValue : null;
  }
  return obj;
}

async function fsGet(token, coleccion, docId) {
  const res = await fetch(`${FIRESTORE_BASE}/${coleccion}/${encodeURIComponent(docId)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.fields ? fromFirestoreFields(data.fields) : null;
}

// Conversación 1 (DR-006/DR-007): "para este Programa, ¿cuál es la Edición vigente para una compra nueva?"
async function resolverEdicion(programaId) {
  const token = await getToken();
  const programa = await fsGet(token, 'programas', programaId);
  const edicionId = programa?.edicion_activa_para_compra || null;
  if (!edicionId) return { disponible: false, edicion_id: null };

  // Igual que antes con Experiencia (ajuste aprobado 2026-07-31): no basta con
  // que el Programa apunte a un id — hay que confirmar que esa Edición existe.
  const edicion = await fsGet(token, 'ediciones', edicionId);
  if (!edicion) return { disponible: false, edicion_id: null };

  return { disponible: true, edicion_id: edicionId };
}

// Conversación 2 (DR-006/DR-007): "¿cuál es el estado actual de esta Edición?"
async function obtenerEstado(edicionId) {
  const token = await getToken();
  const doc = await fsGet(token, 'ediciones', edicionId);
  return doc?.estado || null;
}

// Autenticación mínima del MVP (DR-002: "solución temporal, no arquitectura definitiva").
function autenticado(req) {
  const secreto = req.headers['x-orbit-secret'];
  return !!process.env.ORBIT_SHARED_SECRET && secreto === process.env.ORBIT_SHARED_SECRET;
}

export { resolverEdicion, obtenerEstado, autenticado };
