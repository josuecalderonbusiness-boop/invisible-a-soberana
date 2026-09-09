// api/_lib/auth-clase-gratuita.test.js — pruebas del módulo de sesión
// temporal de clase gratuita (Puerta 2, Slice 3). Mismo estilo que el resto
// del repo: node:test, sin tocar red ni Firestore (este módulo no los usa).

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// El módulo lee CLASE_GRATUITA_SESSION_SECRET de process.env en su ámbito de
// carga — mismo gotcha ya documentado en el resto de tests de este repo: se
// fija antes del import dinámico para que llegue a tiempo.
process.env.CLASE_GRATUITA_SESSION_SECRET = process.env.CLASE_GRATUITA_SESSION_SECRET || 'shh-clase-gratuita-test';
const { COOKIE_NAME, crearToken, verificarToken, cookieDeClaseGratuita, leerCookie, calcularExpiracion, construirCookieSiCorresponde } = await import('./auth-clase-gratuita.js');

const CORREO = 'alumna@correo.com';
const CONVOCATORIA_ID = 'he-intentado-todo-2026-09';
const FECHA_HORA = '2026-09-27T00:00:00.000Z'; // 26 sept 7pm Bogotá
const VENTANA_REPLAY_HORAS = 72;

test('COOKIE_NAME es distinto de mi_espacio_sesion', () => {
  assert.equal(COOKIE_NAME, 'clase_gratuita_sesion');
  assert.notEqual(COOKIE_NAME, 'mi_espacio_sesion');
});

test('crearToken + verificarToken: roundtrip válido devuelve correo y convocatoriaId', () => {
  const token = crearToken(CORREO, CONVOCATORIA_ID, FECHA_HORA, VENTANA_REPLAY_HORAS);
  const datos = verificarToken(token);
  assert.deepEqual(datos, { correo: CORREO, convocatoriaId: CONVOCATORIA_ID });
});

test('verificarToken: rechaza un token con la firma manipulada', () => {
  const token = crearToken(CORREO, CONVOCATORIA_ID, FECHA_HORA, VENTANA_REPLAY_HORAS);
  const [payload] = token.split('.');
  const firmaFalsa = crypto.createHmac('sha256', 'otro-secreto-cualquiera').update(payload).digest('base64url');
  assert.equal(verificarToken(`${payload}.${firmaFalsa}`), null);
});

test('verificarToken: rechaza un token con el payload alterado (misma firma vieja)', () => {
  const token = crearToken(CORREO, CONVOCATORIA_ID, FECHA_HORA, VENTANA_REPLAY_HORAS);
  const [, firma] = token.split('.');
  const payloadAjeno = Buffer.from(JSON.stringify({ correo: 'otra@correo.com', convocatoriaId: CONVOCATORIA_ID, tipo: 'clase_gratuita', exp: 9999999999 })).toString('base64url');
  assert.equal(verificarToken(`${payloadAjeno}.${firma}`), null);
});

test('verificarToken: rechaza un token de otro tipo, aunque esté firmado con el secreto correcto', () => {
  const payload = Buffer.from(JSON.stringify({ correo: CORREO, convocatoriaId: CONVOCATORIA_ID, tipo: 'otra-cosa', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const firma = crypto.createHmac('sha256', process.env.CLASE_GRATUITA_SESSION_SECRET).update(payload).digest('base64url');
  assert.equal(verificarToken(`${payload}.${firma}`), null);
});

test('verificarToken: rechaza un payload con forma de mi_espacio_sesion (sessionVersion en vez de convocatoriaId/tipo)', () => {
  const payload = Buffer.from(JSON.stringify({ correo: CORREO, sessionVersion: 0, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const firma = crypto.createHmac('sha256', process.env.CLASE_GRATUITA_SESSION_SECRET).update(payload).digest('base64url');
  assert.equal(verificarToken(`${payload}.${firma}`), null);
});

test('verificarToken: rechaza un token expirado', () => {
  const payload = Buffer.from(JSON.stringify({ correo: CORREO, convocatoriaId: CONVOCATORIA_ID, tipo: 'clase_gratuita', exp: Math.floor(Date.now() / 1000) - 10 })).toString('base64url');
  const firma = crypto.createHmac('sha256', process.env.CLASE_GRATUITA_SESSION_SECRET).update(payload).digest('base64url');
  assert.equal(verificarToken(`${payload}.${firma}`), null);
});

test('verificarToken: rechaza basura / formato inválido', () => {
  assert.equal(verificarToken('esto-no-es-un-token'), null);
  assert.equal(verificarToken(''), null);
  assert.equal(verificarToken(null), null);
});

test('calcularExpiracion: fecha_hora + ventana_replay_horas + 12h de margen', () => {
  const exp = calcularExpiracion(FECHA_HORA, VENTANA_REPLAY_HORAS);
  const esperado = Math.floor((new Date(FECHA_HORA).getTime() + VENTANA_REPLAY_HORAS * 3600 * 1000) / 1000) + 12 * 3600;
  assert.equal(exp, esperado);
});

test('leerCookie: encuentra clase_gratuita_sesion aunque venga junto a mi_espacio_sesion en el mismo header, y no las confunde', () => {
  const token = crearToken(CORREO, CONVOCATORIA_ID, FECHA_HORA, VENTANA_REPLAY_HORAS);
  const req = { headers: { cookie: `mi_espacio_sesion=algun-token-de-cuenta; ${COOKIE_NAME}=${token}` } };
  assert.equal(leerCookie(req), token);
});

test('leerCookie: null si solo hay mi_espacio_sesion (esta cookie nunca se confunde con la de Cuenta)', () => {
  const req = { headers: { cookie: 'mi_espacio_sesion=algun-token-de-cuenta' } };
  assert.equal(leerCookie(req), null);
});

// ── construirCookieSiCorresponde (Puerta 2, Slice 3) — decisión pura, sin
// red ni Firestore, de si registroGratuitoAccion debe emitir la cookie.
// Es la pieza que reemplaza la necesidad de probar el camino feliz completo
// de registro-gratuito, que no es testeable localmente (rate-limit sobre
// Firestore real, mismo límite ya documentado en mi-espacio-auth.test.js). ──

const EXPERIENCIA_VALIDA = { convocatoriaId: CONVOCATORIA_ID, fechaHora: FECHA_HORA, ventanaReplayHoras: VENTANA_REPLAY_HORAS, fase: 'espera' };

test('construirCookieSiCorresponde: con experiencia completa, arma una cookie válida y verificable', () => {
  const resultado = construirCookieSiCorresponde(CORREO, EXPERIENCIA_VALIDA);
  assert.ok(resultado);
  assert.match(resultado.cookie, /^clase_gratuita_sesion=/);
  const token = resultado.cookie.split(';')[0].split('=')[1];
  assert.deepEqual(verificarToken(token), { correo: CORREO, convocatoriaId: CONVOCATORIA_ID });
});

test('construirCookieSiCorresponde: null si no hay experiencia', () => {
  assert.equal(construirCookieSiCorresponde(CORREO, null), null);
});

test('construirCookieSiCorresponde: null si la experiencia no trae convocatoriaId', () => {
  assert.equal(construirCookieSiCorresponde(CORREO, { fechaHora: FECHA_HORA, ventanaReplayHoras: VENTANA_REPLAY_HORAS }), null);
});

test('construirCookieSiCorresponde: null si la experiencia no trae fechaHora', () => {
  assert.equal(construirCookieSiCorresponde(CORREO, { convocatoriaId: CONVOCATORIA_ID, ventanaReplayHoras: VENTANA_REPLAY_HORAS }), null);
});

test('cookieDeClaseGratuita: usa el nombre correcto y las mismas banderas de seguridad que la sesión real (HttpOnly, Secure, SameSite=Strict)', () => {
  const token = crearToken(CORREO, CONVOCATORIA_ID, FECHA_HORA, VENTANA_REPLAY_HORAS);
  const exp = calcularExpiracion(FECHA_HORA, VENTANA_REPLAY_HORAS);
  const cookie = cookieDeClaseGratuita(token, exp);
  assert.match(cookie, /^clase_gratuita_sesion=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
});
