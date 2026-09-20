// api/_lib/push-fcm.test.js — Puerta 5, Estación 9A
//
// Corrección 2026-09-16: push-fcm.js ya no usa firebase-admin (stubbeable
// vía require.cache) sino fetch()+googleapis.GoogleAuth directos, igual que
// firestore-rest.js/_lib/programa.js. Mismo criterio ya documentado en
// programa.test.js: el camino que llama a Firestore/FCM real (GoogleAuth
// vía red) no se mockea aquí — mockear fetch() global de forma fiable sin
// tocar la red exigiría inyectar el proveedor de token/fetch, cambio no
// hecho todavía. Gap de cobertura documentado, no simulado. Lo que SÍ se
// prueba sin red es el atajo de configuración, que es puro.

import test from 'node:test';
import assert from 'node:assert/strict';
import { credencialesConfiguradas, enviarPushACorreo } from './push-fcm.js';

test('credencialesConfiguradas: false sin FIREBASE_SERVICE_ACCOUNT', () => {
  const original = process.env.FIREBASE_SERVICE_ACCOUNT;
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  try {
    assert.equal(credencialesConfiguradas(), false);
  } finally {
    if (original !== undefined) process.env.FIREBASE_SERVICE_ACCOUNT = original;
  }
});

test('credencialesConfiguradas: true con FIREBASE_SERVICE_ACCOUNT presente', () => {
  const original = process.env.FIREBASE_SERVICE_ACCOUNT;
  process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'test' });
  try {
    assert.equal(credencialesConfiguradas(), true);
  } finally {
    if (original !== undefined) process.env.FIREBASE_SERVICE_ACCOUNT = original;
    else delete process.env.FIREBASE_SERVICE_ACCOUNT;
  }
});

test('enviarPushACorreo: sin FIREBASE_SERVICE_ACCOUNT -> ok:false, nunca intenta tocar la red', async () => {
  const original = process.env.FIREBASE_SERVICE_ACCOUNT;
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  const fetchOriginal = global.fetch;
  let seLlamoFetch = false;
  global.fetch = async () => { seLlamoFetch = true; throw new Error('no debería llamarse'); };
  try {
    const r = await enviarPushACorreo({ correo: 'alumna@correo.com', titulo: 'x', cuerpo: 'y' });
    assert.deepEqual(r, { ok: false, motivo: 'firebase_no_configurado' });
    assert.equal(seLlamoFetch, false);
  } finally {
    global.fetch = fetchOriginal;
    if (original !== undefined) process.env.FIREBASE_SERVICE_ACCOUNT = original;
  }
});

// ── Varios correos por Persona (diagnóstico de Push, 2026-09-19) ──
// El puente acepta correos[] (además de `correo`), consulta los tokens de cada
// correo, DEDUPLICA por token y envía cada token una sola vez. Se prueba con
// dependencias inyectadas (crearEnviadorPush): sin red, sin Firestore, sin FCM.

import { crearEnviadorPush, normalizarCorreos, MAX_CORREOS } from './push-fcm.js';

// Firestore falso: tokensPorCorreo { correo: [ids] }; un correo puede mapear a
// { error: 500 } para simular una respuesta no exitosa, o a 'lanza' (fallo de red).
function entorno({ tokensPorCorreo = {}, fcm = {}, credenciales = true, fcmToken = 'ok' } = {}) {
  const llamadas = { listados: [], fcm: [], borrados: [], fcmToken: 0 };
  const deps = {
    credencialesConfiguradas: () => credenciales,
    getFirestoreToken: async () => 'tok-firestore',
    getFcmToken: async () => {
      llamadas.fcmToken++;
      if (fcmToken !== 'ok') throw new Error('credenciales malas');
      return 'tok-fcm';
    },
    fsDelete: async (coleccion, id) => { llamadas.borrados.push(`${coleccion}::${id}`); },
    fetch: async (url, opciones) => {
      const u = String(url);
      if (u.includes('/dispositivos_push/')) {
        const correo = decodeURIComponent(u.split('/dispositivos_push/')[1].split('/tokens')[0]);
        llamadas.listados.push(correo);
        const entrada = tokensPorCorreo[correo];
        if (entrada === 'lanza') throw new Error('red caida');
        if (entrada && entrada.error) return { ok: false, status: entrada.error, json: async () => ({}) };
        const ids = entrada || [];
        return { ok: true, status: 200, json: async () => (ids.length ? { documents: ids.map((id) => ({ name: `projects/p/databases/(default)/documents/dispositivos_push/x/tokens/${id}` })) } : {}) };
      }
      // FCM
      const tokenDestino = JSON.parse(opciones.body).message.token;
      llamadas.fcm.push(tokenDestino);
      const r = fcm[tokenDestino] || { ok: true };
      return { ok: r.ok, status: r.ok ? 200 : 400, json: async () => (r.ok ? {} : { error: { details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: r.errorCode }] } }) };
    },
  };
  return { ...crearEnviadorPush(deps), llamadas };
}

const MSG = { titulo: 'T', cuerpo: 'C' };

test('normalizarCorreos: une correo + correos[], minúsculas, sin repetidos ni inválidos, conserva el orden', () => {
  assert.deepEqual(
    normalizarCorreos({ correo: '  A@X.com ', correos: ['b@x.com', 'a@x.com', 'sin-arroba', '', null, 'B@X.COM', 'c@x.com'] }),
    ['a@x.com', 'b@x.com', 'c@x.com']
  );
  assert.deepEqual(normalizarCorreos({}), []);
  assert.deepEqual(normalizarCorreos({ correos: 'no-es-arreglo' }), []);
});

test('normalizarCorreos: tope MAX_CORREOS — una lista anormal no multiplica las consultas', () => {
  const muchos = Array.from({ length: 25 }, (_, i) => `p${i}@x.com`);
  const r = normalizarCorreos({ correos: muchos });
  assert.equal(r.length, MAX_CORREOS);
  assert.equal(r[0], 'p0@x.com');
});

test('Persona con 1 correo (contrato original `correo`): funciona igual que antes — 1 listado, 1 envío', async () => {
  const e = entorno({ tokensPorCorreo: { 'a@x.com': ['tok-1'] } });
  const r = await e.enviarPushACorreo({ correo: 'a@x.com', ...MSG });
  assert.deepEqual(r, { ok: true, enviadas: 1, dispositivos: 1 });
  assert.deepEqual(e.llamadas.listados, ['a@x.com']);
  assert.deepEqual(e.llamadas.fcm, ['tok-1']);
});

test('Persona con 2 correos: consulta AMBOS y envía a los tokens de ambos (tokens distintos A/B -> los dos reciben)', async () => {
  const e = entorno({ tokensPorCorreo: { 'a@x.com': ['tok-A'], 'b@x.com': ['tok-B1', 'tok-B2'] } });
  const r = await e.enviarPushACorreo({ correos: ['a@x.com', 'b@x.com'], ...MSG });
  assert.deepEqual(e.llamadas.listados.sort(), ['a@x.com', 'b@x.com']);
  assert.deepEqual(e.llamadas.fcm.sort(), ['tok-A', 'tok-B1', 'tok-B2']);
  assert.deepEqual(r, { ok: true, enviadas: 3, dispositivos: 3 });
});

test('MISMO token bajo A y B: se envía UNA sola vez (el dispositivo no recibe el Push duplicado)', async () => {
  const e = entorno({ tokensPorCorreo: { 'a@x.com': ['tok-compartido', 'tok-A'], 'b@x.com': ['tok-compartido'] } });
  const r = await e.enviarPushACorreo({ correos: ['a@x.com', 'b@x.com'], ...MSG });
  assert.deepEqual(e.llamadas.fcm.sort(), ['tok-A', 'tok-compartido']);
  assert.equal(r.enviadas, 2);
  assert.equal(r.dispositivos, 2);
});

test('el mismo correo repetido en correos[] y `correo` se consulta una sola vez', async () => {
  const e = entorno({ tokensPorCorreo: { 'a@x.com': ['tok-1'] } });
  await e.enviarPushACorreo({ correo: 'A@x.com', correos: ['a@x.com', ' A@X.com '], ...MSG });
  assert.deepEqual(e.llamadas.listados, ['a@x.com']);
  assert.deepEqual(e.llamadas.fcm, ['tok-1']);
});

test('Persona SIN tokens: {ok:true, enviadas:0} (semántica intacta), nunca pide token de FCM ni envía', async () => {
  const e = entorno({ tokensPorCorreo: {} });
  const r = await e.enviarPushACorreo({ correos: ['a@x.com', 'b@x.com'], ...MSG });
  assert.deepEqual(r, { ok: true, enviadas: 0 });
  assert.equal(e.llamadas.fcmToken, 0);
  assert.equal(e.llamadas.fcm.length, 0);
});

test('Firestore responde con error en UN correo: resultado DIFERENCIADO {ok:false, motivo:firestore_no_disponible} y NO se envía a nadie (todo o nada, un reintento no duplica)', async () => {
  const e = entorno({ tokensPorCorreo: { 'a@x.com': ['tok-A'], 'b@x.com': { error: 500 } } });
  const r = await e.enviarPushACorreo({ correos: ['a@x.com', 'b@x.com'], ...MSG });
  assert.deepEqual(r, { ok: false, motivo: 'firestore_no_disponible' });
  assert.equal(e.llamadas.fcm.length, 0, 'ni siquiera al correo que sí se pudo leer');
  assert.equal(e.llamadas.fcmToken, 0);
});

test('Firestore inaccesible (fallo de red / 403 / 503) con UN solo correo: firestore_no_disponible — antes se confundía con "0 dispositivos"', async () => {
  for (const entrada of ['lanza', { error: 403 }, { error: 503 }]) {
    const e = entorno({ tokensPorCorreo: { 'a@x.com': entrada } });
    assert.deepEqual(await e.enviarPushACorreo({ correo: 'a@x.com', ...MSG }), { ok: false, motivo: 'firestore_no_disponible' });
  }
});

test('un listado exitoso SIN documentos es ausencia legítima de dispositivos (no un fallo)', async () => {
  const e = entorno({ tokensPorCorreo: { 'a@x.com': [] } });
  assert.deepEqual(await e.enviarPushACorreo({ correo: 'a@x.com', ...MSG }), { ok: true, enviadas: 0 });
});

test('sin correos válidos (vacío, o solo inválidos): ok:false sin_correos, cero consultas — nunca amplía destinatarios', async () => {
  const e = entorno({ tokensPorCorreo: { 'a@x.com': ['tok-1'] } });
  assert.deepEqual(await e.enviarPushACorreo({ correos: [], ...MSG }), { ok: false, motivo: 'sin_correos' });
  assert.deepEqual(await e.enviarPushACorreo({ correo: 'sin-arroba', correos: ['tampoco'], ...MSG }), { ok: false, motivo: 'sin_correos' });
  assert.equal(e.llamadas.listados.length, 0);
  assert.equal(e.llamadas.fcm.length, 0);
});

test('solo consulta los correos que le pasan: no inventa ni deriva otros (nunca busca tokens de otra Persona)', async () => {
  const e = entorno({ tokensPorCorreo: { 'mia@x.com': ['tok-mio'], 'ajena@x.com': ['tok-ajeno'] } });
  await e.enviarPushACorreo({ correos: ['mia@x.com'], ...MSG });
  assert.deepEqual(e.llamadas.listados, ['mia@x.com']);
  assert.deepEqual(e.llamadas.fcm, ['tok-mio']);
});

test('token inválido (UNREGISTERED): se retira de TODOS los correos donde estaba y los válidos siguen contando', async () => {
  const e = entorno({
    tokensPorCorreo: { 'a@x.com': ['tok-muerto', 'tok-bueno'], 'b@x.com': ['tok-muerto'] },
    fcm: { 'tok-muerto': { ok: false, errorCode: 'UNREGISTERED' } },
  });
  const r = await e.enviarPushACorreo({ correos: ['a@x.com', 'b@x.com'], ...MSG });
  assert.equal(r.enviadas, 1);
  assert.deepEqual(e.llamadas.borrados.sort(), [
    'dispositivos_push/a%40x.com/tokens::tok-muerto',
    'dispositivos_push/b%40x.com/tokens::tok-muerto',
  ]);
});

test('un fallo de FCM que NO es token inválido no borra nada', async () => {
  const e = entorno({ tokensPorCorreo: { 'a@x.com': ['tok-1'] }, fcm: { 'tok-1': { ok: false, errorCode: 'UNAVAILABLE' } } });
  const r = await e.enviarPushACorreo({ correo: 'a@x.com', ...MSG });
  assert.equal(r.enviadas, 0);
  assert.equal(e.llamadas.borrados.length, 0);
});

test('credenciales de FCM inválidas: firebase_credenciales_invalidas, sin enviar', async () => {
  const e = entorno({ tokensPorCorreo: { 'a@x.com': ['tok-1'] }, fcmToken: 'mal' });
  assert.deepEqual(await e.enviarPushACorreo({ correo: 'a@x.com', ...MSG }), { ok: false, motivo: 'firebase_credenciales_invalidas' });
  assert.equal(e.llamadas.fcm.length, 0);
});

test('sin credenciales de Firebase: firebase_no_configurado, cero consultas (con correos[])', async () => {
  const e = entorno({ credenciales: false, tokensPorCorreo: { 'a@x.com': ['tok-1'] } });
  assert.deepEqual(await e.enviarPushACorreo({ correos: ['a@x.com', 'b@x.com'], ...MSG }), { ok: false, motivo: 'firebase_no_configurado' });
  assert.equal(e.llamadas.listados.length, 0);
});

test('el correo con "+" se consulta codificado y llega íntegro (holyjosue+pruebapush9b@gmail.com)', async () => {
  const e = entorno({ tokensPorCorreo: { 'holyjosue+pruebapush9b@gmail.com': ['tok-9b'] } });
  const r = await e.enviarPushACorreo({ correos: ['holyjosue+pruebapush9@gmail.com', 'holyjosue+pruebapush9b@gmail.com'], ...MSG });
  assert.deepEqual(e.llamadas.fcm, ['tok-9b']);
  assert.equal(r.enviadas, 1);
});
