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
import { obtenerComprasVigentes, tieneDerechoVigente, tieneDerechoVigenteA, tieneRegistroActivo, obtenerProximaConvocatoriaDisponible, obtenerProximaConvocatoriaPublica, obtenerSesionesDisponibles, obtenerExperienciaGratuitaActiva, obtenerExperienciaGratuitaActivaConReintento, obtenerTieneRegistroHistorico, obtenerOportunidadBootcampActiva, obtenerReplayCompradoActivo, obtenerBootcampHitos, obtenerRecorridoHabilitado, obtenerAccesoBootcamp, confirmarBootcampHitoVisto, obtenerMasterclassZoomJoin, obtenerBootcampZoomJoin, crearRegistroAutenticado, registrarClaseGratuita } from './_lib/orbit-perfil-acceso.js';
import { crearToken as crearTokenSesion, cookieDeSesion, cookieDeLogout, leerCookie, verificarToken } from './_lib/auth-session.js';
import { verificarToken as verificarTokenClaseGratuita, leerCookie as leerCookieClaseGratuita, construirCookieSiCorresponde } from './_lib/auth-clase-gratuita.js';
import { construirCookieSiCorresponde as construirCookieContinuidadBootcamp, verificarToken as verificarTokenContinuidadBootcamp, leerCookie as leerCookieContinuidadBootcamp } from './_lib/auth-continuidad-bootcamp.js';
import { crearToken as crearTokenVerificacion, consumirToken } from './_lib/auth-token.js';
import { enviarConfirmacionCorreo, enviarRecuperacion } from './_lib/email-brevo.js';
import { puedenIntentarTodas, puedeIntentar, registrarIntento, registrarExito } from './_lib/rate-limit.js';
import { ipDelRequest } from './_lib/request-ip.js';
import { enviarPushACorreo } from './_lib/push-fcm.js';

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
    // Puerta 2 — mismo dato que ya viaja en loginAccion (P7): sin esto, una mujer que
    // entra por primera vez con solo Registro gratuito crea su cuenta y cae en el
    // estado vacío del dashboard, porque el frontend lee estos campos de la respuesta
    // de la acción que se acaba de ejecutar (crear cuenta o login), no de una carga
    // aparte (bug real encontrado 2026-09-08 en prueba end-to-end).
    const [proximaConvocatoriaDisponible, experienciaGratuitaActiva, tieneRegistroHistorico, oportunidadBootcampActiva, replayCompradoActivo, bootcampHitos] = await Promise.all([
      obtenerProximaConvocatoriaDisponible(correo),
      obtenerExperienciaGratuitaActiva(correo),
      obtenerTieneRegistroHistorico(correo),
      obtenerOportunidadBootcampActiva(correo),
      obtenerReplayCompradoActivo(correo),
      obtenerBootcampHitos(correo),
    ]);
    return res.status(200).json({ ok: true, correo, compras, proximaConvocatoriaDisponible, experienciaGratuitaActiva, tieneRegistroHistorico, oportunidadBootcampActiva, replayCompradoActivo, bootcampHitos });
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

// Puerta 2 — Slice 2 ("Simplificación del registro gratuito"): proxy
// same-origin de /api/registro. Mismas validaciones que ya aplica la
// landing del lado cliente (Slice 1: WhatsApp y correo obligatorios) —
// aquí se repiten porque el cliente nunca es la fuente de verdad. No hay
// sesión, no hay cookie, no hay cambio de contrato con Orbit: se reenvía
// el mismo body y se devuelve el mismo status/cuerpo que Orbit responde,
// para que la landing siga funcionando exactamente igual sin tocar su
// lógica de éxito/error.
function normalizarEmailRegistro(v) {
  const email = String(v || '').trim().toLowerCase();
  return email.includes('@') ? email : null;
}

function normalizarTelefonoRegistro(v) {
  const digitos = String(v || '').replace(/[^0-9]/g, '');
  return (digitos.length >= 10 && digitos.length <= 15) ? digitos : null;
}

// SIMULIVE — diseño cerrado 2026-09-22: `fechaHoraElegida` es la única pieza
// nueva de este payload — un string ISO reenviado TAL CUAL como llegó del
// cliente, que a su vez lo recibió tal cual de sesiones-disponibles. Nunca se
// reparsea/reformatea aquí (Orbit es la única autoridad que revalida si sigue
// siendo un horario real, registroAccion en api/v1/perfil-acceso.js). Un valor
// ausente o mal formado simplemente no es "una fecha ISO válida" para Orbit,
// que la rechaza con motivo:'horario_no_valido' — no hace falta duplicar esa
// validación aquí.
function normalizarFechaHoraElegida(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

async function registroGratuitoAccion(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const email = normalizarEmailRegistro(req.body?.email);
  const telefono = normalizarTelefonoRegistro(req.body?.telefono);
  const nombre = typeof req.body?.nombre === 'string' ? req.body.nombre.trim() : '';
  const origen = typeof req.body?.origen === 'string' ? req.body.origen.trim() : '';
  const fechaHoraElegida = normalizarFechaHoraElegida(req.body?.fechaHoraElegida);

  if (!email || !telefono) {
    return res.status(400).json({ error: 'Necesitamos tu WhatsApp y tu correo para reservarte el lugar.' });
  }

  const ip = ipDelRequest(req);
  if (!(await puedeIntentar('ip-registro-gratuito', ip))) {
    return res.status(429).json({ error: 'Demasiados intentos. Inténtalo nuevamente en unos minutos.' });
  }

  try {
    const { status, cuerpo } = await registrarClaseGratuita({ email, telefono, nombre, origen, fechaHoraElegida });
    if (status === 200 && cuerpo && cuerpo.ok) {
      await registrarExito('ip-registro-gratuito', ip);
      // Puerta 2 — Slice 3: la cookie SOLO se intenta emitir después de que
      // Orbit confirmó el registro (nunca antes, nunca si Orbit rechazó).
      // El body publico de /api/registro no trae convocatoriaId — se pide
      // aparte a experienciaGratuitaActiva (misma fuente que ya usa el
      // resto de Mi Espacio) para anclar la cookie a la convocatoria real,
      // con su fecha y ventana de replay verdaderas. Usa la variante con
      // reintento (hallazgo real 2026-09-09): la lectura puede llegar antes
      // de que Orbit refleje el registro que acaba de escribir. Si las 3
      // lecturas fallan igual, la cookie simplemente no se emite — el
      // registro ya fue exitoso para la landing de cualquier forma, esto
      // es una mejora aditiva, nunca una condicion de exito.
      try {
        const experiencia = await obtenerExperienciaGratuitaActivaConReintento(email);
        const resultado = construirCookieSiCorresponde(email, experiencia);
        if (resultado) res.setHeader('Set-Cookie', resultado.cookie);
      } catch (err) {
        console.error('mi-espacio-auth/registro-gratuito: no se pudo emitir la sesion de clase gratuita (no bloqueante):', err.message);
      }
    } else {
      await registrarIntento('ip-registro-gratuito', ip);
    }
    return res.status(status).json(cuerpo);
  } catch (err) {
    console.error('mi-espacio-auth/registro-gratuito error:', err.message);
    await registrarIntento('ip-registro-gratuito', ip);
    return res.status(502).json({ error: 'No pudimos completar tu registro en este momento. Inténtalo de nuevo en unos minutos.' });
  }
}

// Puerta 2 — Slice 6: proxy same-origin del endpoint publico de Orbit que
// dice cual es el proximo sabado con clase (y desde cuando empieza a
// contar el replay). Sin sesion, sin secreto, sin rate limiting propio —
// es lectura pura, sin efectos sobre ninguna identidad, la misma landing
// que hoy llama a esto la llama en cada carga de pagina. Deliberadamente
// NO expone el enlace del grupo de WhatsApp (regla "quien necesita conocer
// este dato" — nadie en la landing lo necesita antes del registro).
async function proximaConvocatoriaPublicaAccion(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const proximaConvocatoria = await obtenerProximaConvocatoriaPublica();
    return res.status(200).json(proximaConvocatoria);
  } catch (err) {
    console.error('mi-espacio-auth/proxima-convocatoria error:', err.message);
    return res.status(503).json({ error: 'No pudimos cargar la fecha de la clase. Intenta de nuevo en un momento.' });
  }
}

// SIMULIVE — selector de sesión (diseño cerrado 2026-09-22): proxy same-origin
// del endpoint PUBLICO de Orbit /api/sesiones-disponibles — mismo criterio
// exacto que proximaConvocatoriaPublicaAccion arriba (lectura pura, sin
// sesión, sin secreto, sin rate limiting propio, tráfico anónimo de landing).
async function sesionesDisponiblesAccion(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const sesionesDisponibles = await obtenerSesionesDisponibles();
    return res.status(200).json(sesionesDisponibles);
  } catch (err) {
    console.error('mi-espacio-auth/sesiones-disponibles error:', err.message);
    return res.status(503).json({ error: 'No pudimos cargar los horarios disponibles. Intenta de nuevo en un momento.' });
  }
}

// Puerta 2 — Slice 3: valida la cookie de clase gratuita y devuelve el
// estado REAL de la experiencia, siempre preguntado en vivo a Orbit — la
// cookie nunca es la fuente de la fase (espera/en_vivo/replay), solo prueba
// identidad + convocatoria. Respuesta deliberadamente angosta: jamas
// `compras`, jamas `emailVerified`, nada que pertenezca al mundo de una
// Cuenta permanente (frontera aprobada 2026-09-09).
// Puerta 5 — Ensayo General, Estación 4 (puente QA temporal, 2026-09-13):
// reenvía los 2 headers de reloj QA hacia Orbit SOLO si ambos llegan en la
// petición entrante — todo-o-nada, sin valores por defecto. El teléfono
// nunca manda esto directamente: la página los lee de un query param una
// sola vez y los guarda en sessionStorage (ver public/clase-gratuita).
// La autoridad real es Orbit (resolverAhoraQA, Corte 9); esta función solo
// transporta lo que ya llegó, nunca inventa ni valida el secreto.
function qaRelojDeRequest(req) {
  const secreto = req.headers['x-qa-reloj-secret'];
  const simulado = req.headers['x-qa-reloj-simulado'];
  if (!secreto || !simulado) return undefined;
  return { secreto, simulado };
}

async function sesionClaseGratuitaAccion(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const token = leerCookieClaseGratuita(req);
  const datos = verificarTokenClaseGratuita(token);
  if (!datos) return res.status(200).json({ autorizado: false });

  const qaReloj = qaRelojDeRequest(req);
  try {
    // Puerta 5 — Ensayo General, Estación 3 (decision de negocio cerrada
    // 2026-09-14, PRIORIDAD MAXIMA): la Masterclass gratuita es la puerta de
    // entrada a Código Soberana, no un fin en si misma — /clase-gratuita
    // necesita las 4 señales para representar el circuito comercial
    // completo (en_vivo/replay con CTA -> cierre del carrito -> Replay $5 o
    // "ya lo compro" o "ya tiene Código Soberana", segun corresponda):
    //   - oportunidadBootcampActiva: CTA durante en_vivo/replay.
    //   - replayCompradoActivo: si ya compro el Replay $5 (Puerta 3),
    //     mismo helper que ya usa perfilAccesoAccion — nunca se le vuelve a
    //     ofrecer el checkout.
    //   - tieneCodigoSoberana: precedencia MAXIMA (ver mas abajo) — si ya
    //     tiene el Derecho, jamas se le ofrece comprar Bootcamp ni Replay.
    //     Reutiliza tieneDerechoVigenteA, YA existente (usada hoy por
    //     workbook-acceso) — cero contrato nuevo del lado de Orbit para
    //     esto. replayCompradoActivo/tieneCodigoSoberana no dependen del
    //     reloj QA (son derechos permanentes, no ventanas de tiempo).
    const [experiencia, oportunidadBootcampActiva, replayCompradoActivo, tieneCodigoSoberana] = await Promise.all([
      obtenerExperienciaGratuitaActiva(datos.correo, qaReloj),
      obtenerOportunidadBootcampActiva(datos.correo, qaReloj),
      obtenerReplayCompradoActivo(datos.correo),
      tieneDerechoVigenteA(datos.correo, PROGRAMA_CODIGO_SOBERANA),
    ]);
    // Una cookie valida sin experiencia activa (terminada, o de una
    // convocatoria distinta a la que Orbit reconoce hoy para este correo)
    // sigue siendo una cookie legitima — solo que no autoriza a ver
    // contenido de clase. autorizado:true + experienciaGratuitaActiva:null
    // es exactamente esa distincion (identidad valida vs. nada que mostrar).
    // oportunidadBootcampActiva/replayCompradoActivo NUNCA se atan a
    // datos.convocatoriaId (a diferencia de experienciaGratuitaActiva
    // arriba) — no son una propiedad de UNA convocatoria puntual, son "la
    // oportunidad/el derecho de esta Persona ahora mismo", independientes
    // de cual Convocatoria trae la cookie.
    const experienciaGratuitaActiva = (experiencia && experiencia.convocatoriaId === datos.convocatoriaId) ? experiencia : null;
    return res.status(200).json({ autorizado: true, experienciaGratuitaActiva, oportunidadBootcampActiva, replayCompradoActivo, tieneCodigoSoberana });
  } catch (err) {
    console.error('mi-espacio-auth/sesion-clase-gratuita: Orbit no respondió:', err.message);
    return res.status(200).json({ autorizado: true, experienciaGratuitaActiva: null, oportunidadBootcampActiva: null, replayCompradoActivo: null, tieneCodigoSoberana: false, verificacionPendiente: true });
  }
}

// Puerta 5 — Ensayo General, Estación 4 (Masterclass gratuita en_vivo vía
// Meeting SDK embebido, diseño cerrado 2026-09-14): misma cookie
// clase_gratuita_sesion que sesionClaseGratuitaAccion, mismo criterio de
// seguridad — el resultado de Orbit solo se entrega si su
// convocatoriaId coincide con el de la cookie ya verificada (nunca se
// confía en que Orbit resolvió "la Convocatoria correcta" sin
// comprobarlo aquí también, mismo candado que ya protege el contenido de
// /clase-gratuita).
async function masterclassZoomJoinAccion(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const token = leerCookieClaseGratuita(req);
  const datos = verificarTokenClaseGratuita(token);
  if (!datos) return res.status(200).json({ ok: false, motivo: 'sin_sesion' });

  try {
    const resultado = await obtenerMasterclassZoomJoin(datos.correo, qaRelojDeRequest(req));
    if (!resultado || resultado.ok !== true) return res.status(200).json(resultado || { ok: false, motivo: 'sin_respuesta' });
    if (resultado.convocatoriaId !== datos.convocatoriaId) {
      // Misma decision que sesionClaseGratuitaAccion: una cookie valida
      // pero de otra Convocatoria nunca autoriza contenido de esta.
      return res.status(200).json({ ok: false, motivo: 'convocatoria_no_coincide' });
    }
    const { convocatoriaId, ...resto } = resultado;
    return res.status(200).json(resto);
  } catch (err) {
    console.error('mi-espacio-auth/masterclass-zoom-join: Orbit no respondió:', err.message);
    return res.status(503).json({ ok: false, motivo: 'no_disponible' });
  }
}

// Puerta 2 — cambio de prioridad (2026-09-11): el enlace del grupo de
// WhatsApp ahora es /clase-gratuita, la MISMA URL para todas — pero esa
// pagina depende de la cookie clase_gratuita_sesion, emitida SOLO en el
// dispositivo donde se hizo el registro (ver registroGratuitoAccion). Sin
// esta accion, cualquiera que abra el enlace del grupo desde OTRO
// dispositivo caeria siempre en "no encontramos tu clase".
//
// Esta accion "recupera" esa sesion en el dispositivo nuevo: recibe SOLO un
// correo (nunca password, nunca cuenta nueva), pregunta a Orbit si ese
// correo tiene una experienciaGratuitaActiva real (misma fuente de verdad
// que sesionClaseGratuitaAccion) y, si la tiene, emite la MISMA cookie que
// ya emite el registro (construirCookieSiCorresponde, mismo payload firmado
// {correo, convocatoriaId, tipo, exp}) — nunca una cookie distinta, nunca
// un convocatoriaId inventado o tomado del cliente.
//
// Enumeracion (mismo riesgo/patron ya documentado en workbookAccesoAccion):
// una respuesta concluyente (correo sin experiencia activa) es tan
// informativa para un atacante como un login fallido, asi que cuenta como
// intento igual que una password incorrecta. Un fallo de Orbit (timeout/5xx)
// NUNCA cuenta intento ni se confunde con "no tiene acceso" — mismo
// principio que sesionClaseGratuitaAccion.
const MENSAJE_SIN_CLASE_ACTIVA = 'No encontramos una clase activa con ese correo. Verifica que estés usando el correo con el que te registraste.';

async function reclamarSesionClaseGratuitaAccion(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const correo = normalizarCorreo(req.body?.correo);
  if (!correo || !correo.includes('@')) {
    return res.status(400).json({ ok: false, error: 'Escribe un correo válido.' });
  }

  const ip = ipDelRequest(req);
  if (!(await puedenIntentarTodas([['ip-clase-gratuita', ip], ['correo-clase-gratuita', correo]]))) {
    return res.status(429).json({ error: 'Demasiados intentos. Inténtalo nuevamente en unos minutos.' });
  }

  let experiencia;
  try {
    experiencia = await obtenerExperienciaGratuitaActiva(correo);
  } catch (err) {
    // Fallo de infraestructura (Orbit no respondio) — nunca se cuenta como
    // intento ni se confunde con "ese correo no tiene clase" (mismo
    // principio que sesionClaseGratuitaAccion/workbookAccesoAccion).
    console.error('mi-espacio-auth/reclamar-sesion-clase-gratuita: Orbit no respondió:', err.message);
    return res.status(503).json({ ok: false, error: 'No pudimos verificar tu clase en este momento. Inténtalo de nuevo en un momento.' });
  }

  // construirCookieSiCorresponde ya es la MISMA funcion pura que usa
  // registroGratuitoAccion — mismo criterio exacto de "¿corresponde emitir
  // la cookie?" (requiere convocatoriaId + fechaHora reales), nunca una
  // segunda version de esa decision.
  const resultado = construirCookieSiCorresponde(correo, experiencia);
  if (!resultado) {
    await registrarIntento('ip-clase-gratuita', ip);
    await registrarIntento('correo-clase-gratuita', correo);
    return res.status(200).json({ ok: false, error: MENSAJE_SIN_CLASE_ACTIVA });
  }

  await registrarExito('ip-clase-gratuita', ip);
  await registrarExito('correo-clase-gratuita', correo);
  res.setHeader('Set-Cookie', resultado.cookie);
  return res.status(200).json({ ok: true });
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

    // Puerta 2 — Addendum "Mi Espacio persistente" (2026-09-03, congelado en
    // PUERTA-2-MI-ESPACIO-EXPERIENCIA-CLASE-GRATUITA.md, seccion 1): la
    // elegibilidad (Derecho O Registro activo) es un criterio de ENTRADA —
    // se exige solo para crear una cuenta (crearCuentaAccion,
    // solicitarCuentaAccion), nunca para iniciar sesion en una cuenta que ya
    // existe. Contraseña correcta + cuenta activa ya es suficiente para
    // entrar. `compras` se sigue consultando porque la respuesta la sigue
    // necesitando para mostrar informacion, no como condicion de acceso.
    // proximaConvocatoriaDisponible viaja en la misma tanda de llamadas
    // (Slice 4, P7) para que el shell sepa de inmediato si mostrar la
    // tarjeta de invitacion, sin esperar a la siguiente carga de pagina.
    const [compras, proximaConvocatoriaDisponible, experienciaGratuitaActiva, tieneRegistroHistorico, oportunidadBootcampActiva, replayCompradoActivo, bootcampHitos, recorridoHabilitado] = await Promise.all([
      obtenerComprasVigentes(correo),
      obtenerProximaConvocatoriaDisponible(correo),
      obtenerExperienciaGratuitaActiva(correo),
      obtenerTieneRegistroHistorico(correo),
      obtenerOportunidadBootcampActiva(correo),
      obtenerReplayCompradoActivo(correo),
      obtenerBootcampHitos(correo),
      obtenerRecorridoHabilitado(correo), // Puerta 5, Corte 6 — gate real de S0-S9 (Puerta A)
    ]);

    await registrarExito('ip', ip);
    await registrarExito('correo', correo);

    const sesion = crearTokenSesion(correo, cuenta.sessionVersion || 0);
    res.setHeader('Set-Cookie', cookieDeSesion(sesion));
    return res.status(200).json({ ok: true, correo, compras, proximaConvocatoriaDisponible, experienciaGratuitaActiva, tieneRegistroHistorico, oportunidadBootcampActiva, replayCompradoActivo, bootcampHitos, recorridoHabilitado, emailVerified: !!cuenta.emailVerified });
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
  if (!datos) return resolverContinuidadBootcampPuertaB(req, res);

  try {
    const cuenta = await obtenerCuenta(datos.correo);
    const vigente = cuenta && cuenta.estado === 'activa' && (cuenta.sessionVersion || 0) === datos.sessionVersion;
    if (!vigente) return res.status(200).json({ autenticado: false });

    try {
      // Puerta 2 — Slice 4/5: proximaConvocatoriaDisponible y
      // experienciaGratuitaActiva viajan en la misma respuesta que ya
      // consulta compras (sin llamada de red extra), para que el shell de
      // Mi Espacio sepa que tarjetas mostrar sin esperar otra carga.
      const [compras, proximaConvocatoriaDisponible, experienciaGratuitaActiva, tieneRegistroHistorico, oportunidadBootcampActiva, replayCompradoActivo, bootcampHitos, recorridoHabilitado] = await Promise.all([
        obtenerComprasVigentes(datos.correo),
        obtenerProximaConvocatoriaDisponible(datos.correo),
        obtenerExperienciaGratuitaActiva(datos.correo),
        obtenerTieneRegistroHistorico(datos.correo),
        obtenerOportunidadBootcampActiva(datos.correo),
        obtenerReplayCompradoActivo(datos.correo),
        obtenerBootcampHitos(datos.correo),
        obtenerRecorridoHabilitado(datos.correo), // Puerta 5, Corte 6 — gate real de S0-S9 (Puerta A)
      ]);
      return res.status(200).json({ autenticado: true, correo: datos.correo, compras, proximaConvocatoriaDisponible, experienciaGratuitaActiva, tieneRegistroHistorico, oportunidadBootcampActiva, replayCompradoActivo, bootcampHitos, recorridoHabilitado, emailVerified: !!cuenta.emailVerified });
    } catch (err) {
      console.error('mi-espacio-auth/sesion: Orbit no respondió, sesión sigue siendo válida:', err.message);
      // recorridoHabilitado:false aqui — nunca se fabrica un "si" cuando
      // Orbit no pudo confirmarlo (mismo principio ya aplicado al resto de
      // este fallback: honesto, nunca optimista, sobre todo tratandose del
      // gate comercial mas sensible de todo el contrato).
      return res.status(200).json({ autenticado: true, correo: datos.correo, compras: null, proximaConvocatoriaDisponible: null, experienciaGratuitaActiva: null, tieneRegistroHistorico: false, oportunidadBootcampActiva: null, replayCompradoActivo: null, bootcampHitos: null, recorridoHabilitado: false, emailVerified: !!cuenta.emailVerified, verificacionPendiente: true });
    }
  } catch (err) {
    console.error('mi-espacio-auth/sesion error:', err.message);
    return res.status(200).json({ autenticado: false });
  }
}

// Puerta 5 (onboarding de instalación, diseño cerrado 2026-09-16):
// continuidad de Puerta B — sin cookie de Cuenta (mi_espacio_sesion), se
// intenta la cookie corta de bootcamp_continuidad ANTES de rendirse a
// `autenticado:false`. Esta cookie NUNCA transporta `activo` ni ningún
// derecho — solo el correo. Aquí se vuelve a preguntar a Orbit en vivo,
// exactamente la misma verificación que /api/workbook-acceso
// (resolverAccesoBootcamp), nunca se confía en lo que diga la cookie.
// Sin rate-limit propio: esta ruta se dispara automáticamente al abrir
// /workbook, no es un intento manual de adivinar un correo — el rate-limit
// de workbookAccesoAccion sigue protegiendo esa otra ruta.
//
// Respuesta deliberadamente más angosta que la de Puerta A: `compras`,
// `proximaConvocatoriaDisponible`, `experienciaGratuitaActiva`,
// `tieneRegistroHistorico`, `oportunidadBootcampActiva` y `emailVerified`
// son conceptos exclusivos de Cuenta (Mi Espacio) — una compradora directa
// de Hotmart nunca tuvo ni tiene una Cuenta, así que nunca se fabrican
// aquí. Mismos campos exactos que ya devuelve workbookAccesoAccion hoy.
async function resolverContinuidadBootcampPuertaB(req, res) {
  const tokenContinuidad = leerCookieContinuidadBootcamp(req);
  const datosContinuidad = verificarTokenContinuidadBootcamp(tokenContinuidad);
  if (!datosContinuidad) return res.status(200).json({ autenticado: false });

  try {
    const { activo, bootcampHitos, replayCompradoActivo, recorridoHabilitado } = await resolverAccesoBootcamp(datosContinuidad.correo);
    if (!activo) return res.status(200).json({ autenticado: false });

    return res.status(200).json({
      autenticado: true,
      puerta: 'B',
      correo: datosContinuidad.correo,
      bootcampHitos,
      replayCompradoActivo,
      compras: null,
      proximaConvocatoriaDisponible: null,
      experienciaGratuitaActiva: null,
      tieneRegistroHistorico: false,
      oportunidadBootcampActiva: null,
      // EL gate real de S0-S9, decidido por Orbit segun el producto de origen
      // del acceso — nunca derivado aqui de bootcampHitos, producto o puerta.
      recorridoHabilitado,
      emailVerified: null,
    });
  } catch (err) {
    console.error('mi-espacio-auth/sesion (continuidad Puerta B): Orbit no respondió:', err.message);
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

// Puerta 2 — Slice 4, pieza P6: reservar el lugar en la proxima
// Convocatoria abierta, desde dentro de Mi Espacio ya autenticado.
//
// Frontera de identidad (auditoria 2026-09-04, congelada en
// PUERTA-2-CODIGO-SOBERANA-MAPA-DE-SLICES.md, addendum de auditoria Pista
// A): el correo se obtiene EXCLUSIVAMENTE de la cookie de sesion verificada
// — nunca de req.body. El navegador nunca envia ni puede elegir el correo
// que se registra. Mismo patron de verificacion que sesionAccion.
async function convocatoriaReservarAccion(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const token = leerCookie(req);
  const datos = verificarToken(token);
  if (!datos) return res.status(401).json({ error: 'Sesión inválida o expirada.' });

  try {
    const cuenta = await obtenerCuenta(datos.correo);
    const vigente = cuenta && cuenta.estado === 'activa' && (cuenta.sessionVersion || 0) === datos.sessionVersion;
    if (!vigente) return res.status(401).json({ error: 'Sesión inválida o expirada.' });

    const resultado = await crearRegistroAutenticado(datos.correo);
    return res.status(200).json({ ok: true, convocatoria: resultado.convocatoria });
  } catch (err) {
    if (err.motivo === 'sin_convocatoria_abierta') {
      return res.status(409).json({ error: 'No hay ninguna clase gratuita abierta en este momento.' });
    }
    console.error('mi-espacio-auth/convocatoria-reservar error:', err.message);
    return res.status(500).json({ error: 'No se pudo completar la reserva.' });
  }
}

// Identidad de las acciones de completitud/entrada del Bootcamp (2026-09-19,
// gate de Puerta B): el correo SIEMPRE sale de una cookie verificada del lado
// servidor, nunca del body. Dos fuentes, en este orden, exactamente el mismo
// patron de fallback que sesionAccion:
//   1. mi_espacio_sesion (Puerta A, Cuenta): valida contra la Cuenta viva
//      (estado + sessionVersion). Si esta cookie es valida pero la Cuenta ya no
//      lo es, NO se cae a la segunda — sesion invalida, sin mezclar.
//   2. bootcamp_continuidad (Puerta B, cookie corta de 20 min): sin Cuenta, solo
//      el correo — quien la use vuelve a preguntarle a Orbit, que verifica
//      acceso vigente, Cohorte y calendario en cada llamada.
// Sin ninguna valida -> null (el llamador decide 401 / sin_sesion). Esta
// cookie de continuidad nunca otorga un derecho: solo identifica.
//
// Dos pasos, para conservar el orden original de las acciones (firma de la
// cookie -> validacion del hito -> consulta a la Cuenta -> Orbit): la lectura
// de la cookie es sincrona y barata; solo la Puerta A necesita ir a la Cuenta.
function leerSesionBootcamp(req) {
  const datosCuenta = verificarToken(leerCookie(req));
  if (datosCuenta) return { puerta: 'A', datosCuenta };
  const continuidad = verificarTokenContinuidadBootcamp(leerCookieContinuidadBootcamp(req));
  if (continuidad) return { puerta: 'B', correo: continuidad.correo };
  return null;
}

async function correoVigenteDeSesionBootcamp(sesion) {
  if (sesion.puerta === 'B') return sesion.correo;
  const { datosCuenta } = sesion;
  const cuenta = await obtenerCuenta(datosCuenta.correo);
  const vigente = cuenta && cuenta.estado === 'activa' && (cuenta.sessionVersion || 0) === datosCuenta.sessionVersion;
  return vigente ? datosCuenta.correo : null;
}

// Puerta 5, Corte 2 (cerrado 2026-09-12): unica evidencia de completitud
// implementada en este corte — el frontend, al recibir el evento 'ended'
// del embed de Bunny Stream en el replay de un Hito, llama aqui UNA vez
// (el backend ya es idempotente de todas formas, ON CONFLICT DO NOTHING).
//
// Frontera de identidad, no negociable (mismo criterio exacto que
// convocatoriaReservarAccion arriba): el correo SIEMPRE sale de la cookie
// de sesion ya verificada — este endpoint nunca acepta un correo que el
// navegador proponga en el body. Tampoco acepta ningun cohorteId: Orbit
// resuelve la Cohorte del lado servidor con resolverCohorteDePersona,
// nunca con un dato que el cliente pudiera manipular.
async function bootcampReplayVistoAccion(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const sesion = leerSesionBootcamp(req);
  if (!sesion) return res.status(401).json({ error: 'Sesión inválida o expirada.' });

  const hito = Number(req.body && req.body.hito);
  if (![1, 2, 3].includes(hito)) return res.status(400).json({ error: 'hito debe ser 1, 2 o 3' });

  try {
    const correo = await correoVigenteDeSesionBootcamp(sesion);
    if (!correo) return res.status(401).json({ error: 'Sesión inválida o expirada.' });

    const resultado = await confirmarBootcampHitoVisto(correo, hito);
    return res.status(200).json(resultado);
  } catch (err) {
    if (err.motivo === 'hito_no_disponible' || err.motivo === 'cohorte_no_resuelta' || err.motivo === 'sin_acceso_vigente') {
      return res.status(409).json({ error: err.motivo });
    }
    console.error('mi-espacio-auth/bootcamp-replay-visto error:', err.message);
    return res.status(500).json({ error: 'No se pudo registrar tu avance.' });
  }
}

// Puerta 5, Estación 7 (Zoom embebido completo, diseño cerrado
// 2026-09-15): equivalente de masterclassZoomJoinAccion para las 3
// Estaciones del Bootcamp. Mismo patron de autenticacion que
// bootcampReplayVistoAccion (cookie mi_espacio_sesion, Puerta A) — `hito`
// es el UNICO dato que decide el cliente, la Cohorte la resuelve Orbit del
// lado servidor via resolverCohorteDePersona, nunca un valor que el
// navegador pudiera manipular.
async function bootcampZoomJoinAccion(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const sesion = leerSesionBootcamp(req);
  if (!sesion) return res.status(200).json({ ok: false, motivo: 'sin_sesion' });

  const hito = Number(req.query?.hito);
  if (![1, 2, 3].includes(hito)) return res.status(400).json({ error: 'hito debe ser 1, 2 o 3' });

  try {
    const correo = await correoVigenteDeSesionBootcamp(sesion);
    if (!correo) return res.status(200).json({ ok: false, motivo: 'sin_sesion' });

    const resultado = await obtenerBootcampZoomJoin(correo, hito);
    return res.status(200).json(resultado || { ok: false, motivo: 'sin_respuesta' });
  } catch (err) {
    console.error('mi-espacio-auth/bootcamp-zoom-join: Orbit no respondió:', err.message);
    return res.status(503).json({ ok: false, motivo: 'no_disponible' });
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
// Contrato: `{activo}` cuando la consulta se resolvió (200), y un 503
// `{error:'no_disponible'}` cuando Orbit no respondió — nunca se confunde
// un fallo de infraestructura con un `activo:false` real (decisión
// explícita de la usuaria).
//
// Puerta 5, Corte 5 (Arquitectura de la Casa, diseño cerrado 2026-09-12):
// este endpoint es la Puerta B (venta directa de Código Soberana vía
// Hotmart → Brevo → login tradicional) — se descubrió que sigue siendo un
// consumidor real y activo (api/hotmart-webhook.js, lista Brevo #11,
// COMPRADORA_WORKSHOP), distinto de la Puerta A (Mi Espacio → cookie
// mi_espacio_sesion). NO se retira. Se extiende de forma aditiva con
// `bootcampHitos`/`replayCompradoActivo` (mismas funciones de Orbit que ya
// usa sesionAccion — obtenerBootcampHitos/obtenerReplayCompradoActivo,
// nunca una segunda logica de negocio) para que el shell de /workbook
// pueda aplicar el mismo gate de contenido sin importar por cual puerta
// entro la mujer. Cualquier consumidor viejo que solo lea `.activo` sigue
// funcionando exactamente igual — estos campos son puramente aditivos.
const PROGRAMA_CODIGO_SOBERANA = 'codigo-soberana';

// Puerta 5, Corte 5 + onboarding de instalación (2026-09-16): núcleo real de
// "¿esta compradora tiene acceso vigente al Bootcamp, y qué extras
// aditivos le corresponden?" — extraído para que workbookAccesoAccion (con
// rate-limit, la ruta que sí recibe un correo escrito por la usuaria) y la
// continuidad de Puerta B en sesionAccion (sin rate-limit, la ruta
// automática al abrir /workbook con la cookie de continuidad) llamen
// exactamente la misma verificación contra Orbit — nunca dos lógicas de
// negocio que puedan divergir.
//
// Gate del recorrido (2026-09-19, diseño aprobado): una SOLA consulta a Orbit
// (obtenerAccesoBootcamp) trae derecho, Hitos, Replay $5 y `recorridoHabilitado`
// — este ultimo lo decide Orbit por el producto de origen del acceso (venta
// directa 7369041: true de inmediato; Bootcamp 8499175: solo tras completar las
// 3 Estaciones). Esta capa solo lo transporta. Una sola consulta => o llega
// todo o falla todo (503), nunca un estado a medias.
async function resolverAccesoBootcamp(correo) {
  return obtenerAccesoBootcamp(correo, PROGRAMA_CODIGO_SOBERANA);
}

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
    const { activo, bootcampHitos, replayCompradoActivo, recorridoHabilitado } = await resolverAccesoBootcamp(correo);
    if (!activo) {
      await registrarIntento('ip', ip);
      await registrarIntento('correo', correo);
      return res.status(200).json({ activo: false });
    }

    await registrarExito('ip', ip);
    await registrarExito('correo', correo);

    // Puerta 5 (onboarding de instalación, diseño cerrado 2026-09-16):
    // continuidad de identidad de Puerta B entre /bienvenida-bootcamp y
    // /workbook — NUNCA transporta `activo` ni ningún derecho, solo el
    // correo, para que /workbook pueda repetir esta MISMA verificación en
    // vivo sin pedírselo de nuevo. Un fallo aquí (SECRET no configurada)
    // nunca niega el acceso ya confirmado arriba — mismo criterio que
    // bootcampHitos/replayCompradoActivo.
    const continuidad = construirCookieContinuidadBootcamp(correo);
    if (continuidad) res.setHeader('Set-Cookie', continuidad.cookie);

    return res.status(200).json({ activo: true, bootcampHitos, replayCompradoActivo, recorridoHabilitado });
  } catch (err) {
    console.error('mi-espacio-auth/workbook-acceso: Orbit no respondió:', err.message);
    return res.status(503).json({ error: 'no_disponible' });
  }
}

// Puerta 5, Estación 9A (transporte Push, diseño cerrado 2026-09-17):
// única acción de este archivo en la dirección Orbit->Mi Espacio (todas
// las demás son Mi Espacio->Orbit) — mismo x-orbit-secret/ORBIT_SHARED_SECRET
// que ya usa 'orbit-enviar-meta' en api/whatsapp.js para el puente de
// Meta, sin secreto nuevo. `correo` es la ÚNICA identidad que recibe —
// nunca un persona_id de Orbit (esa frontera no se cruza, ver
// api/_lib/push-fcm.js). Orbit decide título/cuerpo/url/tipo; este
// endpoint solo los entrega vía FCM, nunca decide nada de negocio.
async function enviarPushAccion(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const secreto = (req.headers && req.headers['x-orbit-secret']) || '';
  if (!process.env.ORBIT_SHARED_SECRET || secreto !== process.env.ORBIT_SHARED_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  // `correo` (uno solo, contrato original) y/o `correos[]` (todos los correos
  // de la Persona, ya resueltos por Orbit — diagnóstico de Push 2026-09-19).
  // Se aceptan ambos; enviarPushACorreo normaliza, deduplica correos y tokens
  // y aplica el tope. Este endpoint nunca decide quién es la Persona.
  const candidatos = [req.body?.correo, ...(Array.isArray(req.body?.correos) ? req.body.correos : [])];
  const correos = [...new Set(candidatos.map(normalizarCorreo).filter((c) => c && c.includes('@')))];
  const { titulo, cuerpo, url, tag, tipo } = req.body || {};
  if (correos.length === 0) return res.status(400).json({ error: 'correo (o correos) es requerido y debe ser un email válido' });
  if (!titulo || !cuerpo) return res.status(400).json({ error: 'titulo y cuerpo son requeridos' });

  try {
    const resultado = await enviarPushACorreo({ correos, titulo, cuerpo, url, tag, tipo });
    return res.status(200).json(resultado);
  } catch (err) {
    console.error('mi-espacio-auth/enviar-push error:', err.message);
    return res.status(500).json({ error: 'Error interno' });
  }
}

const ACCIONES = {
  'enviar-push': enviarPushAccion,
  'cuenta-crear': crearCuentaAccion,
  'cuenta-solicitar': solicitarCuentaAccion,
  'registro-gratuito': registroGratuitoAccion,
  'sesion-clase-gratuita': sesionClaseGratuitaAccion,
  'masterclass-zoom-join': masterclassZoomJoinAccion,
  'bootcamp-zoom-join': bootcampZoomJoinAccion,
  'reclamar-sesion-clase-gratuita': reclamarSesionClaseGratuitaAccion,
  'proxima-convocatoria': proximaConvocatoriaPublicaAccion,
  'sesiones-disponibles': sesionesDisponiblesAccion,
  login: loginAccion,
  logout: logoutAccion,
  sesion: sesionAccion,
  'recuperar-solicitar': recuperarSolicitarAccion,
  'recuperar-confirmar': recuperarConfirmarAccion,
  'confirmar-correo': confirmarCorreoAccion,
  'reenviar-confirmacion': reenviarConfirmacionAccion,
  'workbook-acceso': workbookAccesoAccion,
  'convocatoria-reservar': convocatoriaReservarAccion,
  'bootcamp-replay-visto': bootcampReplayVistoAccion,
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
