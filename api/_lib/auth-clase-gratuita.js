// api/_lib/auth-clase-gratuita.js — sesión temporal de la experiencia gratuita
// (Puerta 2, Slice 3). Módulo hermano de auth-session.js, deliberadamente
// separado y no una generalización de él — ver el diseño aprobado 2026-09-09:
// esta cookie autoriza "acceso temporal a UNA convocatoria concreta", nunca
// "esta persona tiene una Cuenta en Mi Espacio". Mezclar los dos mecanismos
// (mismo secreto, mismo módulo, misma cookie) habría dejado una puerta
// implícita entre ambos mundos que no queremos que exista.
//
// Mismo patrón criptográfico que auth-session.js (HMAC-SHA256, base64url,
// comparación timing-safe) pero con secreto propio (CLASE_GRATUITA_SESSION_SECRET)
// — decisión explícita de Josué: si algún día hay que rotar/revocar las
// sesiones de clase gratuita, no debe tener ninguna relación con las
// sesiones permanentes de las clientas.

import crypto from 'node:crypto';

const COOKIE_NAME = 'clase_gratuita_sesion';
const TIPO = 'clase_gratuita';
const MARGEN_SEGURIDAD_SEGUNDOS = 12 * 60 * 60; // 12h de margen sobre fecha_hora + ventana_replay_horas
const SECRET = process.env.CLASE_GRATUITA_SESSION_SECRET;

function base64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

// exp se calcula UNA sola vez, al emitir la cookie, a partir de datos que
// Orbit ya devuelve en la misma respuesta del registro (fecha_hora +
// ventana_replay_horas) — nunca se recalcula después (mismo principio de
// "hecho congelado en el instante" que ya rige el resto de Puerta 2).
function calcularExpiracion(fechaHoraConvocatoria, ventanaReplayHoras) {
  const finConvocatoria = new Date(fechaHoraConvocatoria).getTime();
  const finReplayMs = finConvocatoria + ventanaReplayHoras * 60 * 60 * 1000;
  return Math.floor(finReplayMs / 1000) + MARGEN_SEGURIDAD_SEGUNDOS;
}

function crearToken(correo, convocatoriaId, fechaHoraConvocatoria, ventanaReplayHoras) {
  if (!SECRET) throw new Error('CLASE_GRATUITA_SESSION_SECRET no configurada');
  const exp = calcularExpiracion(fechaHoraConvocatoria, ventanaReplayHoras);
  const payload = base64url(JSON.stringify({ correo, convocatoriaId, tipo: TIPO, exp }));
  const firma = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${firma}`;
}

// Verifica firma, forma exacta del payload y tipo — un token de otra forma
// (ej. el de mi_espacio_sesion, que no tiene convocatoriaId/tipo y sí tiene
// sessionVersion) se rechaza aquí aunque estuviera firmado con el secreto
// correcto, porque la forma del contenido no coincide con lo que este
// verificador exige explícitamente.
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
  if (
    !datos ||
    typeof datos.correo !== 'string' ||
    typeof datos.convocatoriaId !== 'string' ||
    datos.tipo !== TIPO ||
    typeof datos.exp !== 'number'
  ) {
    return null;
  }
  if (datos.exp < Math.floor(Date.now() / 1000)) return null; // expirada

  return { correo: datos.correo, convocatoriaId: datos.convocatoriaId };
}

function cookieDeClaseGratuita(token, exp) {
  const maxAge = Math.max(0, exp - Math.floor(Date.now() / 1000));
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
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

// Puerta 2 — Slice 3: decisión pura de "¿corresponde emitir la cookie?",
// separada a propósito de cualquier llamada de red — recibe la
// experienciaGratuitaActiva ya resuelta (por quien la haya consultado) y
// solo arma el token+cookie si trae lo mínimo necesario. Sin esto, la
// única forma de probar esta lógica sería atravesando el rate-limiter
// (Firestore) del endpoint que la usa — mismo límite de testabilidad ya
// documentado en mi-espacio-auth.test.js para el resto de acciones.
function construirCookieSiCorresponde(correo, experiencia) {
  if (!experiencia || !experiencia.convocatoriaId || !experiencia.fechaHora) return null;
  const ventanaReplayHoras = experiencia.ventanaReplayHoras || 0;
  const token = crearToken(correo, experiencia.convocatoriaId, experiencia.fechaHora, ventanaReplayHoras);
  const exp = calcularExpiracion(experiencia.fechaHora, ventanaReplayHoras);
  return { cookie: cookieDeClaseGratuita(token, exp), exp };
}

export { COOKIE_NAME, crearToken, verificarToken, cookieDeClaseGratuita, leerCookie, calcularExpiracion, construirCookieSiCorresponde };
