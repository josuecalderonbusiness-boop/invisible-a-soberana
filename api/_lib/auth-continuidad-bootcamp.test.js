// api/_lib/auth-continuidad-bootcamp.test.js — pruebas de la cookie de
// continuidad de Puerta B entre /bienvenida-bootcamp y /workbook (Puerta 5,
// onboarding de instalación). Mismo estilo que auth-clase-gratuita.test.js:
// node:test, sin tocar red ni Firestore.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.BOOTCAMP_CONTINUIDAD_SECRET = process.env.BOOTCAMP_CONTINUIDAD_SECRET || 'shh-bootcamp-continuidad-test';
const { COOKIE_NAME, crearToken, verificarToken, cookieDeContinuidad, leerCookie, construirCookieSiCorresponde } = await import('./auth-continuidad-bootcamp.js');

const CORREO = 'compradora@correo.com';

test('COOKIE_NAME es distinto de mi_espacio_sesion y de clase_gratuita_sesion', () => {
  assert.equal(COOKIE_NAME, 'bootcamp_continuidad');
  assert.notEqual(COOKIE_NAME, 'mi_espacio_sesion');
  assert.notEqual(COOKIE_NAME, 'clase_gratuita_sesion');
});

test('crearToken + verificarToken: roundtrip válido devuelve solo el correo', () => {
  const token = crearToken(CORREO);
  const datos = verificarToken(token);
  assert.deepEqual(datos, { correo: CORREO });
});

test('verificarToken: el payload nunca contiene activo, derechos ni bootcampHitos', () => {
  const token = crearToken(CORREO);
  const [payload] = token.split('.');
  const decodificado = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  assert.deepEqual(Object.keys(decodificado).sort(), ['correo', 'exp', 'tipo']);
  assert.equal('activo' in decodificado, false);
  assert.equal('bootcampHitos' in decodificado, false);
});

test('verificarToken: rechaza un token con la firma manipulada', () => {
  const token = crearToken(CORREO);
  const [payload] = token.split('.');
  const firmaFalsa = crypto.createHmac('sha256', 'otro-secreto-cualquiera').update(payload).digest('base64url');
  assert.equal(verificarToken(`${payload}.${firmaFalsa}`), null);
});

test('verificarToken: rechaza un token con el payload alterado (mismo correo cambiado, misma firma vieja)', () => {
  const token = crearToken(CORREO);
  const [, firma] = token.split('.');
  const payloadAjeno = Buffer.from(JSON.stringify({ correo: 'otra@correo.com', tipo: 'bootcamp_continuidad', exp: 9999999999 })).toString('base64url');
  assert.equal(verificarToken(`${payloadAjeno}.${firma}`), null);
});

test('verificarToken: rechaza un token de otro tipo, aunque esté firmado con el secreto correcto', () => {
  const payload = Buffer.from(JSON.stringify({ correo: CORREO, tipo: 'otra-cosa', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const firma = crypto.createHmac('sha256', process.env.BOOTCAMP_CONTINUIDAD_SECRET).update(payload).digest('base64url');
  assert.equal(verificarToken(`${payload}.${firma}`), null);
});

test('verificarToken: rechaza un payload con forma de mi_espacio_sesion (sessionVersion en vez de tipo)', () => {
  const payload = Buffer.from(JSON.stringify({ correo: CORREO, sessionVersion: 0, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const firma = crypto.createHmac('sha256', process.env.BOOTCAMP_CONTINUIDAD_SECRET).update(payload).digest('base64url');
  assert.equal(verificarToken(`${payload}.${firma}`), null);
});

test('verificarToken: rechaza un token expirado', () => {
  const payload = Buffer.from(JSON.stringify({ correo: CORREO, tipo: 'bootcamp_continuidad', exp: Math.floor(Date.now() / 1000) - 10 })).toString('base64url');
  const firma = crypto.createHmac('sha256', process.env.BOOTCAMP_CONTINUIDAD_SECRET).update(payload).digest('base64url');
  assert.equal(verificarToken(`${payload}.${firma}`), null);
});

test('verificarToken: rechaza basura / formato inválido', () => {
  assert.equal(verificarToken('esto-no-es-un-token'), null);
  assert.equal(verificarToken(''), null);
  assert.equal(verificarToken(null), null);
});

test('leerCookie: encuentra bootcamp_continuidad aunque venga junto a mi_espacio_sesion en el mismo header, y no las confunde', () => {
  const token = crearToken(CORREO);
  const req = { headers: { cookie: `mi_espacio_sesion=algun-token-de-cuenta; ${COOKIE_NAME}=${token}` } };
  assert.equal(leerCookie(req), token);
});

test('leerCookie: null si solo hay mi_espacio_sesion', () => {
  const req = { headers: { cookie: 'mi_espacio_sesion=algun-token-de-cuenta' } };
  assert.equal(leerCookie(req), null);
});

// ── construirCookieSiCorresponde — decisión pura, sin red, de si
// workbookAccesoAccion debe emitir la cookie. ──

test('construirCookieSiCorresponde: con correo, arma una cookie válida y verificable', () => {
  const resultado = construirCookieSiCorresponde(CORREO);
  assert.ok(resultado);
  assert.match(resultado.cookie, /^bootcamp_continuidad=/);
  const token = resultado.cookie.split(';')[0].split('=')[1];
  assert.deepEqual(verificarToken(token), { correo: CORREO });
});

test('construirCookieSiCorresponde: null sin correo', () => {
  assert.equal(construirCookieSiCorresponde(null), null);
  assert.equal(construirCookieSiCorresponde(''), null);
});

test('cookieDeContinuidad: usa el nombre correcto, las mismas banderas de seguridad (HttpOnly, Secure, SameSite=Strict) y una duración corta (20 min)', () => {
  const token = crearToken(CORREO);
  const cookie = cookieDeContinuidad(token);
  assert.match(cookie, /^bootcamp_continuidad=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Max-Age=1200/);
});
