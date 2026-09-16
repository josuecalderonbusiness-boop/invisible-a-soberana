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
