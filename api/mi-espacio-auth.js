// api/mi-espacio-auth.js — capa de API consolidada de autenticación de Mi Espacio.
//
// Consolida 9 endpoints físicos en un solo archivo (límite de 12 funciones serverless
// del plan Hobby de Vercel — encontrado al validar el entorno real de 3.1/3.2,
// 2026-08-02). Las URLs externas NO cambian: vercel.json las reescribe hacia este
// archivo con ?accion=... . Cada acción sigue siendo una función independiente y
// testeable (crearCuenta, solicitarCuenta, login, logout, sesion, recuperarSolicitar,
// recuperarConfirmar, confirmarCorreo, reenviarConfirmacion) — solo comparten el mismo
// despliegue físico, no la lógica. No es una fusión de archivos, es una capa de rutas.
//
// Lógica de negocio idéntica a los archivos que reemplaza — ver el historial de cada
// endpoint viejo (mi-espacio-cuenta-crear.js, mi-espacio-login.js, etc., ya eliminados)
// para el detalle de cada decisión de diseño.

import { obtenerCuenta, crearCuenta, actualizarPassword, marcarCorreoVerificado, normalizarCorreo } from './_lib/cuenta.js';
import { hashPassword, verifyPassword } from './_lib/auth-password.js';
import { obtenerComprasVigentes, tieneDerechoVigente, tieneDerechoVigenteA, tieneRegistroActivo } from './_lib/orbit-perfil-acceso.js';
import { crearToken as crearTokenSesion, cookieDeSesion, cookieDeLogout, leerCookie, verificarToken } from './_lib/auth-session.js';
import { crearToken as crearTokenVerificacion, consumirToken } from './_lib/auth-token.js';
import { enviarConfirmacionCorreo, enviarRecuperacion } from './_lib/email-brevo.js';
import { puedenIntentarTodas, puedeIntentar, registrarIntento, registrarExito } from './_lib/rate-limit.js';
import { ipDelRequest } from './_lib/request-ip.js';

const BASE_URL = process.env.MI_ESPACIO_BASE_URL || 'https://invisible-a-soberana.vercel.app';
const ERROR_GENERICO_LOGIN = 'Correo o contraseña incorrectos.';
const MENSAJE_GENERICO_RECUPERAR = { ok: true, mensaje: 'Si ese correo tiene una cuenta con nosotras, te enviamos un enlace para volver a entrar. Revisa también la carpeta de spam, por si acaso.' };
const MENSAJE_GENERICO_REENVIAR = { ok: true, mensaje: 'Te enviamos un correo para confirmar tu cuenta.' };

// Hash señuelo con costo idéntico a un hash real (mismo scrypt) — se compara contra esto
// cuando la cuenta no existe, para que el tiempo de respuesta sea igual al de una cuenta
// real con contraseña incorrecta (corrige el timing side-channel de la auditoría de 3.1).
const HASH_SEÑUELO = hashPassword('valor-fijo-nunca-usado-como-contraseña-real');

async function crearCuentaAccion(req, res) {
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
      await registrarIntento('ip', ip);
      return res.status(409).json({ error: 'Esa cuenta ya existe. Inicia sesión con tu contraseña.' });
    }

    const compras = await obtenerComprasVigentes(correo);
    const hayDerecho = compras.length > 0;
    // Puerta 2 (Clase Gratuita), seccion 7 del diseño: entra con Derecho O
    // con Registro activo a una Convocatoria — no se exige haber comprado.
    const hayRegistroActivo = hayDerecho ? false : await tieneRegistroActivo(correo);
    if (!hayDerecho && !hayRegistroActivo) {
      await registrarIntento('ip', ip);
      await registrarIntento('correo', correo);
      return res.status(403).json({ error: 'No encontramos una compra ni un registro a clase gratuita asociados a ese correo.' });
    }

    const passwordHash = hashPassword(password);
    const creada = await crearCuenta(correo, passwordHash);
    if (!creada) {
      await registrarIntento('ip', ip);
      return res.status(409).json({ error: 'Esa cuenta ya existe. Inicia sesión con tu contraseña.' });
    }

    try {
      const tokenVerificacion = await crearTokenVerificacion(correo, 'verificacion_correo', 24 * 7);
      if (tokenVerificacion) {
        const enlace = `${BASE_URL}/mi-espacio/confirmar.html?token=${encodeURIComponent(tokenVerificacion)}`;
        await enviarConfirmacionCorreo(correo, enlace);
      }
    } catch (err) {
      console.error('mi-espacio-auth/cuenta-crear: fallo enviando confirmación (no bloqueante):', err.message);
    }

    await registrarExito('ip', ip);
    await registrarExito('correo', correo);

    const sesion = crearTokenSesion(correo, 0);
    res.setHeader('Set-Cookie', cookieDeSesion(sesion));
    return res.status(200).json({ ok: true, correo, compras });
  } catch (err) {
    console.error('mi-espacio-auth/cuenta-crear error:', err.message);
    return res.status(500).json({ error: 'No se pudo crear la cuenta.' });
  }
}

async function solicitarCuentaAccion(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const correo = normalizarCorreo(req.body?.correo);
  if (!correo || !correo.includes('@')) return res.status(400).json({ error: 'Correo inválido.' });

  const ip = ipDelRequest(req);
  if (!(await puedenIntentarTodas([['ip', ip], ['correo', correo]]))) {
    return res.status(429).json({ error: 'Demasiados intentos. Inténtalo nuevamente en unos minutos.' });
  }

  try {
    const cuentaExistente = await obtenerCuenta(correo);
    const hayDerecho = await tieneDerechoVigente(correo);

    if (cuentaExistente) {
      await registrarExito('ip', ip);
      return res.status(200).json({ ok: true, accion: 'iniciar_sesion' });
    }

    // Puerta 2 (Clase Gratuita), seccion 7 del diseño: Derecho O Registro
    // activo — solo se consulta el Registro si ya se sabe que no hay Derecho
    // (evita una segunda llamada innecesaria cuando la primera ya alcanza).
    const hayRegistroActivo = hayDerecho ? false : await tieneRegistroActivo(correo);
    if (!hayDerecho && !hayRegistroActivo) {
      await registrarIntento('ip', ip);
      await registrarIntento('correo', correo);
      return res.status(200).json({ ok: false, error: 'No encontramos una compra ni un registro a clase gratuita asociados a ese correo.' });
    }

    await registrarExito('ip', ip);
    return res.status(200).json({ ok: true, accion: 'crear_cuenta' });
  } catch (err) {
    console.error('mi-espacio-auth/cuenta-solicitar error:', err.message);
    return res.status(500).json({ error: 'No se pudo procesar la solicitud.' });
  }
}

async function loginAccion(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const correo = normalizarCorreo(req.body?.correo);
  const password = req.body?.password || '';
  if (!correo || !password) return res.status(400).json({ error: ERROR_GENERICO_LOGIN });

  const ip = ipDelRequest(req);
  if (!(await puedenIntentarTodas([['ip', ip], ['correo', correo]]))) {
    return res.status(429).json({ error: 'Demasiados intentos. Inténtalo nuevamente en unos minutos.' });
  }

  try {
    const cuenta = await obtenerCuenta(correo);
    const cuentaLista = cuenta && cuenta.estado === 'activa';
    const passwordCorrecta = verifyPassword(password, cuentaLista ? cuenta.passwordHash : HASH_SEÑUELO);
    const passwordOk = cuentaLista && passwordCorrecta;

    if (!passwordOk) {
      await registrarIntento('ip', ip);
      await registrarIntento('correo', correo);
      return res.status(401).json({ error: ERROR_GENERICO_LOGIN });
    }

    const compras = await obtenerComprasVigentes(correo);
    const hayDerecho = compras.length > 0;
    // Puerta 2 (Clase Gratuita), seccion 7 del diseño: entra con Derecho O
    // con Registro activo a una Convocatoria.
    const hayRegistroActivo = hayDerecho ? false : await tieneRegistroActivo(correo);
    if (!hayDerecho && !hayRegistroActivo) {
      await registrarIntento('ip', ip);
      await registrarIntento('correo', correo);
      return res.status(401).json({ error: ERROR_GENERICO_LOGIN });
    }

    await registrarExito('ip', ip);
    await registrarExito('correo', correo);

    const sesion = crearTokenSesion(correo, cuenta.sessionVersion || 0);
    res.setHeader('Set-Cookie', cookieDeSesion(sesion));
    return res.status(200).json({ ok: true, correo, compras, emailVerified: !!cuenta.emailVerified });
  } catch (err) {
    console.error('mi-espacio-auth/login error:', err.message);
    return res.status(500).json({ error: 'No se pudo iniciar sesión.' });
  }
}

async function logoutAccion(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  res.setHeader('Set-Cookie', cookieDeLogout());
  return res.status(200).json({ ok: true });
}

async function sesionAccion(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const token = leerCookie(req);
  const datos = verificarToken(token);
  if (!datos) return res.status(200).json({ autenticado: false });

  try {
    const cuenta = await obtenerCuenta(datos.correo);
    const vigente = cuenta && cuenta.estado === 'activa' && (cuenta.sessionVersion || 0) === datos.sessionVersion;
    if (!vigente) return res.status(200).json({ autenticado: false });

    try {
      const compras = await obtenerComprasVigentes(datos.correo);
      return res.status(200).json({ autenticado: true, correo: datos.correo, compras, emailVerified: !!cuenta.emailVerified });
    } catch (err) {
      console.error('mi-espacio-auth/sesion: Orbit no respondió, sesión sigue siendo válida:', err.message);
      return res.status(200).json({ autenticado: true, correo: datos.correo, compras: null, emailVerified: !!cuenta.emailVerified, verificacionPendiente: true });
    }
  } catch (err) {
    console.error('mi-espacio-auth/sesion error:', err.message);
    return res.status(200).json({ autenticado: false });
  }
}

async function recuperarSolicitarAccion(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const correo = normalizarCorreo(req.body?.correo);
  if (!correo || !correo.includes('@')) return res.status(200).json(MENSAJE_GENERICO_RECUPERAR);

  const ip = ipDelRequest(req);
  if (!(await puedenIntentarTodas([['ip', ip], ['correo-recuperar', correo]]))) {
    return res.status(429).json({ error: 'Demasiados intentos. Inténtalo nuevamente en unos minutos.' });
  }

  try {
    const cuenta = await obtenerCuenta(correo);
    if (cuenta && cuenta.estado === 'activa') {
      const token = await crearTokenVerificacion(correo, 'recuperacion', 1);
      if (token) {
        const enlace = `${BASE_URL}/mi-espacio/recuperar.html?token=${encodeURIComponent(token)}`;
        await enviarRecuperacion(correo, enlace);
      }
    }
    await registrarIntento('ip', ip);
    await registrarIntento('correo-recuperar', correo);
    return res.status(200).json(MENSAJE_GENERICO_RECUPERAR);
  } catch (err) {
    console.error('mi-espacio-auth/recuperar-solicitar error:', err.message);
    return res.status(200).json(MENSAJE_GENERICO_RECUPERAR);
  }
}

async function recuperarConfirmarAccion(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { token, password } = req.body || {};
  if (!token || !password || String(password).length < 8) {
    return res.status(400).json({ error: 'Datos inválidos. La contraseña debe tener al menos 8 caracteres.' });
  }

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
    console.error('mi-espacio-auth/recuperar-confirmar error:', err.message);
    return res.status(500).json({ error: 'No se pudo actualizar la contraseña.' });
  }
}

async function confirmarCorreoAccion(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Falta el token.' });

  try {
    const resultado = await consumirToken(token, 'verificacion_correo');
    if (!resultado) return res.status(400).json({ error: 'El enlace no es válido o ya expiró.' });

    await marcarCorreoVerificado(resultado.correo);
    return res.status(200).json({ ok: true, correo: resultado.correo });
  } catch (err) {
    console.error('mi-espacio-auth/confirmar-correo error:', err.message);
    return res.status(500).json({ error: 'No se pudo confirmar el correo.' });
  }
}

async function reenviarConfirmacionAccion(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const token = leerCookie(req);
  const datos = verificarToken(token);
  if (!datos) return res.status(401).json({ error: 'Sesión inválida o expirada.' });

  try {
    const cuenta = await obtenerCuenta(datos.correo);
    const vigente = cuenta && cuenta.estado === 'activa' && (cuenta.sessionVersion || 0) === datos.sessionVersion;
    if (!vigente) return res.status(401).json({ error: 'Sesión inválida o expirada.' });

    if (!cuenta.emailVerified) {
      const tokenVerificacion = await crearTokenVerificacion(datos.correo, 'verificacion_correo', 24 * 7);
      if (tokenVerificacion) {
        const enlace = `${BASE_URL}/mi-espacio/confirmar.html?token=${encodeURIComponent(tokenVerificacion)}`;
        await enviarConfirmacionCorreo(datos.correo, enlace);
      }
    }
    return res.status(200).json(MENSAJE_GENERICO_REENVIAR);
  } catch (err) {
    console.error('mi-espacio-auth/reenviar-confirmacion error:', err.message);
    return res.status(200).json(MENSAJE_GENERICO_REENVIAR);
  }
}

// Puerta 2 — Slice 8: /workbook deja de leer Firestore workbook_acceso para
// decidir el login — pregunta aquí, en vivo, contra el Derecho real de
// Orbit. Ver PUERTA-2-CODIGO-SOBERANA-MAPA-DE-SLICES.md, "Corrección de
// arquitectura — Orbit como única fuente del Derecho a Workbook".
//
// Contrato deliberadamente mínimo: solo `{activo}` cuando la consulta se
// resolvió (200), y un 503 `{error:'no_disponible'}` cuando Orbit no
// respondió — nunca se confunde un fallo de infraestructura con un
// `activo:false` real (decisión explícita de la usuaria).
//
// Rate limiting — el riesgo de este endpoint es enumeración (barrer
// correos para descubrir quién tiene acceso), no fuerza bruta de
// contraseña, así que la semántica de "intento" es distinta a login:
//   - activo:false (respuesta concluyente, posible barrido) -> registrarIntento
//   - correo invalido (ni se consulta a Orbit) -> registrarIntento
//   - activo:true -> registrarExito (necesario de verdad, no un reset
//     cosmético: puedeIntentar() bloquea solo mirando bloqueadoHasta, sin
//     importar si la consulta actual sería exitosa — sin este reset, una
//     alumna que fue rechazada varias veces antes de comprar quedaría
//     bloqueada 15 minutos incluso ya con Derecho vigente real)
//   - 503 (falla nuestra o de Orbit) -> no se registra nada, nunca se le
//     cobra a la alumna un problema de infraestructura
const PROGRAMA_CODIGO_SOBERANA = 'codigo-soberana';

async function workbookAccesoAccion(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const ip = ipDelRequest(req);
  const correo = normalizarCorreo(req.body?.correo);

  if (!correo || !correo.includes('@')) {
    await registrarIntento('ip', ip);
    await registrarIntento('correo', correo);
    return res.status(200).json({ activo: false });
  }

  if (!(await puedenIntentarTodas([['ip', ip], ['correo', correo]]))) {
    return res.status(200).json({ activo: false });
  }

  try {
    const activo = await tieneDerechoVigenteA(correo, PROGRAMA_CODIGO_SOBERANA);
    if (activo) {
      await registrarExito('ip', ip);
      await registrarExito('correo', correo);
    } else {
      await registrarIntento('ip', ip);
      await registrarIntento('correo', correo);
    }
    return res.status(200).json({ activo });
  } catch (err) {
    console.error('mi-espacio-auth/workbook-acceso: Orbit no respondió:', err.message);
    return res.status(503).json({ error: 'no_disponible' });
  }
}

const ACCIONES = {
  'cuenta-crear': crearCuentaAccion,
  'cuenta-solicitar': solicitarCuentaAccion,
  login: loginAccion,
  logout: logoutAccion,
  sesion: sesionAccion,
  'recuperar-solicitar': recuperarSolicitarAccion,
  'recuperar-confirmar': recuperarConfirmarAccion,
  'confirmar-correo': confirmarCorreoAccion,
  'reenviar-confirmacion': reenviarConfirmacionAccion,
  'workbook-acceso': workbookAccesoAccion,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const fn = ACCIONES[req.query?.accion];
  if (!fn) return res.status(404).json({ error: 'Acción no reconocida.' });
  return fn(req, res);
}
