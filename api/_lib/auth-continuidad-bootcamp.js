// api/_lib/auth-continuidad-bootcamp.js — continuidad de identidad de Puerta B
// entre /bienvenida-bootcamp y /workbook (Puerta 5, onboarding de instalación,
// diseño cerrado 2026-09-16). Módulo hermano de auth-session.js y
// auth-clase-gratuita.js, deliberadamente separado y con secreto propio —
// mismo criterio ya cerrado para auth-clase-gratuita.js: esta cookie no
// tiene ninguna relación con las sesiones de Cuenta (mi_espacio_sesion,
// sessionVersion) ni con el acceso temporal de la experiencia gratuita.
//
// Esta cookie NUNCA otorga acceso ni transporta un derecho — transporta
// ÚNICAMENTE el correo, para que /workbook pueda repetir la verificación
// real contra /api/workbook-acceso (Orbit) sin pedirle a la compradora que
// lo vuelva a escribir. `activo`/`bootcampHitos`/`replayCompradoActivo`
// jamás viajan aquí — quien lea esta cookie está obligado a volver a
// preguntarle a Orbit, nunca a confiar en lo que ella diga.
//
// Duración corta (20 min) a propósito: es un puente para la MISMA sesión de
// compra (bienvenida → instalar → abrir la app), nunca un "recuérdame"
// permanente — pasado ese margen, cae al login tradicional de Puerta B sin
// que eso sea un error.

import crypto from 'node:crypto';

const COOKIE_NAME = 'bootcamp_continuidad';
const TIPO = 'bootcamp_continuidad';
const DURACION_SEGUNDOS = 20 * 60;
const SECRET = process.env.BOOTCAMP_CONTINUIDAD_SECRET;

function base64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function crearToken(correo) {
  if (!SECRET) throw new Error('BOOTCAMP_CONTINUIDAD_SECRET no configurada');
  const exp = Math.floor(Date.now() / 1000) + DURACION_SEGUNDOS;
  const payload = base64url(JSON.stringify({ correo, tipo: TIPO, exp }));
  const firma = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${firma}`;
}

// Verifica firma, forma exacta del payload y tipo — un token de otra cookie
// (mi_espacio_sesion, clase_gratuita_sesion) se rechaza aquí aunque
// estuviera firmado con SU propio secreto correcto, porque la forma del
// contenido no coincide con lo que este verificador exige explícitamente.
function verificarToken(token) {
  if (!SECRET || !token) return null;
  const partes = token.split('.');
  if (partes.length !== 2) return null;
  const [payload, firma] = partes;

  const firmaEsperada = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  const a = Buffer.from(firma);
  const b = Buffer.from(firmaEsperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let datos;
  try {
    datos = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!datos || typeof datos.correo !== 'string' || datos.tipo !== TIPO || typeof datos.exp !== 'number') {
    return null;
  }
  if (datos.exp < Math.floor(Date.now() / 1000)) return null; // expirada

  return { correo: datos.correo };
}

function cookieDeContinuidad(token) {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${DURACION_SEGUNDOS}`;
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

// Decisión pura de "¿corresponde emitir la cookie?", separada a propósito
// de cualquier llamada de red — mismo criterio de testabilidad que
// construirCookieSiCorresponde() de auth-clase-gratuita.js. Sin SECRET
// configurada, no revienta el flujo de acceso ya confirmado: simplemente no
// hay continuidad esta vez (mismo criterio que bootcampHitos/replayCompradoActivo
// en workbookAccesoAccion — un extra que puede faltar sin negar el acceso real).
function construirCookieSiCorresponde(correo) {
  if (!correo || !SECRET) return null;
  const token = crearToken(correo);
  return { cookie: cookieDeContinuidad(token) };
}

export { COOKIE_NAME, DURACION_SEGUNDOS, crearToken, verificarToken, cookieDeContinuidad, leerCookie, construirCookieSiCorresponde };
