// api/mi-espacio-cuenta-solicitar.js — primer paso del login: la alumna escribe su correo.
//
// Regla de negocio permanente (2026-08-01): Orbit siempre confirma el Derecho antes de
// mostrar cualquier formulario. Secuencia: (1) verificar Derecho contra Orbit (ver
// _lib/orbit-perfil-acceso.js, Fase 3.2) → (2) si no hay Derecho, terminar sin crear cuenta →
// (3) si hay Derecho y no existe cuenta, indicar al frontend que muestre el formulario de
// creación de contraseña de inmediato (decisión de negocio 2026-08-01: prioriza no romper
// el impulso de compra — ver mi-espacio-cuenta-crear.js, donde se crea la cuenta en sí).
// Motivo del mensaje genérico: nunca revelar si un correo existe en otra parte del sistema
// (protección contra enumeración de usuarios).

import { tieneDerechoVigente } from './_lib/orbit-perfil-acceso.js';
import { obtenerCuenta, normalizarCorreo } from './_lib/cuenta.js';
import { puedenIntentarTodas, registrarIntento, registrarExito } from './_lib/rate-limit.js';
import { ipDelRequest } from './_lib/request-ip.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const correo = normalizarCorreo(req.body?.correo);
  if (!correo || !correo.includes('@')) return res.status(400).json({ error: 'Correo inválido.' });

  const ip = ipDelRequest(req);
  if (!(await puedenIntentarTodas([['ip', ip], ['correo', correo]]))) {
    return res.status(429).json({ error: 'Demasiados intentos. Inténtalo nuevamente en unos minutos.' });
  }

  try {
    const cuentaExistente = await obtenerCuenta(correo);
    // Se consulta siempre, incluso si la cuenta ya existe y no hace falta el resultado —
    // equaliza el tiempo de respuesta entre "ya tiene cuenta" y "no existe" (auditoría de
    // 3.1, 2026-08-01, hallazgo medio #6).
    const hayDerecho = await tieneDerechoVigente(correo);

    if (cuentaExistente) {
      await registrarExito('ip', ip);
      return res.status(200).json({ ok: true, accion: 'iniciar_sesion' });
    }

    if (!hayDerecho) {
      await registrarIntento('ip', ip);
      await registrarIntento('correo', correo);
      // Mensaje genérico — nunca revela si el correo existe en otra parte del sistema.
      return res.status(200).json({ ok: false, error: 'No encontramos una compra asociada a ese correo.' });
    }

    await registrarExito('ip', ip);
    return res.status(200).json({ ok: true, accion: 'crear_cuenta' });
  } catch (err) {
    console.error('mi-espacio-cuenta-solicitar error:', err.message);
    return res.status(500).json({ error: 'No se pudo procesar la solicitud.' });
  }
}
