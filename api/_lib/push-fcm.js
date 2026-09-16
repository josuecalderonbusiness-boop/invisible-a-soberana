// api/_lib/push-fcm.js — Puerta 5, Estación 9A (transporte Push)
//
// Corrección 2026-09-16: reescrito para reutilizar la convención YA
// EXISTENTE de este repo (FIREBASE_SERVICE_ACCOUNT + googleapis GoogleAuth
// + REST — la misma que ya usan whatsapp.js, _lib/orbit-domain.js y
// _lib/firestore-rest.js), en vez de firebase-admin + una credencial nueva.
// firebase-admin sigue existiendo solo en functions/ (Firebase Cloud
// Functions, despliegue aparte con su propia inicialización ADC).
//
// Firestore (leer/borrar dispositivos_push/{correo}/tokens/*): reutiliza
// getToken()/fsDelete() de firestore-rest.js tal cual — el listado de una
// subcolección completa no existía ahí (nadie lo necesitaba hasta ahora),
// así que se agrega aquí con el mismo estilo fetch+Authorization.
//
// FCM (enviar el Push en sí): no tenía equivalente en firestore-rest.js.
// Usa la API HTTP v1 oficial (POST .../v1/projects/{project}/messages:send,
// una llamada por token — v1 no tiene endpoint de multicast nativo), con
// su propio scope OAuth (firebase.messaging, distinto de datastore) sobre
// una instancia de GoogleAuth separada, misma cuenta de servicio.

import { getToken as getFirestoreToken, fsDelete } from './firestore-rest.js';

const PROJECT = 'soberana-app';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const FCM_SEND_URL = `https://fcm.googleapis.com/v1/projects/${PROJECT}/messages:send`;
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

let cachedFcmAuth = null;

function credencialesConfiguradas() {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT);
}

async function getFcmToken() {
  if (!cachedFcmAuth) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    const { google } = await import('googleapis');
    cachedFcmAuth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: [FCM_SCOPE]
    });
  }
  return cachedFcmAuth.getAccessToken();
}

// Lista dispositivos_push/{correo}/tokens/* — Firestore REST devuelve
// {documents:[{name:'.../tokens/<id>', fields:{...}}]} para un GET de
// colección (sin docId final). No existía en firestore-rest.js (solo tiene
// fsGet de un documento puntual); mismo estilo que el resto de ese archivo.
async function listarDispositivos(correo) {
  const token = await getFirestoreToken();
  const res = await fetch(`${FIRESTORE_BASE}/dispositivos_push/${encodeURIComponent(correo)}/tokens`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data.documents)) return [];
  return data.documents.map((doc) => ({ id: doc.name.split('/').pop() }));
}

// Códigos de error de FCM HTTP v1 (distintos de los de firebase-admin:
// v1 no usa strings tipo 'messaging/registration-token-not-registered',
// sino error.details[].errorCode con @type FcmError).
const CODIGOS_TOKEN_INVALIDO = ['UNREGISTERED', 'INVALID_ARGUMENT'];

function extraerErrorCode(cuerpoError) {
  const detalles = (cuerpoError && cuerpoError.details) || [];
  const detalleFcm = detalles.find((d) => typeof d['@type'] === 'string' && d['@type'].includes('FcmError'));
  return detalleFcm ? detalleFcm.errorCode : null;
}

async function enviarUnPush(tokenAcceso, fcmToken, data) {
  const res = await fetch(FCM_SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenAcceso}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token: fcmToken,
        data,
        android: { priority: 'high' },
        webpush: { headers: { Urgency: 'high' } }
      }
    })
  });
  if (res.ok) return { success: true };
  const cuerpo = await res.json().catch(() => null);
  return { success: false, errorCode: extraerErrorCode(cuerpo && cuerpo.error) };
}

/**
 * Envía un Push a todos los dispositivos registrados de un correo (data-only,
 * mismo criterio que el sistema legado). Nunca lanza — degrada a
 * {ok:false, motivo}. Limpia únicamente tokens inválidos de
 * dispositivos_push/{correo}/tokens — jamás toca tokens/{email} (legado).
 */
async function enviarPushACorreo({ correo, titulo, cuerpo, url, tag, tipo }) {
  if (!credencialesConfiguradas()) {
    return { ok: false, motivo: 'firebase_no_configurado' };
  }

  let dispositivos;
  try {
    dispositivos = await listarDispositivos(correo);
  } catch (e) {
    return { ok: false, motivo: 'firestore_no_disponible' };
  }
  if (dispositivos.length === 0) {
    return { ok: true, enviadas: 0 };
  }

  let tokenAcceso;
  try {
    tokenAcceso = await getFcmToken();
  } catch (e) {
    return { ok: false, motivo: 'firebase_credenciales_invalidas' };
  }

  const data = {
    tipo: tipo || 'orbit',
    title: titulo,
    body: cuerpo,
    tag: tag || tipo || 'orbit',
    url: url || '/workbook/',
    icon: '/workbook/icon-192.png',
    badge: '/workbook/icon-192.png'
  };

  const resultados = await Promise.all(
    dispositivos.map((d) => enviarUnPush(tokenAcceso, d.id, data))
  );

  const invalidos = [];
  let enviadas = 0;
  resultados.forEach((r, i) => {
    if (r.success) { enviadas++; return; }
    if (CODIGOS_TOKEN_INVALIDO.includes(r.errorCode)) invalidos.push(dispositivos[i].id);
  });

  if (invalidos.length > 0) {
    await Promise.all(invalidos.map((id) => fsDelete(`dispositivos_push/${correo}/tokens`, id)));
  }

  return { ok: true, enviadas };
}

export { enviarPushACorreo, credencialesConfiguradas };
