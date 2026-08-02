// api/mi-espacio-logout.js — cierra la sesión del dispositivo. Nunca toca la Cuenta.

import { cookieDeLogout } from './_lib/auth-session.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  res.setHeader('Set-Cookie', cookieDeLogout());
  return res.status(200).json({ ok: true });
}
