// api/mi-espacio-recuperar-confirmar.js — define la contraseña nueva desde el enlace de
// recuperación. Invalida todas las sesiones anteriores (sessionVersion++) — único uso
// aprobado de ese mecanismo, decisión explícita de Josué (2026-08-01).

import { consumirToken } from './_lib/auth-token.js';
import { actualizarPassword } from './_lib/cuenta.js';
import { hashPassword } from './_lib/auth-password.js';
import { crearToken as crearTokenSesion, cookieDeSesion } from './_lib/auth-session.js';
import { puedeIntentar, registrarIntento, registrarExito } from './_lib/rate-limit.js';
import { ipDelRequest } from './_lib/request-ip.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { token, password } = req.body || {};
  if (!token || !password || String(password).length < 8) {
    return res.status(400).json({ error: 'Datos inválidos. La contraseña debe tener al menos 8 caracteres.' });
  }

  // Rate limiting agregado en la auditoría de 3.1 (hallazgo medio #4) — mismo criterio que
  // mi-espacio-cuenta-activar.js.
  const ip = ipDelRequest(req);
  if (!(await puedeIntentar('ip-token', ip))) {
    return res.status(429).json({ error: 'Demasiados intentos. Inténtalo nuevamente en unos minutos.' });
  }

  try {
    const resultado = await consumirToken(token, 'recuperacion');
    if (!resultado) {
      await registrarIntento('ip-token', ip);
      return res.status(400).json({ error: 'El enlace no es válido o ya expiró.' });
    }

    const passwordHash = hashPassword(password);
    const nuevaVersion = await actualizarPassword(resultado.correo, passwordHash);
    await registrarExito('ip-token', ip);

    const sesion = crearTokenSesion(resultado.correo, nuevaVersion);
    res.setHeader('Set-Cookie', cookieDeSesion(sesion));
    return res.status(200).json({ ok: true, correo: resultado.correo });
  } catch (err) {
    console.error('mi-espacio-recuperar-confirmar error:', err.message);
    return res.status(500).json({ error: 'No se pudo actualizar la contraseña.' });
  }
}
