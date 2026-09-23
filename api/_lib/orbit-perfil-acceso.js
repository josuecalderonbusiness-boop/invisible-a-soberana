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

// Bypass de Vercel Deployment Protection (solo mientras ORBIT_BASE_URL
// apunte a una Preview protegida de Orbit) -- mecanismo OFICIAL de Vercel,
// header x-vercel-protection-bypass, nunca llega al navegador. Sin esta
// variable, no se manda el header (comportamiento identico a como era
// antes; Production no tiene esta protección). Necesario para la prueba
// humana en Preview de este corte (SIMULIVE, sala real) -- sesionClaseGratuitaAccion
// depende de consultarPerfilAcceso para experienciaGratuitaActiva.
const ORBIT_PROTECTION_BYPASS_SECRET = process.env.ORBIT_PROTECTION_BYPASS_SECRET;
function headersProteccionPreview() {
  if (!ORBIT_PROTECTION_BYPASS_SECRET) return {};
  return { 'x-vercel-protection-bypass': ORBIT_PROTECTION_BYPASS_SECRET };
}

// Puerta 5 — Ensayo General, Estación 4 (puente QA temporal, 2026-09-13):
// `qaReloj` es opcional y TODO-O-NADA — solo se agregan los 2 headers si
// ambos campos vienen presentes ({ secreto, simulado }), nunca uno solo y
// nunca un valor por defecto. Sin `qaReloj`, esta función es byte-por-byte
// idéntica a como era antes de este cambio. La autoridad real de si esos
// headers hacen algo vive enteramente del lado de Orbit (resolverAhoraQA,
// Corte 9) — timingSafeEqual contra QA_RELOJ_SECRET, que además NUNCA se
// deja configurada en Production fuera de la ventana explícita de un
// ensayo. Este archivo solo transporta, nunca decide ni valida el secreto.
function headersQaReloj(qaReloj) {
  if (!qaReloj || !qaReloj.secreto || !qaReloj.simulado) return {};
  return { 'x-qa-reloj-secret': qaReloj.secreto, 'x-qa-reloj-simulado': qaReloj.simulado };
}

async function consultarPerfilAcceso(correo, qaReloj) {
  if (!MI_ESPACIO_ORBIT_SECRET) {
    throw new Error('MI_ESPACIO_ORBIT_SECRET no configurada');
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ORBIT_BASE_URL}/api/v1/perfil-acceso`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-mi-espacio-secret': MI_ESPACIO_ORBIT_SECRET, ...headersQaReloj(qaReloj), ...headersProteccionPreview() },
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

// Puerta 2 — Slice 8 (workbook-acceso): espejo de tieneDerechoVigente pero
// acotado a un programaId específico — usado para que /workbook autorice
// contra el Derecho real de Orbit ('codigo-soberana'), en vez de contra
// Firestore workbook_acceso. No es un endpoint nuevo en Orbit: el contrato
// de perfil-acceso ya expone programaId+derecho, esto solo filtra.
async function tieneDerechoVigenteA(correo, programaId) {
  const perfil = await consultarPerfilAcceso(correo);
  return (perfil.programas || []).some((p) => p.programaId === programaId && p.derecho === 'vigente');
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

// Puerta 2 — Slice 5: experienciaGratuitaActiva es el UNICO contrato de la
// experiencia gratuita activa (reemplaza por completo a
// obtenerRegistrosActivos para este proposito — ver contrato final cerrado
// en PUERTA-2-MI-ESPACIO-EXPERIENCIA-CLASE-GRATUITA.md, seccion 8).
// { convocatoriaId, fechaHora, duracionEstimada, ventanaReplayHoras, fase,
// enlaceEnVivo, enlaceReplay } | null — fase en {espera,en_vivo,replay},
// nunca 'vencido' (esa es la ausencia del campo, null).
async function obtenerExperienciaGratuitaActiva(correo, qaReloj) {
  const perfil = await consultarPerfilAcceso(correo, qaReloj);
  return perfil.experienciaGratuitaActiva || null;
}

// Puerta 2 — Bootcamp Codigo Soberana (diseño cerrado 2026-09-11): dos
// campos que Orbit ya expone en perfil-acceso desde hace semanas
// (tieneRegistroHistorico, Slice 9) o desde el commit del Bootcamp
// (oportunidadBootcampActiva) pero que nunca habian llegado hasta aqui —
// espejo exacto del mismo patron ya usado para experienciaGratuitaActiva,
// sin transformar nada de lo que Orbit ya resolvio.

// "¿Alguna vez tuvo un Registro?" (historico, no solo activo) — distinto de
// tieneRegistroActivo de arriba, que solo mira registros ACTIVOS. false si
// el campo no viene (compatibilidad hacia atras).
async function obtenerTieneRegistroHistorico(correo) {
  const perfil = await consultarPerfilAcceso(correo);
  return !!perfil.tieneRegistroHistorico;
}

// { cohorteId, abierta } | null — Orbit ya resolvio internamente cual
// Convocatoria le corresponde a esta Persona y si su ventana comercial esta
// abierta; Mi Espacio nunca elige ninguna Convocatoria por su cuenta, solo
// representa este resultado ya calculado.
//
// Puerta 5 — Ensayo General, Estación 3 (hallazgo 2026-09-14): hasta este
// corte no reenviaba `qaReloj` (a diferencia de obtenerExperienciaGratuitaActiva,
// su vecino exacto arriba) — imposible de probar con el reloj QA end-to-end.
// Ahora es un espejo real, no solo de forma.
async function obtenerOportunidadBootcampActiva(correo, qaReloj) {
  const perfil = await consultarPerfilAcceso(correo, qaReloj);
  return perfil.oportunidadBootcampActiva || null;
}

// Puerta 3 — Replay $5 (diseño cerrado 2026-09-11): espejo exacto del mismo
// patron ya usado arriba — { convocatoriaId, fechaHora, nombreClase,
// enlaceReplay } | null, ya resuelto por Orbit (replayCompradoParaRespuesta
// en api/v1/perfil-acceso.js). Independiente de experienciaGratuitaActiva y
// de oportunidadBootcampActiva — ninguno de los tres se deriva de los otros.
async function obtenerReplayCompradoActivo(correo) {
  const perfil = await consultarPerfilAcceso(correo);
  return perfil.replayCompradoActivo || null;
}

// Puerta 5, Corte 2 (cerrado 2026-09-12): memoria de los 3 Hitos del
// Bootcamp — { cohorteId, hitos: [{hito, disponible, completado,
// enlaceEnVivo, enlaceReplay}], bootcampCompletado } | null. Espejo exacto
// del mismo patron ya usado arriba — Orbit ya resolvio todo, aqui solo se
// representa.
async function obtenerBootcampHitos(correo) {
  const perfil = await consultarPerfilAcceso(correo);
  return perfil.bootcampHitos || null;
}

// Puerta 5, Corte 6 (diseño cerrado 2026-09-12, ver CORTE-6-DISENO-REVELACION.md):
// EL gate real del recorrido Código Soberana (S0-S9) — booleano ya resuelto
// por Orbit (recorridoCodigoSoberanaHabilitado en api/v1/perfil-acceso.js):
// acceso vigente AND (origen de venta directa OR bootcamp_recorrido_habilitado).
// Reemplaza, para la Puerta A (Mi Espacio -> /workbook), al criterio viejo
// "bootcampHitos !== null" que solo exigia acceso, nunca haber completado
// nada — espejo exacto del mismo patron ya usado arriba, Orbit decide, aqui
// solo se representa.
async function obtenerRecorridoHabilitado(correo) {
  const perfil = await consultarPerfilAcceso(correo);
  return !!perfil.recorridoHabilitado;
}

// Puerta B (/api/workbook-acceso y continuidad de bootcamp_continuidad): todo
// lo que /workbook necesita saber de esta compradora, en UNA sola consulta a
// Orbit — Derecho vigente a `programaId`, memoria de los Hitos, Replay $5 y
// EL gate del recorrido. `recorridoHabilitado` lo decide Orbit
// (recorridoCodigoSoberanaHabilitado: por el producto de origen del acceso,
// nunca por la puerta de entrada) — aqui solo se representa, jamas se
// reconstruye a partir de bootcampHitos, producto o sesion. Si Orbit no manda
// el campo, es false (fail-closed): nunca se fabrica un "si" en el gate mas
// sensible del contrato. Una sola consulta => o llega todo o falla todo, sin
// estados a medias (un fallo parcial dejaria sin recorrido a una compradora
// de venta directa).
async function obtenerAccesoBootcamp(correo, programaId) {
  const perfil = await consultarPerfilAcceso(correo);
  const activo = (perfil.programas || []).some((p) => p.programaId === programaId && p.derecho === 'vigente');
  if (!activo) {
    return { activo: false, bootcampHitos: null, replayCompradoActivo: null, recorridoHabilitado: false };
  }
  return {
    activo: true,
    bootcampHitos: perfil.bootcampHitos || null,
    replayCompradoActivo: perfil.replayCompradoActivo || null,
    recorridoHabilitado: perfil.recorridoHabilitado === true,
  };
}

// Puerta 5, Corte 2 — unica evidencia de completitud implementada en este
// corte: Bunny 'ended' en el replay. Frontera de identidad, no negociable
// (mismo criterio ya congelado para crearRegistroAutenticado): el correo
// SIEMPRE viene de la sesion ya verificada del lado servidor de Mi
// Espacio — este archivo nunca acepta un correo que el navegador proponga
// directamente para esta llamada. El endpoint de Orbit tampoco acepta
// ningun cohorteId — la Cohorte se resuelve siempre alla, del lado
// servidor, con la misma resolucion que usa todo lo demas.
async function confirmarBootcampHitoVisto(correo, hito) {
  if (!MI_ESPACIO_ORBIT_SECRET) {
    throw new Error('MI_ESPACIO_ORBIT_SECRET no configurada');
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ORBIT_BASE_URL}/api/v1/perfil-acceso?accion=bootcamp-replay-visto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-mi-espacio-secret': MI_ESPACIO_ORBIT_SECRET },
      body: JSON.stringify({ correo, hito }),
      signal: controller.signal,
    });
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(cuerpo.error || `Orbit respondió ${res.status} al confirmar el Hito`);
      err.motivo = cuerpo.error || `orbit_respondio_${res.status}`;
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

// Puerta 5, Estación 7 (Zoom embebido completo, diseño cerrado 2026-09-15):
// equivalente de obtenerMasterclassZoomJoin para las 3 Estaciones del
// Bootcamp — mismo criterio de frontera de identidad (correo SIEMPRE de la
// sesion ya verificada, `hito` es el unico dato que decide el cliente,
// Cohorte se resuelve del lado de Orbit). Devuelve el MISMO contrato SDK
// que obtenerMasterclassZoomJoin — el componente de embed del frontend no
// necesita saber cual de las dos llamo.
async function obtenerBootcampZoomJoin(correo, hito) {
  if (!MI_ESPACIO_ORBIT_SECRET) {
    throw new Error('MI_ESPACIO_ORBIT_SECRET no configurada');
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ORBIT_BASE_URL}/api/v1/perfil-acceso?accion=bootcamp-zoom-registrar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-mi-espacio-secret': MI_ESPACIO_ORBIT_SECRET },
      body: JSON.stringify({ correo, hito }),
      signal: controller.signal,
    });
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(cuerpo.error || `Orbit respondió ${res.status} al pedir el join de Zoom del Bootcamp`);
      err.motivo = cuerpo.error || `orbit_respondio_${res.status}`;
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

// Puerta 5 — Ensayo General, Estación 4 (Masterclass gratuita en_vivo vía
// Meeting SDK embebido, diseño cerrado 2026-09-14): mismo criterio de
// frontera de identidad que confirmarBootcampHitoVisto — el correo
// SIEMPRE viene de la sesion ya verificada del lado servidor (nunca uno
// que el navegador proponga). `qaReloj` es opcional, mismo mecanismo
// todo-o-nada ya usado en consultarPerfilAcceso — sin el, comportamiento
// identico al de siempre.
async function obtenerMasterclassZoomJoin(correo, qaReloj) {
  if (!MI_ESPACIO_ORBIT_SECRET) {
    throw new Error('MI_ESPACIO_ORBIT_SECRET no configurada');
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ORBIT_BASE_URL}/api/v1/perfil-acceso?accion=masterclass-zoom-join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-mi-espacio-secret': MI_ESPACIO_ORBIT_SECRET, ...headersQaReloj(qaReloj) },
      body: JSON.stringify({ correo }),
      signal: controller.signal,
    });
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(cuerpo.error || `Orbit respondió ${res.status} al pedir el join de Zoom`);
      err.motivo = cuerpo.error || `orbit_respondio_${res.status}`;
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

// Puerta 2 — hallazgo real 2026-09-09 (prueba end-to-end en Preview): justo
// después de que Orbit acepta un registro nuevo (escritura en /api/registro,
// público), preguntar de inmediato por experienciaGratuitaActiva (lectura en
// /api/v1/perfil-acceso) puede llegar antes de que Orbit termine de reflejar
// internamente ese registro — la respuesta viene vacía aunque el registro sí
// se haya aceptado. Reintento pequeño y acotado, nunca infinito: como mucho
// 3 lecturas con una espera breve entre cada una, se detiene apenas obtiene
// una experiencia utilizable (con convocatoriaId y fechaHora). Si las 3
// fallan, devuelve null — el llamador (registroGratuitoAccion) ya sabe tratar
// null como "no se pudo emitir la cookie esta vez", nunca como una falla del
// registro en sí.
const REGISTRO_REINTENTOS = 3;
const REGISTRO_ESPERA_MS = 300;

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function obtenerExperienciaGratuitaActivaConReintento(correo, intentos = REGISTRO_REINTENTOS, esperaMs = REGISTRO_ESPERA_MS) {
  for (let intento = 1; intento <= intentos; intento++) {
    const experiencia = await obtenerExperienciaGratuitaActiva(correo);
    if (experiencia && experiencia.convocatoriaId && experiencia.fechaHora) return experiencia;
    if (intento < intentos) await esperar(esperaMs);
  }
  return null;
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

// Puerta 2 — Slice 2: proxy same-origin de /api/registro (pre-sesión, sin
// correo/identidad conocida todavía). A diferencia del resto de este
// archivo, este endpoint de Orbit es PUBLICO — no lleva
// x-mi-espacio-secret porque hoy lo llama directamente el navegador desde
// la landing (verificado: la landing no manda ningun secreto). Mover la
// llamada al servidor no cambia esa realidad, solo prepara el lugar donde
// Slice 3 podra emitir la cookie temporal en la misma respuesta. No se
// reescribe el contrato de Orbit — mismo body, mismo shape de respuesta,
// pass-through de status.
async function registrarClaseGratuita({ email, telefono, nombre, origen }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ORBIT_BASE_URL}/api/registro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, telefono, nombre, origen }),
      signal: controller.signal
    });
    const cuerpo = await res.json().catch(() => ({}));
    return { status: res.status, cuerpo };
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

// Puerta 2 — Slice 6: proxy same-origin del endpoint PUBLICO
// GET /api/v1/proxima-convocatoria (sin secreto, igual que
// registrarClaseGratuita) — la landing lo usa para mostrar la fecha real
// del proximo sabado en vez de una fecha fija en el HTML. Deliberadamente
// distinto de obtenerProximaConvocatoriaDisponible (esa es la version
// AUTENTICADA que consume Mi Espacio via perfil-acceso, con secreto) — dos
// endpoints de Orbit distintos para dos audiencias distintas (anonima vs.
// ya identificada), mismo dato de fondo.
async function obtenerProximaConvocatoriaPublica() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ORBIT_BASE_URL}/api/v1/proxima-convocatoria`, { signal: controller.signal });
    if (!res.ok) {
      const err = new Error(`Orbit respondió ${res.status} al consultar la proxima convocatoria`);
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

// Puerta 2 — Slice 7e (relay selectivo Legacy->Orbit, 2026-09-10, ver
// auditoria del mismo dia): unico llamador es el guard nuevo en
// api/whatsapp.js para el boton Quick Reply "Ver mi clase" — el webhook
// REAL de Meta sigue siendo este archivo/api/whatsapp.js (Orbit no tiene
// numero/app propio todavia), asi que esto es lo que le entrega a Orbit
// exactamente el evento que necesita para responder, sin que Orbit tenga
// que suscribirse a Meta directamente.
//
// Fail-safe estricto (a diferencia del resto de este archivo, que SI
// relanza): el llamador es el webhook de Meta en vivo, que debe responder
// 200 pase lo que pase con Orbit — nunca debe lanzar. Mismo patron
// AbortController+timeout que el resto del archivo, mismo secreto
// (MI_ESPACIO_ORBIT_SECRET / x-mi-espacio-secret) — NUNCA el
// X-Hub-Signature-256 de Meta, que es una garantia distinta (prueba que el
// mensaje vino de Meta, no que la llamada vino de invisible-a-soberana) y
// que Orbit reserva exclusivamente para su propio webhook.
async function relayBotonVerMiClaseAOrbit({ wamid, telefono, payload, texto, timestampMeta }) {
  if (!MI_ESPACIO_ORBIT_SECRET) {
    console.error('relayBotonVerMiClaseAOrbit: MI_ESPACIO_ORBIT_SECRET no configurada, relay omitido');
    return { ok: false, motivo: 'sin_secreto' };
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ORBIT_BASE_URL}/api/v1/perfil-acceso?accion=whatsapp-relay-ver-mi-clase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-mi-espacio-secret': MI_ESPACIO_ORBIT_SECRET },
      body: JSON.stringify({ wamid, telefono, payload, texto, timestampMeta }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`relayBotonVerMiClaseAOrbit: Orbit respondio ${res.status}`);
      return { ok: false, motivo: `orbit_respondio_${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    const motivo = err.name === 'AbortError' ? 'timeout' : 'error_red';
    console.error('relayBotonVerMiClaseAOrbit error:', motivo, err.message);
    return { ok: false, motivo };
  } finally {
    clearTimeout(timeoutId);
  }
}

export {
  tieneDerechoVigente,
  tieneDerechoVigenteA,
  obtenerComprasVigentes,
  tieneRegistroActivo,
  obtenerRegistrosActivos,
  obtenerProximaConvocatoriaDisponible,
  obtenerProximaConvocatoriaPublica,
  obtenerExperienciaGratuitaActiva,
  obtenerExperienciaGratuitaActivaConReintento,
  obtenerTieneRegistroHistorico,
  obtenerOportunidadBootcampActiva,
  obtenerReplayCompradoActivo,
  obtenerBootcampHitos,
  obtenerRecorridoHabilitado,
  obtenerAccesoBootcamp,
  confirmarBootcampHitoVisto,
  obtenerMasterclassZoomJoin,
  obtenerBootcampZoomJoin,
  crearRegistroAutenticado,
  registrarClaseGratuita,
  relayBotonVerMiClaseAOrbit,
};
