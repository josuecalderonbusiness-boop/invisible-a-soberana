// api/_lib/push-fcm.js — Puerta 5, Estación 9A (transporte Push).
//
// Único lugar de invisible-a-soberana que inicializa Firebase Admin para
// ENVIAR Push. Deliberadamente separado de todo lo demás que ya toca
// Firebase en este repo:
//   - El SDK cliente (compat, cargado en /workbook) usa la config PÚBLICA
//     del proyecto, nunca credenciales de servicio.
//   - functions/index.js (Firebase Cloud Functions, proyecto aparte) tiene
//     su propia inicialización automática (ADC del runtime de Functions).
// Este módulo es exclusivamente el puente Orbit->FCM vía Vercel — nunca se
// reutiliza para nada del sistema legado de functions/.
//
// Requiere credenciales de servicio (nunca las públicas del SDK cliente),
// leídas de FIREBASE_SERVICE_ACCOUNT_JSON (el JSON completo de la service
// account, como string, variable de Vercel — la MISMA cuenta de servicio
// que ya usan functions/ y los scripts locales de prueba, serviceAccountKey.json,
// nunca una credencial nueva). Sin esa variable, credencialesConfiguradas()
// es false y nunca se intenta inicializar ni llamar a nada.
//
// Puerta 5, Estación 9A (diseño cerrado 2026-09-17): la relación
// Persona->dispositivos vive en dispositivos_push/{correoNormalizado}/tokens/{token}
// — NUNCA en tokens/{email} (colección legada, intacta, nunca leída ni
// escrita desde aquí). El correo, nunca un persona_id de Orbit, es la
// única identidad que cruza la frontera Orbit->Mi Espacio (mismo principio
// que ya rige el resto de los puentes: Zoom, replay, WhatsApp).

let appInicializada = false;

function credencialesConfiguradas() {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
}

function obtenerAdmin() {
  // eslint-disable-next-line global-require
  const admin = require('firebase-admin');
  if (!appInicializada && !admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  appInicializada = true;
  return admin;
}

const CODIGOS_TOKEN_INVALIDO = [
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
];

/**
 * Envía un Push a TODOS los dispositivos registrados de un correo. Nunca
 * lanza — degrada a {ok:false, motivo}. Limpia únicamente los tokens
 * inválidos de dispositivos_push/{correo}/tokens — jamás toca tokens/{email}.
 * @param {{correo: string, titulo: string, cuerpo: string, url?: string, tag?: string, tipo?: string}} datos
 */
async function enviarPushACorreo({ correo, titulo, cuerpo, url, tag, tipo }) {
  if (!credencialesConfiguradas()) {
    return { ok: false, motivo: 'firebase_no_configurado' };
  }

  let admin;
  try {
    admin = obtenerAdmin();
  } catch (e) {
    return { ok: false, motivo: 'firebase_credenciales_invalidas' };
  }

  const db = admin.firestore();
  const messaging = admin.messaging();

  const snap = await db.collection('dispositivos_push').doc(correo).collection('tokens').get();
  if (snap.empty) {
    return { ok: true, enviadas: 0 };
  }

  const dispositivos = snap.docs.map((d) => ({ id: d.id, token: (d.data() && d.data().token) || d.id }));

  const mensaje = {
    data: {
      tipo: tipo || 'orbit',
      title: titulo,
      body: cuerpo,
      tag: tag || tipo || 'orbit',
      url: url || '/workbook/',
      icon: '/workbook/icon-192.png',
      badge: '/workbook/icon-192.png',
    },
    android: { priority: 'high' },
    webpush: { headers: { Urgency: 'high' } },
  };

  const respuesta = await messaging.sendEachForMulticast({ tokens: dispositivos.map((d) => d.token), ...mensaje });

  const invalidos = [];
  let enviadas = 0;
  respuesta.responses.forEach((r, i) => {
    if (r.success) {
      enviadas++;
      return;
    }
    const codigo = r.error && r.error.code;
    if (CODIGOS_TOKEN_INVALIDO.includes(codigo)) {
      invalidos.push(dispositivos[i].id);
    }
  });

  if (invalidos.length > 0) {
    await Promise.all(
      invalidos.map((id) => db.collection('dispositivos_push').doc(correo).collection('tokens').doc(id).delete())
    );
  }

  return { ok: true, enviadas };
}

module.exports = { enviarPushACorreo, credencialesConfiguradas };
