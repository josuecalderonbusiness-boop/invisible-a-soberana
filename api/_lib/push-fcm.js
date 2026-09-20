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
//
// Varios correos por Persona (2026-09-19, diagnóstico de Push): el token de
// un dispositivo se guarda bajo el correo con el que la mujer inició sesión en
// /workbook (dispositivos_push/{correo}/tokens/{token}) — que puede ser
// cualquiera de los correos de su Persona (registro con A, compra con B...).
// Por eso este puente acepta `correos[]` (además de `correo`, por
// compatibilidad): consulta los tokens de CADA correo, los DEDUPLICA por token
// (el mismo dispositivo registrado bajo A y B recibe UN solo Push) y envía cada
// token una sola vez. Nunca decide quién es la Persona — solo recibe la lista
// ya resuelta por Orbit.

import { getToken as getFirestoreToken, fsDelete } from './firestore-rest.js';

const PROJECT = 'soberana-app';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const FCM_SEND_URL = `https://fcm.googleapis.com/v1/projects/${PROJECT}/messages:send`;
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

// Tope de correos por envío: una Persona real tiene 1-4; el tope evita que una
// lista anormal multiplique las consultas a Firestore.
const MAX_CORREOS = 10;
// Tokens por correo que se leen en una sola página (el listado REST pagina de
// 20 en 20 por defecto). Un correo real tiene 1-3 dispositivos.
const PAGE_SIZE_TOKENS = 100;

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

// Códigos de error de FCM HTTP v1 (distintos de los de firebase-admin:
// v1 no usa strings tipo 'messaging/registration-token-not-registered',
// sino error.details[].errorCode con @type FcmError).
const CODIGOS_TOKEN_INVALIDO = ['UNREGISTERED', 'INVALID_ARGUMENT'];

function extraerErrorCode(cuerpoError) {
  const detalles = (cuerpoError && cuerpoError.details) || [];
  const detalleFcm = detalles.find((d) => typeof d['@type'] === 'string' && d['@type'].includes('FcmError'));
  return detalleFcm ? detalleFcm.errorCode : null;
}

/**
 * Lista de correos a consultar: `correo` (compatibilidad) + `correos[]`,
 * en minúsculas, sin espacios, solo con forma de correo, sin repetidos y con
 * tope MAX_CORREOS. El orden de entrada se conserva (el tope descarta los
 * últimos).
 */
function normalizarCorreos({ correo, correos } = {}) {
  const crudos = [];
  if (correo) crudos.push(correo);
  if (Array.isArray(correos)) crudos.push(...correos);
  const vistos = new Set();
  const lista = [];
  for (const c of crudos) {
    const n = String(c == null ? '' : c).trim().toLowerCase();
    if (!n.includes('@') || vistos.has(n)) continue;
    vistos.add(n);
    lista.push(n);
    if (lista.length >= MAX_CORREOS) break;
  }
  return lista;
}

/**
 * Fábrica con dependencias inyectables (para probar sin red). El uso real es
 * `enviarPushACorreo`, más abajo, creado con las dependencias reales.
 */
function crearEnviadorPush(deps) {
  // Lista dispositivos_push/{correo}/tokens/* — Firestore REST devuelve
  // {documents:[{name:'.../tokens/<id>', fields:{...}}]} para un GET de
  // colección (sin docId final); sin documentos, un objeto sin `documents`
  // (ausencia LEGÍTIMA de dispositivos). Cualquier respuesta no exitosa LANZA:
  // antes se devolvía [] y un fallo de Firestore quedaba idéntico a "sin
  // dispositivos" (enviadas:0, sin señal alguna).
  async function listarDispositivos(correo) {
    const tokenAcceso = await deps.getFirestoreToken();
    const res = await deps.fetch(
      `${FIRESTORE_BASE}/dispositivos_push/${encodeURIComponent(correo)}/tokens?pageSize=${PAGE_SIZE_TOKENS}`,
      { headers: { Authorization: `Bearer ${tokenAcceso}` } }
    );
    if (!res.ok) throw new Error(`firestore_listado_http_${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.documents)) return [];
    return data.documents.map((doc) => doc.name.split('/').pop());
  }

  async function enviarUnPush(tokenAcceso, fcmToken, data) {
    const res = await deps.fetch(FCM_SEND_URL, {
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
   * Envía un Push a todos los dispositivos registrados bajo los correos
   * indicados (data-only, mismo criterio que el sistema legado), UNA vez por
   * token. Nunca lanza — degrada a {ok:false, motivo}:
   *   - firebase_no_configurado / firebase_credenciales_invalidas
   *   - sin_correos (ningún correo válido)
   *   - firestore_no_disponible (no se pudo LEER algún listado: no se envía nada)
   * Sin dispositivos en ningún correo -> {ok:true, enviadas:0} (estado real
   * honesto, no un fallo). Limpia únicamente tokens inválidos de
   * dispositivos_push/{correo}/tokens — jamás toca tokens/{email} (legado).
   */
  async function enviarPushACorreo({ correo, correos, titulo, cuerpo, url, tag, tipo }) {
    if (!deps.credencialesConfiguradas()) {
      return { ok: false, motivo: 'firebase_no_configurado' };
    }

    const lista = normalizarCorreos({ correo, correos });
    if (lista.length === 0) {
      return { ok: false, motivo: 'sin_correos' };
    }

    // Todo o nada: si CUALQUIER listado falla no se envía a nadie — así un
    // reintento posterior no puede duplicar un envío parcial.
    let listados;
    try {
      listados = await Promise.all(lista.map((c) => listarDispositivos(c)));
    } catch (e) {
      return { ok: false, motivo: 'firestore_no_disponible' };
    }

    // token -> correos bajo los que está registrado (deduplicación por token).
    const correosPorToken = new Map();
    listados.forEach((ids, i) => {
      for (const id of ids) {
        if (!correosPorToken.has(id)) correosPorToken.set(id, []);
        correosPorToken.get(id).push(lista[i]);
      }
    });

    if (correosPorToken.size === 0) {
      return { ok: true, enviadas: 0 };
    }

    let tokenAcceso;
    try {
      tokenAcceso = await deps.getFcmToken();
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

    const tokens = [...correosPorToken.keys()];
    const resultados = await Promise.all(tokens.map((t) => enviarUnPush(tokenAcceso, t, data)));

    const invalidos = [];
    let enviadas = 0;
    resultados.forEach((r, i) => {
      if (r.success) { enviadas++; return; }
      if (CODIGOS_TOKEN_INVALIDO.includes(r.errorCode)) invalidos.push(tokens[i]);
    });

    if (invalidos.length > 0) {
      // Un token inválido se retira de TODOS los correos bajo los que estaba.
      const borrados = [];
      for (const t of invalidos) {
        for (const c of correosPorToken.get(t)) {
          borrados.push(deps.fsDelete(`dispositivos_push/${encodeURIComponent(c)}/tokens`, t));
        }
      }
      await Promise.all(borrados);
    }

    return { ok: true, enviadas, dispositivos: tokens.length };
  }

  return { enviarPushACorreo, listarDispositivos };
}

const depsReales = {
  credencialesConfiguradas,
  getFirestoreToken,
  getFcmToken,
  // resuelto en cada llamada (no capturado): permite stubbear global.fetch.
  fetch: (...args) => fetch(...args),
  fsDelete
};

const { enviarPushACorreo } = crearEnviadorPush(depsReales);

export { enviarPushACorreo, credencialesConfiguradas, crearEnviadorPush, normalizarCorreos, MAX_CORREOS };
