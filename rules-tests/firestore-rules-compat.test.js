// rules-tests/firestore-rules-compat.test.js — Fase 2: las operaciones reales del PWA con el SDK EXACTO que usa
// (firebase-*-compat 9.23.0, API `db.collection().doc().set()`), contra el emulador y las reglas nuevas.
// El SDK modular de la otra suite comparte semántica, pero aquí se comprueba la forma exacta de las
// peticiones del compat (IDs de .add(), FieldValue.serverTimestamp/increment, set con merge).
// Ejecutar con `npm test` en rules-tests/ (fija FIRESTORE_EMULATOR_HOST). Solo emulador, proyecto demo.

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import firebase from 'firebase9/compat/app';
import 'firebase9/compat/firestore';

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST || !/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(HOST)) {
  throw new Error('Estas pruebas solo corren contra el emulador. Usa `npm test` en rules-tests/.');
}
const PROJECT = 'demo-soberana-rules-compat';
const [EMU_HOST, EMU_PORT] = HOST.split(':');
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGLAS = fs.readFileSync(path.join(RAIZ, 'firestore.rules'), 'utf8');

const CORREO = 'ana@example.com';
const TOKEN = 'fcm-token-de-prueba-0123456789';
const ID_POST = 'aB3dE5gH7jK9mN1pQ3rS';

let env, app, db;
const FV = firebase.firestore.FieldValue;

before(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: REGLAS } });
  app = firebase.initializeApp({ projectId: PROJECT }, 'pwa-compat');
  db = app.firestore();
  db.useEmulator(EMU_HOST, Number(EMU_PORT));
});
after(async () => { await app.delete(); await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    const { doc, setDoc, Timestamp } = await import('firebase/firestore');
    await setDoc(doc(d, 'comunidad', ID_POST), { name: 'Ana', initial: 'A', event: 'x', hearts: 3, timestamp: Timestamp.now(), tipo: 'automatico', adminKey: 'valor-ficticio' });
    await setDoc(doc(d, 'notif_masterclass', CORREO), { semana: 1, email: CORREO, solicitadoEn: Timestamp.now() });
    await setDoc(doc(d, 'masterclasses', 'semana1'), { titulo: 'S1' });
    await setDoc(doc(d, 'config', 'sesiones_live'), { semana1: {} });
    await setDoc(doc(d, 'tokens', CORREO), { token: TOKEN, email: CORREO, fecha: 'x' });
    await setDoc(doc(d, 'rachas', CORREO), { streak: 1, lastActive: 'x', email: CORREO });
    await setDoc(doc(d, 'progreso', CORREO), { completedSections: ['s1'] });
  });
});

const ok = (p) => assertSucceeds(p);
const no = (p) => assertFails(p);

test('PWA compat: publishComunidadPost de la Fase 1 (db.collection().add sin adminKey)', async () => {
  const ref = await db.collection('comunidad').add({
    name: 'Ana Pérez', initial: 'A', event: 'Ana acaba de completar el Código Soberana 🔥',
    hearts: 0, timestamp: FV.serverTimestamp(), tipo: 'automatico',
  }).then((r) => r, (e) => { throw e; });
  assert.match(ref.id, /^[A-Za-z0-9]{20}$/);
});

test('PWA compat: el publishComunidadPost ANTERIOR (con adminKey) queda denegado tras Fase 2 (v366 en caché)', async () => {
  await no(db.collection('comunidad').add({
    name: 'Ana', initial: 'A', event: 'x', hearts: 0, timestamp: FV.serverTimestamp(), adminKey: 'valor-ficticio', tipo: 'automatico',
  }));
});

test('PWA compat: toggleHeart (update con FieldValue.increment ±1)', async () => {
  await ok(db.collection('comunidad').doc(ID_POST).update({ hearts: FV.increment(1) }));
  await ok(db.collection('comunidad').doc(ID_POST).update({ hearts: FV.increment(-1) }));
  await no(db.collection('comunidad').doc(ID_POST).update({ hearts: FV.increment(2) }));
});

test('PWA compat: feed (orderBy timestamp desc limit 20), toast (limit 1) y get de config/masterclasses', async () => {
  await ok(db.collection('comunidad').orderBy('timestamp', 'desc').limit(20).get());
  await ok(db.collection('comunidad').orderBy('timestamp', 'desc').limit(1).get());
  await ok(db.collection('config').doc('sesiones_live').get());
  await ok(db.collection('masterclasses').doc('semana1').get());
});

test('PWA compat: registro de Push (tokens legado + dispositivos_push) y notif_masterclass con merge', async () => {
  await ok(db.collection('tokens').doc(CORREO).set({ token: TOKEN, email: CORREO, fecha: new Date().toISOString() }));
  await ok(db.collection('dispositivos_push').doc(CORREO).collection('tokens').doc(TOKEN).set({
    token: TOKEN, plataforma: 'Win32', actualizadoEn: new Date().toISOString(),
  }));
  await ok(db.collection('notif_masterclass').doc(CORREO).set({ semana: 2, email: CORREO, solicitadoEn: FV.serverTimestamp() }, { merge: true }));
});

test('PWA compat: eventos (set merge:false), rachas y progreso (set merge con arrayUnion / campo con punto / subcolección)', async () => {
  await ok(db.collection('eventos').doc(CORREO).collection('secciones').doc('s2').set({
    seccion: 's2', nombre: 'Ana', email: CORREO, timestamp: FV.serverTimestamp(), notifEnviada: false,
  }, { merge: false }));
  await ok(db.collection('rachas').doc(CORREO).set({ streak: 2, lastActive: 'Sun Sep 20 2026', email: CORREO }, { merge: true }));
  await ok(db.collection('rachas').doc(CORREO).get());
  await ok(db.collection('progreso').doc(CORREO).set({ completedSections: FV.arrayUnion('s2'), estrellas_s2: 2, updatedAt: FV.serverTimestamp() }, { merge: true }));
  await ok(db.collection('progreso').doc(CORREO).set({ 'completed7d.7d_s1_d2': new Date().toISOString(), updatedAt: FV.serverTimestamp() }, { merge: true }));
  await ok(db.collection('progreso').doc(CORREO).collection('masterclassRespuestas').doc('s1_e1').set({
    respuesta: 'x', semana: 1, ejercicioId: 'e1', guardadoEn: FV.serverTimestamp(),
  }, { merge: true }));
  await ok(db.collection('progreso').doc(CORREO).collection('masterclassRespuestas').get());
});

test('PWA compat: lo que ya no puede hacer (lecturas y listados cerrados)', async () => {
  await no(db.collection('tokens').get());
  await no(db.collection('notif_masterclass').get());
  await no(db.collection('rachas').get());
  await no(db.collection('progreso').get());
  await no(db.collection('dispositivos_push').doc(CORREO).collection('tokens').get());
  await no(db.collection('comunidad').doc(ID_POST).delete());
  await no(db.collection('masterclasses').doc('semana1').set({ titulo: 'hack' }));
});
