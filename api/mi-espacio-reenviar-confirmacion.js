// api/mi-espacio-reenviar-confirmacion.js — botón "Confirmar correo" dentro de Mi Espacio.
// Reenvía el correo de verificación (no bloqueante) para quien todavía tiene
// emailVerified:false. Requiere sesión activa — usa el correo de la cookie, nunca uno
// enviado por el cliente (evitaría que alguien pida verificar un correo ajeno).

import { leerCookie, verificarToken } from './_lib/auth-session.js';
import { obtenerCuenta } from './_lib/cuenta.js';
import { crearToken } from './_lib/auth-token.js';
import { enviarConfirmacionCorreo } from './_lib/email-brevo.js';

const BASE_URL = process.env.MI_ESPACIO_BASE_URL || 'https://invisible-a-soberana.vercel.app';
const MENSAJE_GENERICO = { ok: true, mensaje: 'Te enviamos un correo para confirmar tu cuenta.' };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const token = leerCookie(req);
  const datos = verificarToken(token);
  if (!datos) return res.status(401).json({ error: 'Sesión inválida o expirada.' });

  try {
    const cuenta = await obtenerCuenta(datos.correo);
    const vigente = cuenta && cuenta.estado === 'activa' && (cuenta.sessionVersion || 0) === datos.sessionVersion;
    if (!vigente) return res.status(401).json({ error: 'Sesión inválida o expirada.' });

    if (!cuenta.emailVerified) {
      const tokenVerificacion = await crearToken(datos.correo, 'verificacion_correo', 24 * 7);
      if (tokenVerificacion) {
        const enlace = `${BASE_URL}/mi-espacio/confirmar.html?token=${encodeURIComponent(tokenVerificacion)}`;
        await enviarConfirmacionCorreo(datos.correo, enlace);
      }
      // tokenVerificacion === null: cooldown de 60s ya activo, no se reenvía — igual se
      // responde el mismo mensaje genérico, la alumna ya tiene un enlace vigente.
    }
    return res.status(200).json(MENSAJE_GENERICO);
  } catch (err) {
    console.error('mi-espacio-reenviar-confirmacion error:', err.message);
    return res.status(200).json(MENSAJE_GENERICO);
  }
}
