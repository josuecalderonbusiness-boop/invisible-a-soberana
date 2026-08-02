// api/mi-espacio-login.js — login de Mi Espacio (Fase 3, subfase 3.1).
//
// Correo + contraseña, verificados contra la Cuenta; en cada login se re-verifica el
// Derecho contra Orbit (ver _lib/orbit-perfil-acceso.js, Fase 3.2) — Mi Espacio nunca
// persiste esa autorización como verdad propia, la vuelve a preguntar en cada inicio de
// sesión nuevo.

import { obtenerCuenta, normalizarCorreo } from './_lib/cuenta.js';
import { hashPassword, verifyPassword } from './_lib/auth-password.js';
import { obtenerComprasVigentes } from './_lib/orbit-perfil-acceso.js';
import { crearToken, cookieDeSesion } from './_lib/auth-session.js';
import { puedenIntentarTodas, registrarIntento, registrarExito } from './_lib/rate-limit.js';
import { ipDelRequest } from './_lib/request-ip.js';

const ERROR_GENERICO = 'Correo o contraseña incorrectos.';

// Hash señuelo con costo idéntico a un hash real (mismo scrypt) — se compara contra esto
// cuando la cuenta no existe, para que el tiempo de respuesta sea igual al de una cuenta
// real con contraseña incorrecta. Corrige el timing side-channel encontrado en la
// auditoría de 3.1 (2026-08-01, hallazgo crítico #1): antes, con "cuenta && ... && verifyPassword(...)",
// el corto-circuito evitaba ejecutar scrypt cuando la cuenta no existía, y esa diferencia de
// tiempo delataba si un correo tenía cuenta — exactamente la enumeración que el diseño entero
// se propuso evitar con mensajes genéricos.
const HASH_SEÑUELO = hashPassword('valor-fijo-nunca-usado-como-contraseña-real');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const correo = normalizarCorreo(req.body?.correo);
  const password = req.body?.password || '';
  if (!correo || !password) return res.status(400).json({ error: ERROR_GENERICO });

  const ip = ipDelRequest(req);
  if (!(await puedenIntentarTodas([['ip', ip], ['correo', correo]]))) {
    return res.status(429).json({ error: 'Demasiados intentos. Inténtalo nuevamente en unos minutos.' });
  }

  try {
    const cuenta = await obtenerCuenta(correo);
    const cuentaLista = cuenta && cuenta.estado === 'activa';
    // Se ejecuta siempre, exista o no la cuenta — mismo costo de cómputo en ambos casos.
    const passwordCorrecta = verifyPassword(password, cuentaLista ? cuenta.passwordHash : HASH_SEÑUELO);
    const passwordOk = cuentaLista && passwordCorrecta;

    if (!passwordOk) {
      await registrarIntento('ip', ip);
      await registrarIntento('correo', correo);
      return res.status(401).json({ error: ERROR_GENERICO });
    }

    // Una sola consulta cubre "¿hay Derecho?" y "¿qué compras mostrar en la biblioteca?" —
    // antes eran dos llamadas separadas (tieneDerechoVigente + una consulta aparte desde
    // index.html); se unificaron al conectar index.html al backend nuevo, 2026-08-01.
    const compras = await obtenerComprasVigentes(correo);
    if (compras.length === 0) {
      // Cuenta y contraseña correctas, pero sin Derecho vigente (ej. reembolso) — mismo
      // mensaje genérico, nunca se distingue de una contraseña incorrecta. Se cuenta contra
      // IP y correo por igual (decisión explícita, auditoría de 3.1: consistencia con el
      // resto de fallos de este endpoint, en vez de tratamiento especial para este caso).
      await registrarIntento('ip', ip);
      await registrarIntento('correo', correo);
      return res.status(401).json({ error: ERROR_GENERICO });
    }

    await registrarExito('ip', ip);
    await registrarExito('correo', correo);

    const sesion = crearToken(correo, cuenta.sessionVersion || 0);
    res.setHeader('Set-Cookie', cookieDeSesion(sesion));
    return res.status(200).json({ ok: true, correo, compras, emailVerified: !!cuenta.emailVerified });
  } catch (err) {
    console.error('mi-espacio-login error:', err.message);
    return res.status(500).json({ error: 'No se pudo iniciar sesión.' });
  }
}
