// api/_lib/orbit-perfil-acceso.js — cliente real de Orbit para el contrato de
// "perfil de acceso" (Fase 3.2, 2026-08-02). Reemplaza a derecho-provisional.js —
// misma firma pública (tieneDerechoVigente, obtenerComprasVigentes) para que los
// endpoints que ya las consumen no necesiten cambios más allá del import.
//
// Único punto de invisible-a-soberana que sabe que existe un Orbit real (URL,
// secreto, timeout) — nadie más debería saberlo. Orbit resuelve la identidad
// internamente (correo → persona_id vía `contacto`); persona_id nunca cruza
// hacia acá, ni se ve en este archivo.
//
// El contrato solo expone `programaId` + `derecho` (nunca fecha de compra —
// decisión YAGNI 2026-08-02: hoy existe un solo Programa, ordenar por fecha no
// aporta nada; se amplía el contrato si llega a hacer falta en Fase 4).
//
// Puerta 2 (Clase Gratuita) — Slice 3 (ver
// C:\BUSINESS-SYSTEMS\PUERTA-2-CLASE-GRATUITA-DISENO-FINAL.md, secciones 4 y
// 7, diseño cerrado 2026-09-02): el mismo perfil de acceso ahora trae, en
// paralelo a `programas`, una lista `registros` — Registros ACTIVOS a una
// Convocatoria de clase gratuita (entidad nueva y propia, nunca un Programa
// ni un Derecho). Se consume la misma respuesta, sin llamada de red nueva —
// mismo patron exacto que tieneDerechoVigente/obtenerComprasVigentes.

const ORBIT_BASE_URL = process.env.ORBIT_BASE_URL || 'https://orbit-mc-six.vercel.app';
const MI_ESPACIO_ORBIT_SECRET = process.env.MI_ESPACIO_ORBIT_SECRET;
const TIMEOUT_MS = 4000; // Conversación interactiva (contrato cerrado 2026-08-02) — la alumna espera en pantalla.

async function consultarPerfilAcceso(correo) {
  if (!MI_ESPACIO_ORBIT_SECRET) {
    throw new Error('MI_ESPACIO_ORBIT_SECRET no configurada');
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ORBIT_BASE_URL}/api/v1/perfil-acceso`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-mi-espacio-secret': MI_ESPACIO_ORBIT_SECRET },
      body: JSON.stringify({ correo }),
      signal: controller.signal
    });
    if (!res.ok) {
      const err = new Error(`Orbit respondió ${res.status} al consultar perfil de acceso`);
      err.motivo = `orbit_respondio_${res.status}`;
      throw err;
    }
    return await res.json();
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

async function tieneDerechoVigente(correo) {
  const perfil = await consultarPerfilAcceso(correo);
  return (perfil.programas || []).some((p) => p.derecho === 'vigente');
}

// Nombre de la función y forma de retorno ({ producto }) se conservan iguales a
// derecho-provisional.js por compatibilidad con los callers existentes — el
// nombre visual del Programa lo resuelve cada caller desde su propio catálogo
// (PRODUCTOS), nunca desde acá (Orbit no es dueño de esa información, DR-006).
async function obtenerComprasVigentes(correo) {
  const perfil = await consultarPerfilAcceso(correo);
  return (perfil.programas || [])
    .filter((p) => p.derecho === 'vigente')
    .map((p) => ({ producto: p.programaId }));
}

// Espejo de tieneDerechoVigente, para la segunda fuente de acceso a Mi
// Espacio (seccion 7 del diseño): Registro activo, no Derecho.
async function tieneRegistroActivo(correo) {
  const perfil = await consultarPerfilAcceso(correo);
  return (perfil.registros || []).length > 0;
}

// Espejo de obtenerComprasVigentes. Se conserva la forma minima que ya
// devuelve Orbit (convocatoriaId + fechaHora) — no se inventan campos que
// Mi Espacio todavia no necesita (la tarjeta visual de clase gratuita es un
// slice futuro, Slice 4).
async function obtenerRegistrosActivos(correo) {
  const perfil = await consultarPerfilAcceso(correo);
  return perfil.registros || [];
}

// Puerta 2 — Slice 4 ("Mi Espacio persistente"): proximaConvocatoriaDisponible
// es un dato GENERICO (igual para cualquier correo), no una propiedad de la
// Persona — pero viaja en la misma respuesta de perfil-acceso para evitar
// una segunda llamada de red (mismo patron que el resto de este archivo).
async function obtenerProximaConvocatoriaDisponible(correo) {
  const perfil = await consultarPerfilAcceso(correo);
  return perfil.proximaConvocatoriaDisponible || null;
}

// Puerta 2 — Slice 4, pieza P6: reserva el lugar de una Persona ya
// autenticada en la proxima Convocatoria abierta. NUNCA se le pasa un
// correo que venga del cliente/navegador — el unico llamador valido es la
// accion "convocatoria-reservar" de mi-espacio-auth.js, que primero verifica
// la cookie de sesion (leerCookie/verificarToken) y solo entonces llama
// aqui con el correo ya confiable de esa sesion. Llama a un endpoint
// distinto del que usa consultarPerfilAcceso (registro-autenticado, no
// perfil-acceso) pero con el mismo secreto y el mismo patron de
// autenticacion servidor-a-servidor.
async function crearRegistroAutenticado(correo) {
  if (!MI_ESPACIO_ORBIT_SECRET) {
    throw new Error('MI_ESPACIO_ORBIT_SECRET no configurada');
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ORBIT_BASE_URL}/api/v1/registro-autenticado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-mi-espacio-secret': MI_ESPACIO_ORBIT_SECRET },
      body: JSON.stringify({ correo }),
      signal: controller.signal
    });
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(cuerpo.error || `Orbit respondió ${res.status} al reservar la Convocatoria`);
      err.motivo = res.status === 409 ? 'sin_convocatoria_abierta' : `orbit_respondio_${res.status}`;
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

export {
  tieneDerechoVigente,
  obtenerComprasVigentes,
  tieneRegistroActivo,
  obtenerRegistrosActivos,
  obtenerProximaConvocatoriaDisponible,
  crearRegistroAutenticado,
};
