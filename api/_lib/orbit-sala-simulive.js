// api/_lib/orbit-sala-simulive.js — cliente de Orbit para las 5 acciones de
// sala de SIMULIVE (docs/v2/SIMULIVE.md, demo). Mismo criterio que
// orbit-perfil-acceso.js: único punto de este repo que sabe que existen
// estas rutas de Orbit; correo SIEMPRE viene de la sesión ya verificada del
// lado servidor de Mi Espacio, nunca de un valor que el navegador proponga
// para esta llamada.
//
// El secreto QA (x-qa-reloj-secret / x-qa-reloj-simulado) nunca sale de
// este proceso servidor: quien lo necesita es este archivo (para reenviarlo
// a Orbit), configurado en su propio entorno Preview — el navegador nunca
// lo ve, ni en la URL ni en ningún otro lugar visible desde el cliente (ver
// resolverHeadersQaEscenario en mi-espacio-auth.js).
//
// ORBIT_PROTECTION_BYPASS_SECRET (solo mientras ORBIT_BASE_URL apunte a una
// Preview protegida por Vercel Authentication SSO, docs/v2/SIMULIVE.md):
// mecanismo OFICIAL de Vercel, header x-vercel-protection-bypass — nunca
// llega al navegador, es exclusivamente servidor-a-servidor. Sin esta
// variable, simplemente no se manda el header (comportamiento normal contra
// Production, que no tiene esta protección).

const ORBIT_BASE_URL = process.env.ORBIT_BASE_URL || 'https://orbit-mc-six.vercel.app';
const MI_ESPACIO_ORBIT_SECRET = process.env.MI_ESPACIO_ORBIT_SECRET;
const ORBIT_PROTECTION_BYPASS_SECRET = process.env.ORBIT_PROTECTION_BYPASS_SECRET;
const TIMEOUT_MS = 4000;

function headersQaReloj(qaReloj) {
  if (!qaReloj || !qaReloj.secreto || !qaReloj.simulado) return {};
  return { 'x-qa-reloj-secret': qaReloj.secreto, 'x-qa-reloj-simulado': qaReloj.simulado };
}

function headersProteccionPreview() {
  if (!ORBIT_PROTECTION_BYPASS_SECRET) return {};
  return { 'x-vercel-protection-bypass': ORBIT_PROTECTION_BYPASS_SECRET };
}

async function llamarOrbitSala(accion, { method, correo, params, body, qaReloj }) {
  if (!MI_ESPACIO_ORBIT_SECRET) throw new Error('MI_ESPACIO_ORBIT_SECRET no configurada');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let url = `${ORBIT_BASE_URL}/api/v1/perfil-acceso?accion=${accion}`;
    const opciones = {
      method,
      headers: { 'x-mi-espacio-secret': MI_ESPACIO_ORBIT_SECRET, ...headersQaReloj(qaReloj), ...headersProteccionPreview() },
      signal: controller.signal,
    };
    if (method === 'GET') {
      const qs = new URLSearchParams({ correo, ...params });
      url += `&${qs.toString()}`;
    } else {
      opciones.headers['Content-Type'] = 'application/json';
      opciones.body = JSON.stringify({ correo, ...body });
    }
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(cuerpo.error || `Orbit respondió ${res.status} en sala-${accion}`);
      err.motivo = cuerpo.error || `orbit_respondio_${res.status}`;
      err.status = res.status;
      throw err;
    }
    return cuerpo;
  } catch (err) {
    if (err.name === 'AbortError') {
      const e = new Error('Orbit no respondió a tiempo');
      e.motivo = 'timeout';
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function salaAbrir(correo, convocatoriaId, qaReloj) {
  return llamarOrbitSala('sala-abrir', { method: 'POST', correo, body: { convocatoriaId }, qaReloj });
}

async function salaEstado(correo, convocatoriaId, desde) {
  return llamarOrbitSala('sala-estado', { method: 'GET', correo, params: { convocatoriaId, ...(desde ? { desde } : {}) } });
}

// Bloque B (2026-09-25): Orbit valida fase en_vivo + ventana de la pregunta con
// SU reloj, así que el reloj de QA (solo Preview, fail-closed en Orbit) debe
// viajar también aquí — igual que en sala-abrir — o una prueba con reloj
// simulado vería la sesión "en_vivo" en abrir y "replay" en responder.
async function salaResponder(correo, convocatoriaId, eventoId, opcionId, qaReloj) {
  return llamarOrbitSala('sala-responder', { method: 'POST', correo, body: { convocatoriaId, eventoId, opcionId }, qaReloj });
}

async function salaChatEnviar(correo, convocatoriaId, texto) {
  return llamarOrbitSala('sala-chat-enviar', { method: 'POST', correo, body: { convocatoriaId, texto } });
}

async function salaReaccionar(correo, convocatoriaId, tipo) {
  return llamarOrbitSala('sala-reaccionar', { method: 'POST', correo, body: { convocatoriaId, tipo } });
}

export { salaAbrir, salaEstado, salaResponder, salaChatEnviar, salaReaccionar };
