// rules-tests/firestore-rules.test.js — Seguridad, Fase 2 (reglas de Firestore), 2026-09-20.
//
// Prueba firestore.rules contra el Firestore Emulator (proyecto DEMO): jamas contacta produccion.
// Ejecutar SIEMPRE con `npm test` dentro de rules-tests/ (levanta el emulador y fija
// FIRESTORE_EMULATOR_HOST). Nunca `node --test` a secas en este repo.
//
// Cubre: lo que el PWA necesita (permitir), lo que debe quedar cerrado (denegar), la clave de
// administracion antigua (DENEGADA con las reglas nuevas, aceptada por las antiguas = control) y el
// Admin SDK / REST con token de servicio frente a las reglas (las reglas no aplican al backend).
// La clave antigua se lee EN MEMORIA de las reglas del commit 39dcfbb; nunca se imprime ni se guarda.

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, collection, collectionGroup,
  query, orderBy, limit, serverTimestamp, increment, arrayUnion, Timestamp,
} from 'firebase/firestore';
import { initializeApp as adminInit, deleteApp as adminDelete } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';

// ── Guardas de seguridad: solo emulador, solo proyecto demo ────────────────
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST || !/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(HOST)) {
  throw new Error('Estas pruebas solo corren contra el emulador. Usa `npm test` en rules-tests/.');
}
const PROJECT = 'demo-soberana-rules';
const PROJECT_OLD = 'demo-soberana-rules-old';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGLAS_NUEVAS = fs.readFileSync(path.join(RAIZ, 'firestore.rules'), 'utf8');
// Reglas publicadas hoy en produccion (commit 39dcfbb de main) — para el control de la clave antigua.
const REGLAS_ANTIGUAS = execFileSync('git', ['-C', RAIZ, 'show', '39dcfbb:firestore.rules'], { encoding: 'utf8' });
const CLAVE_ANTIGUA = (REGLAS_ANTIGUAS.match(/adminKey == "([^"]+)"/) || [])[1];
assert.ok(CLAVE_ANTIGUA, 'no se pudo leer la clave antigua de las reglas 39dcfbb (para el control)');

// ── Datos de prueba (ficticios) ────────────────────────────────────────────
const CORREO = 'ana@example.com';
const OTRO_CORREO = 'otra@example.com';
const TOKEN = 'fcm-token-de-prueba-0123456789';
const ID_POST = 'aB3dE5gH7jK9mN1pQ3rS';         // 20 alfanuméricos, como los IDs automáticos
const ID_POST_CERO = 'cC3dE5gH7jK9mN1pQ3rS';    // hearts = 0
const ID_POST_LIVE = 'bB3dE5gH7jK9mN1pQ3rS';    // documento 'live' legado, SIN campo hearts
const iso = () => new Date().toISOString();

let env, envOld, anon, anonOld, adminApp, adminDb;

async function sembrar(e) {
  await e.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // Como en producción, los posts existentes traen el campo adminKey con la clave antigua.
    await setDoc(doc(db, 'comunidad', ID_POST), { name: 'Ana Pérez', initial: 'A', event: 'Ana completó el Código Soberana 🔥', hearts: 3, timestamp: Timestamp.now(), tipo: 'automatico', adminKey: CLAVE_ANTIGUA });
    await setDoc(doc(db, 'comunidad', ID_POST_CERO), { name: 'Bea', initial: 'B', event: 'Bea activó el Protocolo Mental ⚡', hearts: 0, timestamp: Timestamp.now(), tipo: 'automatico', adminKey: CLAVE_ANTIGUA });
    await setDoc(doc(db, 'comunidad', ID_POST_LIVE), { autor: 'Josué', avatarLetra: 'J', tipo: 'live', emoji: '🔴', titulo: 'En vivo', texto: 'Entra', cta: 'Entrar', ctaUrl: 'https://zoom.us/j/1', timestamp: Timestamp.now(), esLive: true, adminKey: CLAVE_ANTIGUA });
    await setDoc(doc(db, 'masterclasses', 'semana1'), { titulo: 'Semana 1', activada: true, bunnyVideoId: 'abc' });
    await setDoc(doc(db, 'config', 'sesiones_live'), { semana1: { fecha_iso: '2026-09-26T15:00:00-05:00', zoom_link: 'https://zoom.us/j/1' } });
    await setDoc(doc(db, 'tokens', CORREO), { token: TOKEN, email: CORREO, fecha: iso() });
    await setDoc(doc(db, 'dispositivos_push', CORREO, 'tokens', TOKEN), { token: TOKEN, plataforma: 'Win32', actualizadoEn: iso() });
    await setDoc(doc(db, 'notif_masterclass', CORREO), { semana: 1, email: CORREO, solicitadoEn: Timestamp.now() });
    await setDoc(doc(db, 'notif_log', CORREO), { ultimoEnvio: Timestamp.now(), tipo: 'x' });
    await setDoc(doc(db, 'eventos', CORREO, 'secciones', 's1'), { seccion: 's1', nombre: 'Ana', email: CORREO, timestamp: Timestamp.now(), notifEnviada: false });
    await setDoc(doc(db, 'rachas', CORREO), { streak: 4, lastActive: 'Sun Sep 20 2026', email: CORREO });
    await setDoc(doc(db, 'logros', CORREO), { logro: 'x' });
    await setDoc(doc(db, 'progreso', CORREO), { completedSections: ['s1'], estrellas_s1: 3, updatedAt: Timestamp.now() });
    await setDoc(doc(db, 'progreso', CORREO, 'masterclassRespuestas', 's1_e1'), { respuesta: 'hola', semana: 1, ejercicioId: 'e1', guardadoEn: Timestamp.now() });
    await setDoc(doc(db, 'cohortes', 'c1'), { nombre: 'x' });
    await setDoc(doc(db, 'cuentas', CORREO), { hash: 'x' });
    await setDoc(doc(db, 'workbook_respuestas', CORREO), { r: 1 });
  });
}

before(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: REGLAS_NUEVAS } });
  envOld = await initializeTestEnvironment({ projectId: PROJECT_OLD, firestore: { rules: REGLAS_ANTIGUAS } });
  adminApp = adminInit({ projectId: PROJECT }, 'admin-sdk-prueba');
  adminDb = adminFirestore(adminApp);
});
after(async () => {
  await adminDelete(adminApp);
  await env.cleanup();
  await envOld.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await envOld.clearFirestore();
  await sembrar(env);
  await sembrar(envOld);
  anon = env.unauthenticatedContext().firestore();        // el PWA nunca usa Firebase Auth
  anonOld = envOld.unauthenticatedContext().firestore();
});

const ok = (p) => assertSucceeds(p);
const no = (p) => assertFails(p);

// Post tal como lo produce publishComunidadPost() en la Fase 1 (sin adminKey).
const postPWA = (extra = {}) => ({ name: 'Sofía A.', initial: 'S', event: 'Sofía completó el Código Soberana 🔥', hearts: 0, timestamp: serverTimestamp(), tipo: 'automatico', ...extra });

// ═════════════════════════════════════════════════════════════════════════
// 1. DEBE PERMITIR — operaciones reales del PWA
// ═════════════════════════════════════════════════════════════════════════
test('P1-P2: get de masterclasses/semana1 y config/sesiones_live', async () => {
  await ok(getDoc(doc(anon, 'masterclasses', 'semana1')));
  await ok(getDoc(doc(anon, 'config', 'sesiones_live')));
});

test('P3-P4: feed de comunidad (list ordenado, limit 20 y limit 1) y get de un post', async () => {
  await ok(getDocs(query(collection(anon, 'comunidad'), orderBy('timestamp', 'desc'), limit(20))));
  await ok(getDocs(query(collection(anon, 'comunidad'), orderBy('timestamp', 'desc'), limit(1))));
  await ok(getDoc(doc(anon, 'comunidad', ID_POST)));
});

test('P5: post automático válido con addDoc (ID autogenerado real del SDK) y serverTimestamp', async () => {
  const ref = await ok(addDoc(collection(anon, 'comunidad'), postPWA()));
  assert.match(ref.id, /^[A-Za-z0-9]{20}$/, 'el SDK genera IDs de 20 alfanuméricos');
});

test('P5b: límites exactos permitidos (name 100, event 300, initial emoji)', async () => {
  await ok(addDoc(collection(anon, 'comunidad'), postPWA({ name: 'n'.repeat(100), event: 'e'.repeat(300) })));
  await ok(addDoc(collection(anon, 'comunidad'), postPWA({ initial: '🔥' })));
});

test('P6-P8: corazón +1, -1 y +1 sobre un documento sin campo hearts', async () => {
  await ok(updateDoc(doc(anon, 'comunidad', ID_POST), { hearts: increment(1) }));
  await ok(updateDoc(doc(anon, 'comunidad', ID_POST), { hearts: increment(-1) }));
  await ok(updateDoc(doc(anon, 'comunidad', ID_POST_LIVE), { hearts: increment(1) }));
});

test('P9-P10: rachas — get y set con merge (nuevo y existente)', async () => {
  await ok(getDoc(doc(anon, 'rachas', CORREO)));
  await ok(setDoc(doc(anon, 'rachas', CORREO), { streak: 5, lastActive: 'Mon Sep 21 2026', email: CORREO }, { merge: true }));
  await ok(setDoc(doc(anon, 'rachas', OTRO_CORREO), { streak: 1, lastActive: 'Mon Sep 21 2026', email: OTRO_CORREO }, { merge: true }));
});

test('P11-P13: progreso — get, set con merge (arrayUnion, serverTimestamp, campos con punto) y subcolección', async () => {
  await ok(getDoc(doc(anon, 'progreso', CORREO)));
  await ok(setDoc(doc(anon, 'progreso', CORREO), { completedSections: arrayUnion('s2'), estrellas_s2: 2, updatedAt: serverTimestamp() }, { merge: true }));
  await ok(setDoc(doc(anon, 'progreso', CORREO), { 'completed7d.7d_s1_d2': iso(), updatedAt: serverTimestamp() }, { merge: true }));
  await ok(setDoc(doc(anon, 'progreso', CORREO, 'masterclassRespuestas', 's1_e2'), { respuesta: 'x', semana: 1, ejercicioId: 'e2', guardadoEn: serverTimestamp() }, { merge: true }));
  await ok(getDocs(collection(anon, 'progreso', CORREO, 'masterclassRespuestas')));
});

test('P14: logros — get', async () => {
  await ok(getDoc(doc(anon, 'logros', CORREO)));
});

test('P15: tokens legado — registrar y re-registrar (create y update)', async () => {
  await ok(setDoc(doc(anon, 'tokens', OTRO_CORREO), { token: TOKEN, email: OTRO_CORREO, fecha: iso() }));
  await ok(setDoc(doc(anon, 'tokens', CORREO), { token: TOKEN + 'b', email: CORREO, fecha: iso() }));
});

test('P16: dispositivos_push — registrar, re-registrar el mismo token, plataforma null', async () => {
  await ok(setDoc(doc(anon, 'dispositivos_push', OTRO_CORREO, 'tokens', TOKEN), { token: TOKEN, plataforma: 'MacIntel', actualizadoEn: iso() }));
  await ok(setDoc(doc(anon, 'dispositivos_push', CORREO, 'tokens', TOKEN), { token: TOKEN, plataforma: 'Win32', actualizadoEn: iso() }));
  await ok(setDoc(doc(anon, 'dispositivos_push', CORREO, 'tokens', 'otro-token'), { token: 'otro-token', plataforma: null, actualizadoEn: iso() }));
});

test('P17: notif_masterclass — set con merge, primera vez y repetido', async () => {
  await ok(setDoc(doc(anon, 'notif_masterclass', OTRO_CORREO), { semana: 2, email: OTRO_CORREO, solicitadoEn: serverTimestamp() }, { merge: true }));
  await ok(setDoc(doc(anon, 'notif_masterclass', CORREO), { semana: 1, email: CORREO, solicitadoEn: serverTimestamp() }, { merge: true }));
});

test('P18: eventos — sección y quesigue_visto (set sin merge), nuevo y reescrito', async () => {
  const seccion = (id, correo) => ({ seccion: id, nombre: 'Ana', email: correo, timestamp: serverTimestamp(), notifEnviada: false });
  await ok(setDoc(doc(anon, 'eventos', CORREO, 'secciones', 's2'), seccion('s2', CORREO), { merge: false }));
  await ok(setDoc(doc(anon, 'eventos', CORREO, 'secciones', 's1'), seccion('s1', CORREO), { merge: false }));
  await ok(setDoc(doc(anon, 'eventos', CORREO, 'secciones', 'quesigue_visto'), seccion('quesigue_visto', CORREO), { merge: false }));
});

// ═════════════════════════════════════════════════════════════════════════
// 2. DEBE RECHAZAR — lectura y listado
// ═════════════════════════════════════════════════════════════════════════
const LECTURAS_DENEGADAS = [
  ['R1  list de tokens (legado)',                       (db) => getDocs(collection(db, 'tokens'))],
  ['R2  get de tokens/{correo}',                        (db) => getDoc(doc(db, 'tokens', CORREO))],
  ['R3  list de dispositivos_push/{correo}/tokens',     (db) => getDocs(collection(db, 'dispositivos_push', CORREO, 'tokens'))],
  ['R4  get de un dispositivo',                         (db) => getDoc(doc(db, 'dispositivos_push', CORREO, 'tokens', TOKEN))],
  ['R5  list de notif_masterclass',                     (db) => getDocs(collection(db, 'notif_masterclass'))],
  ['R5b get de notif_masterclass/{correo}',             (db) => getDoc(doc(db, 'notif_masterclass', CORREO))],
  ['R5c list de eventos/{correo}/secciones',            (db) => getDocs(collection(db, 'eventos', CORREO, 'secciones'))],
  ['R5d get de eventos/{correo}/secciones/s1',          (db) => getDoc(doc(db, 'eventos', CORREO, 'secciones', 's1'))],
  ['R6  list de rachas',                                (db) => getDocs(collection(db, 'rachas'))],
  ['R7  list de progreso',                              (db) => getDocs(collection(db, 'progreso'))],
  ['R8  list de logros',                                (db) => getDocs(collection(db, 'logros'))],
  ['R9  get de notif_log/{correo}',                     (db) => getDoc(doc(db, 'notif_log', CORREO))],
  ['R9b list de notif_log',                             (db) => getDocs(collection(db, 'notif_log'))],
  ['R10 list de config',                                (db) => getDocs(collection(db, 'config'))],
  ['R11 list de masterclasses',                         (db) => getDocs(collection(db, 'masterclasses'))],
  ['R11b get y list de cohortes',                       (db) => getDoc(doc(db, 'cohortes', 'c1'))],
  ['R11c list de cohortes',                             (db) => getDocs(collection(db, 'cohortes'))],
  ['R17 cuentas (Mi Espacio) — sigue denegada',         (db) => getDoc(doc(db, 'cuentas', CORREO))],
  ['R17b workbook_respuestas — sigue denegada',         (db) => getDoc(doc(db, 'workbook_respuestas', CORREO))],
  ['R17c collectionGroup tokens',                       (db) => getDocs(collectionGroup(db, 'tokens'))],
  ['R17d collectionGroup secciones',                    (db) => getDocs(collectionGroup(db, 'secciones'))],
  ['R17e collectionGroup masterclassRespuestas',        (db) => getDocs(collectionGroup(db, 'masterclassRespuestas'))],
];
for (const [nombre, op] of LECTURAS_DENEGADAS) test(`DENIEGA ${nombre}`, async () => { await no(op(anon)); });

// ═════════════════════════════════════════════════════════════════════════
// 3. DEBE RECHAZAR — escrituras
// ═════════════════════════════════════════════════════════════════════════
test('R12: escritura en masterclasses / config / cohortes denegada (con y sin campos)', async () => {
  await no(setDoc(doc(anon, 'masterclasses', 'semana1'), { titulo: 'hack' }));
  await no(setDoc(doc(anon, 'masterclasses', 'semana9'), { titulo: 'nuevo' }));
  await no(updateDoc(doc(anon, 'masterclasses', 'semana1'), { activada: false }));
  await no(deleteDoc(doc(anon, 'masterclasses', 'semana1')));
  await no(setDoc(doc(anon, 'config', 'sesiones_live'), { semana1: { zoom_link: 'https://evil.example' } }, { merge: true }));
  await no(setDoc(doc(anon, 'config', 'otro'), { a: 1 }));
  await no(deleteDoc(doc(anon, 'config', 'sesiones_live')));
  await no(setDoc(doc(anon, 'cohortes', 'c2'), { a: 1 }));
  await no(deleteDoc(doc(anon, 'cohortes', 'c1')));
});

test('R12-CLAVE: cliente anónimo + adminKey ANTIGUO → DENEGADO (la clave queda inútil)', async () => {
  const conClave = (extra = {}) => ({ adminKey: CLAVE_ANTIGUA, ...extra });
  await no(setDoc(doc(anon, 'masterclasses', 'semana1'), conClave({ titulo: 'hack' })));
  await no(setDoc(doc(anon, 'masterclasses', 'semana9'), conClave({ titulo: 'nuevo' })));
  await no(setDoc(doc(anon, 'config', 'sesiones_live'), conClave({ semana1: { zoom_link: 'https://evil.example' } }), { merge: true }));
  await no(setDoc(doc(anon, 'cohortes', 'c2'), conClave({ a: 1 })));
  await no(addDoc(collection(anon, 'comunidad'), conClave({ name: 'X', initial: 'X', event: 'evil', hearts: 0, timestamp: serverTimestamp(), tipo: 'automatico' })));
  await no(addDoc(collection(anon, 'comunidad'), conClave({ name: 'X', initial: 'X', event: '<img src=x onerror=alert(1)>', hearts: 9, timestamp: serverTimestamp() })));
  await no(updateDoc(doc(anon, 'comunidad', ID_POST), conClave({ event: 'evil' })));
  await no(setDoc(doc(anon, 'comunidad', ID_POST), conClave({ name: 'X', event: 'evil' }), { merge: true }));
  await no(deleteDoc(doc(anon, 'comunidad', ID_POST)));
});

test('CONTROL de la prueba anterior: las reglas ANTIGUAS sí aceptan esas escrituras con la clave (la prueba es significativa)', async () => {
  const conClave = (extra = {}) => ({ adminKey: CLAVE_ANTIGUA, ...extra });
  await ok(setDoc(doc(anonOld, 'masterclasses', 'semana1'), conClave({ titulo: 'hack' })));
  await ok(setDoc(doc(anonOld, 'config', 'sesiones_live'), conClave({ semana1: { zoom_link: 'https://evil.example' } }), { merge: true }));
  await ok(addDoc(collection(anonOld, 'comunidad'), conClave({ name: 'X', initial: 'X', event: '<img src=x onerror=alert(1)>', hearts: 0, timestamp: serverTimestamp() })));
  // …y sin la clave las antiguas también rechazan (la clave era lo único que las protegía):
  await no(setDoc(doc(anonOld, 'masterclasses', 'semana2'), { titulo: 'sin clave' }));
});

const POSTS_INVALIDOS = [
  ['campo extra',                        { extra: 1 }],
  ['adminKey como campo extra',          { adminKey: 'cualquiera' }],
  ['hearts distinto de 0',               { hearts: 5 }],
  ['hearts negativo',                    { hearts: -1 }],
  ['hearts como texto',                  { hearts: '0' }],
  ['timestamp del cliente (no del servidor)', { timestamp: Timestamp.now() }],
  ['timestamp como texto',               { timestamp: iso() }],
  ['tipo live',                          { tipo: 'live' }],
  ['tipo arbitrario',                    { tipo: 'admin' }],
  ['name de 101 caracteres',             { name: 'n'.repeat(101) }],
  ['name vacío',                         { name: '' }],
  ['name numérico',                      { name: 123 }],
  ['event de 301 caracteres',            { event: 'e'.repeat(301) }],
  ['event vacío',                        { event: '' }],
  ['initial vacío',                      { initial: '' }],
  ['initial de 5 caracteres',            { initial: 'abcde' }],
  ['initial numérico',                   { initial: 7 }],
];
for (const [nombre, cambio] of POSTS_INVALIDOS) {
  test(`R13: crear post — ${nombre} → denegado`, async () => { await no(addDoc(collection(anon, 'comunidad'), postPWA(cambio))); });
}
test('R13: crear post — campo faltante (sin tipo / sin timestamp / sin hearts) → denegado', async () => {
  for (const campo of ['tipo', 'timestamp', 'hearts', 'name', 'initial', 'event']) {
    const p = postPWA(); delete p[campo];
    await no(addDoc(collection(anon, 'comunidad'), p));
  }
});
test('R13: crear post — ID personalizado (no autogenerado) → denegado; ID de 20 alfanuméricos → permitido', async () => {
  await no(setDoc(doc(anon, 'comunidad', 'hola'), postPWA()));
  await no(setDoc(doc(anon, 'comunidad', 'x\');alert(1);'), postPWA()));
  await no(setDoc(doc(anon, 'comunidad', 'a'.repeat(21)), postPWA()));
  await ok(setDoc(doc(anon, 'comunidad', 'zZ9yY8xX7wW6vV5uU4tT'), postPWA()));
});

const ACTUALIZACIONES_INVALIDAS = [
  ['hearts +2',                           { hearts: increment(2) }],
  ['hearts -5',                           { hearts: increment(-5) }],
  ['hearts fijado a 999',                 { hearts: 999 }],
  ['hearts fijado a 0 desde 3',           { hearts: 0 }],
  ['hearts como texto',                   { hearts: '4' }],
  ['hearts decimal',                      { hearts: 3.5 }],
  ['cambiar event',                       { event: 'otro texto' }],
  ['cambiar name',                        { name: 'otra' }],
  ['cambiar timestamp',                   { timestamp: serverTimestamp() }],
  ['hearts +1 junto con event',           { hearts: increment(1), event: 'x' }],
  ['añadir un campo nuevo',               { nuevo: 'campo' }],
  ['añadir adminKey',                     { adminKey: 'x' }],
];
for (const [nombre, cambio] of ACTUALIZACIONES_INVALIDAS) {
  test(`R14: actualizar post — ${nombre} → denegado`, async () => { await no(updateDoc(doc(anon, 'comunidad', ID_POST), cambio)); });
}
test('R14: hearts por debajo de 0 (0 → -1) → denegado', async () => {
  await no(updateDoc(doc(anon, 'comunidad', ID_POST_CERO), { hearts: increment(-1) }));
});
test('R14: sobrescribir un post existente con setDoc (con y sin merge) → denegado', async () => {
  await no(setDoc(doc(anon, 'comunidad', ID_POST), { name: 'X', initial: 'X', event: 'x', hearts: 3, timestamp: serverTimestamp(), tipo: 'automatico' }));
  await no(setDoc(doc(anon, 'comunidad', ID_POST), { event: 'x' }, { merge: true }));
});
test('R15: borrar posts (propios, ajenos, legado) → denegado', async () => {
  await no(deleteDoc(doc(anon, 'comunidad', ID_POST)));
  await no(deleteDoc(doc(anon, 'comunidad', ID_POST_CERO)));
  await no(deleteDoc(doc(anon, 'comunidad', ID_POST_LIVE)));
});

const ESCRITURAS_INVALIDAS = [
  // tokens (legado)
  ['tokens: token vacío',                (db) => setDoc(doc(db, 'tokens', CORREO), { token: '', email: CORREO, fecha: iso() })],
  ['tokens: token de 513',               (db) => setDoc(doc(db, 'tokens', CORREO), { token: 't'.repeat(513), email: CORREO, fecha: iso() })],
  ['tokens: email distinto del ID',      (db) => setDoc(doc(db, 'tokens', CORREO), { token: TOKEN, email: OTRO_CORREO, fecha: iso() })],
  ['tokens: campo extra',                (db) => setDoc(doc(db, 'tokens', CORREO), { token: TOKEN, email: CORREO, fecha: iso(), x: 1 })],
  ['tokens: fecha de 41',                (db) => setDoc(doc(db, 'tokens', CORREO), { token: TOKEN, email: CORREO, fecha: 'f'.repeat(41) })],
  ['tokens: fecha no texto',             (db) => setDoc(doc(db, 'tokens', CORREO), { token: TOKEN, email: CORREO, fecha: 5 })],
  ['tokens: falta un campo',             (db) => setDoc(doc(db, 'tokens', CORREO), { token: TOKEN, email: CORREO })],
  ['tokens: borrar',                     (db) => deleteDoc(doc(db, 'tokens', CORREO))],
  // dispositivos_push
  ['dispositivos: token distinto del ID',(db) => setDoc(doc(db, 'dispositivos_push', CORREO, 'tokens', TOKEN), { token: 'otro', plataforma: 'x', actualizadoEn: iso() })],
  ['dispositivos: campo extra',          (db) => setDoc(doc(db, 'dispositivos_push', CORREO, 'tokens', TOKEN), { token: TOKEN, plataforma: 'x', actualizadoEn: iso(), y: 1 })],
  ['dispositivos: plataforma numérica',  (db) => setDoc(doc(db, 'dispositivos_push', CORREO, 'tokens', TOKEN), { token: TOKEN, plataforma: 7, actualizadoEn: iso() })],
  ['dispositivos: plataforma de 101',    (db) => setDoc(doc(db, 'dispositivos_push', CORREO, 'tokens', TOKEN), { token: TOKEN, plataforma: 'p'.repeat(101), actualizadoEn: iso() })],
  ['dispositivos: actualizadoEn numérico',(db) => setDoc(doc(db, 'dispositivos_push', CORREO, 'tokens', TOKEN), { token: TOKEN, plataforma: 'x', actualizadoEn: 1 })],
  ['dispositivos: falta plataforma',     (db) => setDoc(doc(db, 'dispositivos_push', CORREO, 'tokens', TOKEN), { token: TOKEN, actualizadoEn: iso() })],
  ['dispositivos: token de 513 (ID)',    (db) => { const t = 't'.repeat(513); return setDoc(doc(db, 'dispositivos_push', CORREO, 'tokens', t), { token: t, plataforma: 'x', actualizadoEn: iso() }); }],
  ['dispositivos: borrar',               (db) => deleteDoc(doc(db, 'dispositivos_push', CORREO, 'tokens', TOKEN))],
  // notif_masterclass
  ['notif_masterclass: semana 0',        (db) => setDoc(doc(db, 'notif_masterclass', CORREO), { semana: 0, email: CORREO, solicitadoEn: serverTimestamp() }, { merge: true })],
  ['notif_masterclass: semana 53',       (db) => setDoc(doc(db, 'notif_masterclass', CORREO), { semana: 53, email: CORREO, solicitadoEn: serverTimestamp() }, { merge: true })],
  ['notif_masterclass: semana texto',    (db) => setDoc(doc(db, 'notif_masterclass', CORREO), { semana: '1', email: CORREO, solicitadoEn: serverTimestamp() }, { merge: true })],
  ['notif_masterclass: email ajeno',     (db) => setDoc(doc(db, 'notif_masterclass', CORREO), { semana: 1, email: OTRO_CORREO, solicitadoEn: serverTimestamp() }, { merge: true })],
  ['notif_masterclass: campo extra',     (db) => setDoc(doc(db, 'notif_masterclass', CORREO), { semana: 1, email: CORREO, solicitadoEn: serverTimestamp(), z: 1 }, { merge: true })],
  ['notif_masterclass: fecha del cliente',(db) => setDoc(doc(db, 'notif_masterclass', CORREO), { semana: 1, email: CORREO, solicitadoEn: Timestamp.now() }, { merge: true })],
  ['notif_masterclass: borrar',          (db) => deleteDoc(doc(db, 'notif_masterclass', CORREO))],
  // eventos
  ['eventos: seccion distinta del ID',   (db) => setDoc(doc(db, 'eventos', CORREO, 'secciones', 's3'), { seccion: 's9', nombre: 'A', email: CORREO, timestamp: serverTimestamp(), notifEnviada: false })],
  ['eventos: email ajeno',               (db) => setDoc(doc(db, 'eventos', CORREO, 'secciones', 's3'), { seccion: 's3', nombre: 'A', email: OTRO_CORREO, timestamp: serverTimestamp(), notifEnviada: false })],
  ['eventos: notifEnviada true',         (db) => setDoc(doc(db, 'eventos', CORREO, 'secciones', 's3'), { seccion: 's3', nombre: 'A', email: CORREO, timestamp: serverTimestamp(), notifEnviada: true })],
  ['eventos: nombre de 101',             (db) => setDoc(doc(db, 'eventos', CORREO, 'secciones', 's3'), { seccion: 's3', nombre: 'n'.repeat(101), email: CORREO, timestamp: serverTimestamp(), notifEnviada: false })],
  ['eventos: campo extra',               (db) => setDoc(doc(db, 'eventos', CORREO, 'secciones', 's3'), { seccion: 's3', nombre: 'A', email: CORREO, timestamp: serverTimestamp(), notifEnviada: false, w: 1 })],
  ['eventos: timestamp del cliente',     (db) => setDoc(doc(db, 'eventos', CORREO, 'secciones', 's3'), { seccion: 's3', nombre: 'A', email: CORREO, timestamp: Timestamp.now(), notifEnviada: false })],
  ['eventos: borrar',                    (db) => deleteDoc(doc(db, 'eventos', CORREO, 'secciones', 's1'))],
  // por correo (deuda de identidad): solo se cierra lo demostrado
  ['rachas: borrar',                     (db) => deleteDoc(doc(db, 'rachas', CORREO))],
  ['progreso: borrar',                   (db) => deleteDoc(doc(db, 'progreso', CORREO))],
  ['logros: escribir',                   (db) => setDoc(doc(db, 'logros', CORREO), { logro: 'hack' })],
  ['logros: borrar',                     (db) => deleteDoc(doc(db, 'logros', CORREO))],
  ['notif_log: escribir',                (db) => setDoc(doc(db, 'notif_log', CORREO), { a: 1 })],
  ['notif_log: borrar',                  (db) => deleteDoc(doc(db, 'notif_log', CORREO))],
  ['cuentas: escribir',                  (db) => setDoc(doc(db, 'cuentas', CORREO), { hash: 'hack' })],
  ['workbook_respuestas: escribir (sigue sin regla)', (db) => setDoc(doc(db, 'workbook_respuestas', CORREO), { r: 2 })],
];
for (const [nombre, op] of ESCRITURAS_INVALIDAS) test(`DENIEGA ${nombre}`, async () => { await no(op(anon)); });

test('límites: los mismos valores en su tope exacto SÍ pasan (token de 512, fecha de 40, nombre de 100)', async () => {
  const t = 't'.repeat(512);
  await ok(setDoc(doc(anon, 'tokens', OTRO_CORREO), { token: t, email: OTRO_CORREO, fecha: 'f'.repeat(40) }));
  await ok(setDoc(doc(anon, 'dispositivos_push', OTRO_CORREO, 'tokens', t), { token: t, plataforma: 'p'.repeat(100), actualizadoEn: 'f'.repeat(40) }));
  await ok(setDoc(doc(anon, 'eventos', CORREO, 'secciones', 's5'), { seccion: 's5', nombre: 'n'.repeat(100), email: CORREO, timestamp: serverTimestamp(), notifEnviada: false }));
});

// ═════════════════════════════════════════════════════════════════════════
// 4. ADMIN SDK / backend: las reglas no aplican
// ═════════════════════════════════════════════════════════════════════════
test('ADMIN-1: firebase-admin escribe donde el cliente no puede (masterclasses, config, cohortes, comunidad con otra forma)', async () => {
  // Contraste: el cliente NO puede…
  await no(setDoc(doc(anon, 'masterclasses', 'semana2'), { titulo: 'x' }));
  await no(addDoc(collection(anon, 'comunidad'), { autor: 'Josué', tipo: 'live', esLive: true, hearts: 0, timestamp: serverTimestamp() }));
  // …y Admin SDK sí, sin ninguna clave ni excepción:
  await adminDb.collection('masterclasses').doc('semana2').set({ titulo: 'Semana 2', activada: false });
  await adminDb.collection('config').doc('sesiones_live').set({ semana1: { zoom_link: 'https://zoom.us/j/2' } }, { merge: true });
  await adminDb.collection('cohortes').doc('c9').set({ nombre: 'nueva' });
  // Documento 'live' de la Cloud Function legada y post de un futuro panel (otra forma, sin restricciones de cliente):
  await adminDb.collection('comunidad').add({ autor: 'Josué', avatarLetra: 'J', tipo: 'live', emoji: '🔴', titulo: 'En vivo', texto: 'Entra', cta: 'Entrar', ctaUrl: 'https://zoom.us/j/1', hearts: 0, timestamp: new Date(), esLive: true });
  await adminDb.collection('comunidad').add({ name: 'Josué Calderón', initial: 'J', event: 'Anuncio del panel', hearts: 0, timestamp: new Date(), tipo: 'anuncio' });
  const leido = await adminDb.collection('masterclasses').doc('semana2').get();
  assert.equal(leido.data().titulo, 'Semana 2');
});

test('ADMIN-2: firebase-admin modifica y BORRA posts (lo que el cliente no puede)', async () => {
  await no(deleteDoc(doc(anon, 'comunidad', ID_POST)));
  await adminDb.collection('comunidad').doc(ID_POST).update({ hearts: 10, event: 'moderado' });
  await adminDb.collection('comunidad').doc(ID_POST).delete();
  assert.equal((await adminDb.collection('comunidad').doc(ID_POST).get()).exists, false);
});

test('ADMIN-3: firebase-admin lee y lista lo que el cliente tiene denegado (tokens, dispositivos, notif_*, eventos, cuentas)', async () => {
  await no(getDocs(collection(anon, 'tokens')));
  assert.equal((await adminDb.collection('tokens').get()).size, 1);
  assert.equal((await adminDb.collection('dispositivos_push').doc(CORREO).collection('tokens').get()).size, 1);
  assert.equal((await adminDb.collection('notif_masterclass').get()).size, 1);
  assert.equal((await adminDb.collection('notif_log').get()).size, 1);
  assert.equal((await adminDb.collection('eventos').doc(CORREO).collection('secciones').get()).size, 1);
  assert.equal((await adminDb.collection('cuentas').doc(CORREO).get()).exists, true);
  assert.equal((await adminDb.collectionGroup('tokens').get()).size, 2); // tokens de dispositivos_push/* (Admin puede usar collectionGroup)
});

test('ADMIN-4: REST con token de servicio (como api/_lib/push-fcm.js): lista y borra tokens; sin token, 403', async () => {
  const base = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
  const ruta = `dispositivos_push/${encodeURIComponent(CORREO)}/tokens`;
  const sinToken = await fetch(`${base}/${ruta}?pageSize=100`);
  assert.equal(sinToken.status, 403, 'anónimo por REST: denegado por las reglas');
  const conToken = await fetch(`${base}/${ruta}?pageSize=100`, { headers: { Authorization: 'Bearer owner' } });
  assert.equal(conToken.status, 200, 'token de servicio: las reglas no aplican');
  assert.equal((await conToken.json()).documents.length, 1);
  const borrarAnon = await fetch(`${base}/${ruta}/${TOKEN}`, { method: 'DELETE' });
  assert.equal(borrarAnon.status, 403);
  const borrar = await fetch(`${base}/${ruta}/${TOKEN}`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
  assert.equal(borrar.status, 200, 'el puente puede borrar tokens inválidos');
  const despues = await fetch(`${base}/${ruta}?pageSize=100`, { headers: { Authorization: 'Bearer owner' } });
  assert.deepEqual(await despues.json(), {}, 'ya no hay dispositivos');
});

test('ADMIN-5: contexto con reglas desactivadas (patrón de rules-unit-testing) también lo hace todo', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'masterclasses', 'semana3'), { titulo: 'x' });
    await deleteDoc(doc(db, 'comunidad', ID_POST));
    assert.equal((await getDocs(collection(db, 'tokens'))).size, 1);
  });
});
