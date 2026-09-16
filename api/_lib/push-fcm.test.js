// api/_lib/push-fcm.test.js — Puerta 5, Estación 9A
//
// firebase-admin se stubbea vía require.cache (mismo criterio de necesidad
// que el resto del repo: t.mock.module no es estable en esta versión de
// Node para interceptar imports — ver gap ya documentado en
// orbit-perfil-acceso.test.js/mi-espacio-auth.test.js). push-fcm.js hace
// require('firebase-admin') de forma perezosa dentro de la función, así
// que sembrar require.cache ANTES de llamarla intercepta correctamente,
// sin necesitar mock.module.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const FIREBASE_ADMIN_PATH = require.resolve('firebase-admin');

function stubFirebaseAdmin(fakeAdmin) {
  require.cache[FIREBASE_ADMIN_PATH] = { id: FIREBASE_ADMIN_PATH, filename: FIREBASE_ADMIN_PATH, loaded: true, exports: fakeAdmin };
}

function restaurarFirebaseAdmin() {
  delete require.cache[FIREBASE_ADMIN_PATH];
}

// Recargar push-fcm.js fresco en cada test (para resetear su cache interno
// `appInicializada`) — se limpia también su propia entrada de require.cache.
const PUSH_FCM_PATH = require.resolve('./push-fcm.js');
function cargarPushFcmFresco() {
  delete require.cache[PUSH_FCM_PATH];
  return require('./push-fcm.js');
}

test('credencialesConfiguradas: false sin FIREBASE_SERVICE_ACCOUNT_JSON', () => {
  const original = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  try {
    const { credencialesConfiguradas } = cargarPushFcmFresco();
    assert.equal(credencialesConfiguradas(), false);
  } finally {
    if (original !== undefined) process.env.FIREBASE_SERVICE_ACCOUNT_JSON = original;
  }
});

test('enviarPushACorreo: sin FIREBASE_SERVICE_ACCOUNT_JSON -> ok:false, nunca intenta inicializar firebase-admin', async () => {
  const original = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  let seLlamoAdmin = false;
  stubFirebaseAdmin({ get apps() { seLlamoAdmin = true; return []; } });
  try {
    const { enviarPushACorreo } = cargarPushFcmFresco();
    const r = await enviarPushACorreo({ correo: 'alumna@correo.com', titulo: 'x', cuerpo: 'y' });
    assert.deepEqual(r, { ok: false, motivo: 'firebase_no_configurado' });
    assert.equal(seLlamoAdmin, false);
  } finally {
    restaurarFirebaseAdmin();
    if (original !== undefined) process.env.FIREBASE_SERVICE_ACCOUNT_JSON = original;
  }
});

function fakeAdminConFirestore({ tokensDocs, sendEachForMulticastImpl }) {
  const eliminados = [];
  const tokensCollection = {
    get: async () => ({
      empty: tokensDocs.length === 0,
      docs: tokensDocs.map((t) => ({ id: t.id, data: () => ({ token: t.token }) })),
    }),
    doc: (id) => ({
      delete: async () => { eliminados.push(id); },
    }),
  };
  const admin = {
    apps: [],
    credential: { cert: (x) => x },
    initializeApp: () => { admin.apps.push({}); },
    firestore: () => ({
      collection: (nombre) => {
        assert.equal(nombre, 'dispositivos_push');
        return {
          doc: (correo) => ({
            collection: (sub) => {
              assert.equal(sub, 'tokens');
              return tokensCollection;
            },
          }),
        };
      },
    }),
    messaging: () => ({
      sendEachForMulticast: sendEachForMulticastImpl,
    }),
  };
  return { admin, eliminados };
}

test('enviarPushACorreo: sin dispositivos registrados -> ok:true, enviadas:0, nunca llama a messaging', async () => {
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: 'test' });
  let seLlamoMessaging = false;
  const { admin } = fakeAdminConFirestore({
    tokensDocs: [],
    sendEachForMulticastImpl: async () => { seLlamoMessaging = true; return { responses: [] }; },
  });
  stubFirebaseAdmin(admin);
  try {
    const { enviarPushACorreo } = cargarPushFcmFresco();
    const r = await enviarPushACorreo({ correo: 'sin-dispositivos@correo.com', titulo: 'x', cuerpo: 'y' });
    assert.deepEqual(r, { ok: true, enviadas: 0 });
    assert.equal(seLlamoMessaging, false);
  } finally {
    restaurarFirebaseAdmin();
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  }
});

test('enviarPushACorreo: 2 dispositivos, ambos exitosos -> enviadas:2, payload data-only correcto, nunca borra nada', async () => {
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: 'test' });
  let payloadCapturado = null;
  const { admin, eliminados } = fakeAdminConFirestore({
    tokensDocs: [{ id: 'tokenA', token: 'tokenA' }, { id: 'tokenB', token: 'tokenB' }],
    sendEachForMulticastImpl: async (payload) => {
      payloadCapturado = payload;
      return { responses: [{ success: true }, { success: true }] };
    },
  });
  stubFirebaseAdmin(admin);
  try {
    const { enviarPushACorreo } = cargarPushFcmFresco();
    const r = await enviarPushACorreo({ correo: 'alumna@correo.com', titulo: 'Mañana llegas a la Estación 1 💛', cuerpo: 'Ya está preparado.', url: '/workbook/', tag: 'estacion1', tipo: 'bootcamp_estacion' });
    assert.deepEqual(r, { ok: true, enviadas: 2 });
    assert.deepEqual(payloadCapturado.tokens, ['tokenA', 'tokenB']);
    assert.deepEqual(payloadCapturado.data, {
      tipo: 'bootcamp_estacion',
      title: 'Mañana llegas a la Estación 1 💛',
      body: 'Ya está preparado.',
      tag: 'estacion1',
      url: '/workbook/',
      icon: '/workbook/icon-192.png',
      badge: '/workbook/icon-192.png',
    });
    assert.equal(payloadCapturado.notification, undefined, 'data-only, nunca campo notification (mismo criterio que el sistema legado)');
    assert.deepEqual(eliminados, []);
  } finally {
    restaurarFirebaseAdmin();
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  }
});

test('enviarPushACorreo: un token invalido se borra de dispositivos_push, el otro se cuenta como enviado', async () => {
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: 'test' });
  const { admin, eliminados } = fakeAdminConFirestore({
    tokensDocs: [{ id: 'token-valido', token: 'token-valido' }, { id: 'token-muerto', token: 'token-muerto' }],
    sendEachForMulticastImpl: async () => ({
      responses: [
        { success: true },
        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
      ],
    }),
  });
  stubFirebaseAdmin(admin);
  try {
    const { enviarPushACorreo } = cargarPushFcmFresco();
    const r = await enviarPushACorreo({ correo: 'alumna@correo.com', titulo: 'x', cuerpo: 'y' });
    assert.deepEqual(r, { ok: true, enviadas: 1 });
    assert.deepEqual(eliminados, ['token-muerto']);
  } finally {
    restaurarFirebaseAdmin();
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  }
});

test('enviarPushACorreo: credenciales invalidas (JSON corrupto) -> ok:false, nunca lanza', async () => {
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = 'esto-no-es-json-valido';
  stubFirebaseAdmin({ apps: [], credential: { cert: (x) => x }, initializeApp: () => {} });
  try {
    const { enviarPushACorreo } = cargarPushFcmFresco();
    const r = await enviarPushACorreo({ correo: 'alumna@correo.com', titulo: 'x', cuerpo: 'y' });
    assert.deepEqual(r, { ok: false, motivo: 'firebase_credenciales_invalidas' });
  } finally {
    restaurarFirebaseAdmin();
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  }
});
