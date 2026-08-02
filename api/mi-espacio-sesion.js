// api/mi-espacio-sesion.js — permite al frontend saber si ya hay una sesión activa, para
// no volver a pedir correo/contraseña mientras la cookie siga vigente ("si no cierra
// sesión, no vuelve a pedir nada").

import { leerCookie, verificarToken } from './_lib/auth-session.js';
import { obtenerCuenta } from './_lib/cuenta.js';
import { obtenerComprasVigentes } from './_lib/orbit-perfil-acceso.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const token = leerCookie(req);
  const datos = verificarToken(token);
  if (!datos) return res.status(200).json({ autenticado: false });

  try {
    const cuenta = await obtenerCuenta(datos.correo);
    const vigente = cuenta && cuenta.estado === 'activa' && (cuenta.sessionVersion || 0) === datos.sessionVersion;
    if (!vigente) return res.status(200).json({ autenticado: false });

    // Se incluyen las compras acá para que index.html arme la biblioteca con una sola
    // llamada al cargar la página, en vez de una segunda petición aparte (agregado al
    // conectar index.html al backend nuevo, 2026-08-01).
    try {
      const compras = await obtenerComprasVigentes(datos.correo);
      return res.status(200).json({ autenticado: true, correo: datos.correo, compras, emailVerified: !!cuenta.emailVerified });
    } catch (err) {
      // Orbit no respondió — la sesión YA se verificó como válida arriba (cookie + Cuenta).
      // "No se pudo verificar el Derecho" nunca se traduce a "denegado"/"cerrar sesión"
      // (principio cerrado en Fase 1 y reafirmado en el contrato técnico de 3.2) — se
      // informa aparte para que el frontend no saque a la alumna de su propia sesión solo
      // porque Orbit tardó.
      console.error('mi-espacio-sesion: Orbit no respondió, sesión sigue siendo válida:', err.message);
      return res.status(200).json({ autenticado: true, correo: datos.correo, compras: null, emailVerified: !!cuenta.emailVerified, verificacionPendiente: true });
    }
  } catch (err) {
    console.error('mi-espacio-sesion error:', err.message);
    return res.status(200).json({ autenticado: false });
  }
}
