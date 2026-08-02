// api/mi-espacio-cuenta-crear.js — crea la cuenta con contraseña de inmediato y abre sesión
// (Fase 3, subfase 3.1 — decisión de negocio 2026-08-01).
//
// Reemplaza el flujo anterior (activar cuenta vía token de correo). Ahora: la alumna ya vio
// el formulario de contraseña en el mismo momento en que Mi Espacio confirmó su Derecho
// (mi-espacio-cuenta-solicitar.js) — acá se crea la cuenta y se entra de una vez, sin
// depender de que abra su correo primero. La confirmación de correo se dispara después, sin
// bloquear nada (ver enviarConfirmacionCorreo).
//
// El Derecho se vuelve a verificar acá (nunca se reutiliza lo que respondió el paso
// anterior como verdad permanente) — mismo principio de todo el sistema: preguntar de nuevo
// en cada operación sensible.

import { obtenerCuenta, crearCuenta, normalizarCorreo } from './_lib/cuenta.js';
import { hashPassword } from './_lib/auth-password.js';
import { obtenerComprasVigentes } from './_lib/orbit-perfil-acceso.js';
import { crearToken as crearTokenSesion, cookieDeSesion } from './_lib/auth-session.js';
import { crearToken as crearTokenVerificacion } from './_lib/auth-token.js';
import { enviarConfirmacionCorreo } from './_lib/email-brevo.js';
import { puedenIntentarTodas, registrarIntento, registrarExito } from './_lib/rate-limit.js';
import { ipDelRequest } from './_lib/request-ip.js';

const BASE_URL = process.env.MI_ESPACIO_BASE_URL || 'https://invisible-a-soberana.vercel.app';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const correo = normalizarCorreo(req.body?.correo);
  const password = req.body?.password || '';
  if (!correo || !correo.includes('@') || password.length < 8) {
    return res.status(400).json({ error: 'Datos inválidos. La contraseña debe tener al menos 8 caracteres.' });
  }

  const ip = ipDelRequest(req);
  if (!(await puedenIntentarTodas([['ip', ip], ['correo', correo]]))) {
    return res.status(429).json({ error: 'Demasiados intentos. Inténtalo nuevamente en unos minutos.' });
  }

  try {
    const cuentaExistente = await obtenerCuenta(correo);
    if (cuentaExistente) {
      // Condición de carrera real (ej. dos pestañas) o alguien reintentando tras ya haber
      // creado la cuenta — no es un error de negocio, solo indica que debe iniciar sesión.
      await registrarIntento('ip', ip);
      return res.status(409).json({ error: 'Esa cuenta ya existe. Inicia sesión con tu contraseña.' });
    }

    // Una sola llamada a Orbit cubre "¿hay Derecho?" y "qué compras devolver al crear la
    // sesión" — antes eran dos llamadas separadas (tieneDerechoVigente + obtenerComprasVigentes),
    // que con el cliente real duplicaban la latencia de red en cada alta de cuenta (hallazgo
    // de la auditoría final de 3.2, 2026-08-02; mismo patrón ya aplicado en mi-espacio-login.js).
    const compras = await obtenerComprasVigentes(correo);
    if (compras.length === 0) {
      await registrarIntento('ip', ip);
      await registrarIntento('correo', correo);
      return res.status(403).json({ error: 'No encontramos una compra asociada a ese correo.' });
    }

    const passwordHash = hashPassword(password);
    const creada = await crearCuenta(correo, passwordHash);
    if (!creada) {
      // Perdió la carrera contra otra solicitud simultánea entre el chequeo de arriba y acá.
      await registrarIntento('ip', ip);
      return res.status(409).json({ error: 'Esa cuenta ya existe. Inicia sesión con tu contraseña.' });
    }

    // Correo de confirmación — no bloqueante. Un fallo acá (Brevo caído, etc.) nunca debe
    // impedir que la alumna entre a lo que acaba de comprar.
    try {
      const tokenVerificacion = await crearTokenVerificacion(correo, 'verificacion_correo', 24 * 7);
      if (tokenVerificacion) {
        const enlace = `${BASE_URL}/mi-espacio/confirmar.html?token=${encodeURIComponent(tokenVerificacion)}`;
        await enviarConfirmacionCorreo(correo, enlace);
      }
    } catch (err) {
      console.error('mi-espacio-cuenta-crear: fallo enviando confirmación (no bloqueante):', err.message);
    }

    await registrarExito('ip', ip);
    await registrarExito('correo', correo);

    const sesion = crearTokenSesion(correo, 0);
    res.setHeader('Set-Cookie', cookieDeSesion(sesion));
    return res.status(200).json({ ok: true, correo, compras });
  } catch (err) {
    console.error('mi-espacio-cuenta-crear error:', err.message);
    return res.status(500).json({ error: 'No se pudo crear la cuenta.' });
  }
}
