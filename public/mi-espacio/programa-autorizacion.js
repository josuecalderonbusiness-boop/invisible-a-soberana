// public/mi-espacio/programa-autorizacion.js — cliente aislado de la
// Conversación 3 (DR-006/DR-007), con cacheo por sesión (sessionStorage),
// tal como quedó aprobado: se consulta una vez al iniciar la sesión del
// Programa y se conserva esa autorización hasta que la sesión termine, el
// usuario reingrese, o cambie de Programa — nunca se persiste más allá de
// la sesión (nunca localStorage).
//
// BLOQUEO DE ARQUITECTURA (no un pendiente técnico): este archivo NO está
// incluido desde index.html ni conectado al login real de Mi Espacio.
// Requiere un persona_id que hoy nadie le entrega al alumno real — ver la
// nota en api/v1/autorizar-programa.js. Solo se puede probar llamando
// estas funciones a mano (por ejemplo desde la consola del navegador) con
// un persona_id conocido de antemano.

function claveCache(personaId, programaId) {
  return `orbit_autorizacion__${personaId}__${programaId}`;
}

// Devuelve { resultado: 'PERMITIR' | 'DENEGAR' | 'NO_VERIFICADO', motivo? }.
// PERMITIR/DENEGAR se cachean por sesión; NO_VERIFICADO nunca se cachea,
// para que la próxima llamada reintente en vez de quedar pegada a una falla
// temporal — mismo principio ya cerrado: "sin autorización" y "no pude
// verificar" son señales distintas y nunca se confunden.
async function verificarAutorizacion(personaId, programaId) {
  const clave = claveCache(personaId, programaId);
  const cacheado = sessionStorage.getItem(clave);
  if (cacheado) return JSON.parse(cacheado);

  const url = `/api/v1/autorizar-programa?persona_id=${encodeURIComponent(personaId)}&programa_id=${encodeURIComponent(programaId)}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.resultado === 'PERMITIR' || data.resultado === 'DENEGAR') {
    sessionStorage.setItem(clave, JSON.stringify(data));
  }
  return data;
}

function limpiarAutorizacion(personaId, programaId) {
  sessionStorage.removeItem(claveCache(personaId, programaId));
}

window.OrbitAutorizacion = { verificarAutorizacion, limpiarAutorizacion };
