// api/_lib/rate-limit.js — rate limiting persistente en Firestore (por IP y por correo).
//
// A diferencia del limitador en memoria de orbit-mc/lib/auth.js (aceptable ahí para 2
// usuarios internos conocidos), un login público en funciones serverless de Vercel no
// puede confiar en un Map en RAM: cada invocación puede correr en una instancia distinta,
// así que un ataque distribuido no queda contenido. Este módulo persiste el contador en
// Firestore para que sobreviva entre invocaciones (hallazgo de la auditoría de 3.1, 2026-08-01).
//
// No es un incremento atómico transaccional (lectura + escritura vía REST simple) —
// aceptable para anti-abuso, no para conteo financiero; misma filosofía de simplicidad
// deliberada que el limitador que reemplaza.

import { fsGet, fsSet } from './firestore-rest.js';

const COLECCION = 'mi_espacio_rate_limit';
const MAX_INTENTOS = 5;
const VENTANA_MS = 15 * 60 * 1000;
const BLOQUEO_MS = 15 * 60 * 1000;

function claveId(tipo, valor) {
  return `${tipo}__${Buffer.from(String(valor)).toString('base64url')}`;
}

async function puedeIntentar(tipo, valor) {
  const registro = await fsGet(COLECCION, claveId(tipo, valor));
  if (!registro) return true;
  if (registro.bloqueadoHasta && registro.bloqueadoHasta > Date.now()) return false;
  return true;
}

// Verifica varias claves a la vez (ej. IP y correo) — true solo si todas permiten intentar.
// Extraído en la segunda auditoría de 3.1 (2026-08-01): el patrón
// "if (!(await puedeIntentar(...)) || !(await puedeIntentar(...)))" estaba repetido igual
// en 3 endpoints.
async function puedenIntentarTodas(claves) {
  for (const [tipo, valor] of claves) {
    if (!(await puedeIntentar(tipo, valor))) return false;
  }
  return true;
}

// Renombrado en la auditoría de 3.1 (2026-08-01, hallazgo menor #10): antes se llamaba
// "registrarIntentoFallido", pero también se usaba en caminos exitosos (ej. recuperar
// contraseña siempre cuenta el intento, exista o no la cuenta, para no filtrar por
// conteo) — el nombre "Fallido" engañaba a quien leyera el código después. "registrarIntento"
// es neutral: solo incrementa el contador, sin implicar éxito o fracaso de negocio.
async function registrarIntento(tipo, valor) {
  const id = claveId(tipo, valor);
  const ahora = Date.now();
  const registro = (await fsGet(COLECCION, id)) || { intentos: 0, primerIntento: ahora, bloqueadoHasta: 0 };

  if (ahora - registro.primerIntento > VENTANA_MS) {
    registro.intentos = 0;
    registro.primerIntento = ahora;
  }
  registro.intentos += 1;
  if (registro.intentos >= MAX_INTENTOS) registro.bloqueadoHasta = ahora + BLOQUEO_MS;

  await fsSet(COLECCION, id, registro);
}

async function registrarExito(tipo, valor) {
  await fsSet(COLECCION, claveId(tipo, valor), { intentos: 0, primerIntento: Date.now(), bloqueadoHasta: 0 });
}

export { puedeIntentar, puedenIntentarTodas, registrarIntento, registrarExito };
