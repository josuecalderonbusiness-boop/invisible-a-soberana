// api/_lib/auth-session.js — sesión de Mi Espacio: cookie HttpOnly firmada (HMAC),
// expiración deslizante por inactividad.
//
// Mismo patrón ya probado en producción por orbit-mc/lib/auth.js, adaptado a: (a) identidad
// = correo, no un usuario de lista cerrada; (b) expiración deslizante de 90 días en vez de
// fija; (c) sessionVersion embebido para poder invalidar sesiones anteriores al cambiar
// contraseña, sin necesidad de un almacén de sesiones con estado.
//
// La Cuenta nunca expira — solo esta cookie. Ver api/_lib/cuenta.js.

import crypto from 'node:crypto';

const COOKIE_NAME = 'mi_espacio_sesion';
const DURACION_SEGUNDOS = 90 * 24 * 60 * 60; // 90 días de inactividad, renovados en cada uso
const SESSION_SECRET = process.env.MI_ESPACIO_SESSION_SECRET;

function base64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function crearToken(correo, sessionVersion) {
  if (!SESSION_SECRET) throw new Error('MI_ESPACIO_SESSION_SECRET no configurada');
  const exp = Math.floor(Date.now() / 1000) + DURACION_SEGUNDOS;
  const payload = base64url(JSON.stringify({ correo, sessionVersion, exp }));
  const firma = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${firma}`;
}

function verificarToken(token) {
  if (!SESSION_SECRET || !token) return null;
  const partes = token.split('.');
  if (partes.length !== 2) return null;
  const [payload, firma] = partes;

  const firmaEsperada = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const a = Buffer.from(firma);
  const b = Buffer.from(firmaEsperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let datos;
  try {
    datos = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (
    !datos ||
    typeof datos.correo !== 'string' ||
    typeof datos.sessionVersion !== 'number' ||
    typeof datos.exp !== 'number'
  ) {
    return null;
  }
  if (datos.exp < Math.floor(Date.now() / 1000)) return null; // expirada

  return { correo: datos.correo, sessionVersion: datos.sessionVersion };
}

function cookieDeSesion(token) {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${DURACION_SEGUNDOS}`;
}

function cookieDeLogout() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

function leerCookie(req) {
  const raw = req.headers && req.headers.cookie;
  if (!raw) return null;
  const partes = raw.split(';').map((p) => p.trim());
  for (const parte of partes) {
    const idx = parte.indexOf('=');
    if (idx === -1) continue;
    if (parte.slice(0, idx) === COOKIE_NAME) return decodeURIComponent(parte.slice(idx + 1));
  }
  return null;
}

export { COOKIE_NAME, DURACION_SEGUNDOS, crearToken, verificarToken, cookieDeSesion, cookieDeLogout, leerCookie };
