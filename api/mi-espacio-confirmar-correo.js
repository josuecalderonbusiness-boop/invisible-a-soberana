// api/mi-espacio-confirmar-correo.js — marca el correo como verificado (paso NO bloqueante,
// posterior a la creación de la cuenta). No otorga acceso ni crea sesión — la cuenta ya
// estaba activa desde que se creó la contraseña (mi-espacio-cuenta-crear.js).

import { consumirToken } from './_lib/auth-token.js';
import { marcarCorreoVerificado } from './_lib/cuenta.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Falta el token.' });

  try {
    const resultado = await consumirToken(token, 'verificacion_correo');
    if (!resultado) return res.status(400).json({ error: 'El enlace no es válido o ya expiró.' });

    await marcarCorreoVerificado(resultado.correo);
    return res.status(200).json({ ok: true, correo: resultado.correo });
  } catch (err) {
    console.error('mi-espacio-confirmar-correo error:', err.message);
    return res.status(500).json({ error: 'No se pudo confirmar el correo.' });
  }
}
