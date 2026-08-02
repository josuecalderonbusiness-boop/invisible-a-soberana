// api/mi-espacio-recuperar-solicitar.js — "olvidé mi contraseña".
//
// Respuesta siempre genérica; el correo solo se envía si existe una cuenta activa con ese
// correo — mismo principio anti-enumeración que el alta de cuenta.

import { obtenerCuenta, normalizarCorreo } from './_lib/cuenta.js';
import { crearToken } from './_lib/auth-token.js';
import { enviarRecuperacion } from './_lib/email-brevo.js';
import { puedenIntentarTodas, registrarIntento } from './_lib/rate-limit.js';
import { ipDelRequest } from './_lib/request-ip.js';

const BASE_URL = process.env.MI_ESPACIO_BASE_URL || 'https://invisible-a-soberana.vercel.app';
const MENSAJE_GENERICO = { ok: true, mensaje: 'Si ese correo tiene una cuenta con nosotras, te enviamos un enlace para volver a entrar. Revisa también la carpeta de spam, por si acaso.' };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const correo = normalizarCorreo(req.body?.correo);
  // Validación de formato agregada en la auditoría de 3.1 (hallazgo menor #9) — antes
  // inconsistente con mi-espacio-cuenta-solicitar.js, que sí la exigía.
  if (!correo || !correo.includes('@')) return res.status(200).json(MENSAJE_GENERICO);

  const ip = ipDelRequest(req);
  if (!(await puedenIntentarTodas([['ip', ip], ['correo-recuperar', correo]]))) {
    return res.status(429).json({ error: 'Demasiados intentos. Inténtalo nuevamente en unos minutos.' });
  }

  try {
    const cuenta = await obtenerCuenta(correo);
    if (cuenta && cuenta.estado === 'activa') {
      const token = await crearToken(correo, 'recuperacion', 1);
      if (token) {
        // token === null: cooldown de 60s ya activo, no se reenvía (hallazgo menor #11).
        const enlace = `${BASE_URL}/mi-espacio/recuperar.html?token=${encodeURIComponent(token)}`;
        await enviarRecuperacion(correo, enlace);
      }
    }
    // Se cuenta el intento exista o no la cuenta — ni el conteo de intentos ni el mensaje
    // deben delatar si el correo tiene cuenta (principio anti-enumeración, ver rate-limit.js).
    await registrarIntento('ip', ip);
    await registrarIntento('correo-recuperar', correo);
    return res.status(200).json(MENSAJE_GENERICO);
  } catch (err) {
    console.error('mi-espacio-recuperar-solicitar error:', err.message);
    return res.status(200).json(MENSAJE_GENERICO);
  }
}
