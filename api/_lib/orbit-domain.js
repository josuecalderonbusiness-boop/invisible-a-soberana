// api/_lib/orbit-domain.js — núcleo interno de Orbit para Masterclass.
//
// Responsabilidad de este módulo (y SOLO esta): recibir el payload ya parseado de un webhook de
// Hotmart de Masterclass, y mantener el modelo interno de Orbit (Persona / Compra / Acceso) de forma
// idempotente y resistente a reintentos y a eventos fuera de orden.
//
// Regla de arquitectura permanente (aprobada): Orbit es el sistema interno que decide y orquesta.
// Mi Espacio es el sistema externo que presenta y entrega. Orbit puede producir el dato que Mi
// Espacio necesita, pero Mi Espacio nunca depende de la estructura interna de Orbit.
//
// Por eso: nada de este archivo debe ser leído jamás por public/mi-espacio/index.html,
// api/mi-espacio-login.js ni api/mi-espacio-apuntes.js. El contrato con Mi Espacio sigue siendo,
// exclusivamente, la colección masterclass_compras — que este módulo NO escribe (eso lo sigue
// haciendo api/hotmart-webhook.js, tal cual hace hoy, usando el `masterclass` que aquí se resuelve).

const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/soberana-app/databases/(default)/documents';

// ── Mapeo Hotmart product.id → Masterclass (Orbit) ────────────────────────────────────────────
// Literal a propósito mientras exista una sola Masterclass real (decisión de dominio aprobada).
// Agregar una segunda Masterclass = agregar una entrada aquí, nada más.
const MASTERCLASS_MAP = {
  '8128025': 'mas-se-aleja'
};

function resolverMasterclass(productId) {
  return MASTERCLASS_MAP[String(productId)] || null;
}

// ── Tabla de estados de Hotmart → efecto sobre Acceso (contrato de dominio aprobado) ──────────
const ESTADOS_ACTIVOS   = ['APPROVED', 'COMPLETE', 'COMPLETED'];
const ESTADOS_REVOCADOS = ['CANCELLED', 'REFUNDED', 'CHARGEBACK', 'EXPIRED'];
// Cualquier otro estado (BLOCKED, NO_FUNDS, OVERDUE, PARTIALLY_REFUNDED, PRE_ORDER, PRINTED_BILLET,
// PROCESSING_TRANSACTION, PROTESTED, STARTED, UNDER_ANALYSIS, WAITING_PAYMENT) es intermedio: la
// Compra se registra igual, pero no sostiene ni revoca el Acceso todavía.

// ── Auth Firestore (mismo patrón que ya usan guardarEnFirestore/guardarCompraMasterclass) ─────
async function getToken() {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const { google } = await import('googleapis');
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/datastore']
  });
  return auth.getAccessToken();
}

// ── Codificación/decodificación genérica de valores Firestore REST ────────────────────────────
function toFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFirestoreValue) } };
  if (typeof v === 'object') return { mapValue: { fields: toFirestoreFields(v) } };
  return { stringValue: String(v) };
}
function toFirestoreFields(obj) {
  const fields = {};
  for (const k in obj) fields[k] = toFirestoreValue(obj[k]);
  return fields;
}
function fromFirestoreValue(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return parseInt(v.integerValue, 10);
  if ('doubleValue' in v) return v.doubleValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue' in v) return fromFirestoreFields(v.mapValue.fields || {});
  return null;
}
function fromFirestoreFields(fields) {
  const obj = {};
  for (const k in fields || {}) obj[k] = fromFirestoreValue(fields[k]);
  return obj;
}

async function fsGet(token, path) {
  const res = await fetch(`${FIRESTORE_BASE}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const data = await res.json();
  return data.fields ? fromFirestoreFields(data.fields) : null;
}
async function fsPatch(token, path, obj) {
  await fetch(`${FIRESTORE_BASE}/${path}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFirestoreFields(obj) })
  });
}
// Lee el doc, mezcla los campos nuevos encima, conserva creado_en si ya existía, y escribe todo de
// vuelta (el PATCH de Firestore REST sin updateMask reemplaza el documento completo).
async function upsertMerge(token, path, patchFields) {
  const existente = await fsGet(token, path);
  const ahora = new Date().toISOString();
  const merged = {
    ...(existente || {}),
    ...patchFields,
    creado_en: existente?.creado_en || ahora,
    actualizado_en: ahora
  };
  await fsPatch(token, path, merged);
  return merged;
}

// ── Normalización del payload crudo de Hotmart → forma interna de Orbit ───────────────────────
function normalizarEvento(rawBody) {
  const p = rawBody?.data?.purchase || {};
  const buyer = rawBody?.data?.buyer || {};
  const product = rawBody?.data?.product || {};
  return {
    idSobre: rawBody?.id || '',
    eventoTipo: rawBody?.event || '',
    transaction: p.transaction || '',
    status: p.status || '',
    orderDate: p.order_date ?? null,
    approvedDate: p.approved_date ?? null,
    montoCobrado: p.price?.value ?? null,
    monedaCobrada: p.price?.currency_value || '',
    precioOferta: p.original_offer_price?.value ?? null,
    monedaOferta: p.original_offer_price?.currency_value || '',
    productId: product.id,
    email: String(buyer.email || '').trim().toLowerCase()
  };
}
function fechaEfectiva(evento) {
  return evento.approvedDate || evento.orderDate || 0;
}

// ── Orquestador principal ──────────────────────────────────────────────────────────────────────
// Se llama una sola vez por webhook de Masterclass recibido. Devuelve lo mínimo que
// api/hotmart-webhook.js necesita para seguir escribiendo masterclass_compras exactamente como hoy,
// solo que ahora con el `masterclass` resuelto y el `activo` derivado correctamente por Orbit.
async function procesarEventoOrbit(rawBody) {
  const evento = normalizarEvento(rawBody);
  if (!evento.transaction || !evento.email) {
    return { ok: false, motivo: 'faltan_campos_minimos', masterclass: null, accesoActivo: null };
  }

  const masterclass = resolverMasterclass(evento.productId);
  const token = await getToken();
  const ahora = new Date().toISOString();

  // 1) Registro crudo e inmutable del evento — idempotente por el id del sobre del webhook.
  //    Nunca se pierde, gane o no la comparación de fecha de más abajo.
  const eventoPath = `orbit_compras/${encodeURIComponent(evento.transaction)}/eventos/${encodeURIComponent(evento.idSobre || evento.transaction + '-' + Date.now())}`;
  const eventoYaExistia = await fsGet(token, eventoPath);
  if (!eventoYaExistia) {
    await fsPatch(token, eventoPath, {
      event: evento.eventoTipo,
      status: evento.status,
      order_date: evento.orderDate,
      approved_date: evento.approvedDate,
      recibido_en: ahora
    });
  }

  // 2) Persona — upsert simple, dedupe exacto por email normalizado (sin fusión automática).
  await upsertMerge(token, `orbit_personas/${encodeURIComponent(evento.email)}`, {
    email: evento.email
  });

  // 3) Compra — el documento "vivo" solo se actualiza si este evento es igual o más reciente que
  //    el que ya teníamos guardado (protección contra eventos fuera de orden).
  const compraPath = `orbit_compras/${encodeURIComponent(evento.transaction)}`;
  const compraActual = await fsGet(token, compraPath);
  const fechaEntrante = fechaEfectiva(evento);
  const fechaVigente = compraActual?.estado_actual_fecha || 0;
  const esMasRecienteOIgual = !compraActual || fechaEntrante >= fechaVigente;

  let estadoVigente = compraActual?.estado_actual || null;
  if (esMasRecienteOIgual) {
    estadoVigente = evento.status;
    await upsertMerge(token, compraPath, {
      transaction: evento.transaction,
      product_id_hotmart: evento.productId,
      masterclass,
      persona_email: evento.email,
      estado_actual: evento.status,
      estado_actual_fecha: fechaEntrante,
      monto_cobrado: evento.montoCobrado,
      moneda_cobrada: evento.monedaCobrada,
      precio_oferta: evento.precioOferta,
      moneda_oferta: evento.monedaOferta,
      es_regalo: compraActual?.es_regalo ?? false
    });
  }

  // "Duplicado" = ya habíamos visto exactamente esta entrega (mismo id de sobre) antes de este request.
  const duplicado = eventoYaExistia !== null;

  if (!masterclass) {
    // product.id sin mapear: el hecho histórico ya quedó guardado arriba (Compra + evento crudo).
    // No se crea Acceso — nada que Mi Espacio necesite resolver — pero nada se pierde tampoco.
    return { ok: true, masterclass: null, transaction: evento.transaction, duplicado, accesoActivo: null };
  }

  // 4) Acceso — agregado único por Persona + Masterclass, sostenido por N compras (contrato aprobado).
  const accesoPath = `orbit_accesos/${encodeURIComponent(evento.email)}__${masterclass}`;
  const accesoActual = await fsGet(token, accesoPath) || {};
  let comprasActivas = Array.isArray(accesoActual.compras_activas) ? accesoActual.compras_activas.slice() : [];
  let comprasHistoricas = Array.isArray(accesoActual.compras_historicas) ? accesoActual.compras_historicas.slice() : [];

  // Regla estricta (corregida): un estado intermedio NO debe tocar la clasificación existente de
  // esta transaction. Por eso el filtro (quitar el rastro previo antes de reclasificar) solo corre
  // dentro de las dos ramas que sí clasifican — nunca de forma incondicional.
  const entradaCompra = { transaction: evento.transaction, masterclass_evento: masterclass };
  if (ESTADOS_ACTIVOS.includes(estadoVigente)) {
    comprasActivas = comprasActivas.filter((c) => c.transaction !== evento.transaction);
    comprasHistoricas = comprasHistoricas.filter((c) => c.transaction !== evento.transaction);
    comprasActivas.push(entradaCompra); // agrega o reafirma
  } else if (ESTADOS_REVOCADOS.includes(estadoVigente)) {
    comprasActivas = comprasActivas.filter((c) => c.transaction !== evento.transaction);
    comprasHistoricas = comprasHistoricas.filter((c) => c.transaction !== evento.transaction);
    comprasHistoricas.push({ ...entradaCompra, motivo: estadoVigente, revocado_en: ahora });
  }
  // Estado intermedio (BLOCKED, NO_FUNDS, OVERDUE, PARTIALLY_REFUNDED, PRE_ORDER, PRINTED_BILLET,
  // PROCESSING_TRANSACTION, PROTESTED, STARTED, UNDER_ANALYSIS, WAITING_PAYMENT): comprasActivas y
  // comprasHistoricas quedan exactamente como estaban — ni se agrega ni se quita nada.

  const accesoActivoFinal = comprasActivas.length > 0;

  await upsertMerge(token, accesoPath, {
    persona_email: evento.email,
    masterclass,
    estado: accesoActivoFinal ? 'activo' : 'revocado',
    compras_activas: comprasActivas,
    compras_historicas: comprasHistoricas
  });

  return { ok: true, masterclass, transaction: evento.transaction, duplicado, accesoActivo: accesoActivoFinal };
}

// ── Outbox — guardia de idempotencia para no duplicar WhatsApp/Brevo/Sheets ────────────────────
// Devuelve true la primera vez que se pide esa tarea para esa transacción; false si ya se había
// pedido antes (y por tanto no debe volver a ejecutarse la llamada real).
async function reservarTareaOutbox(transaction, tarea) {
  if (!transaction || !tarea) return true; // sin transaction no podemos deduplicar — se deja pasar
  const token = await getToken();
  const path = `orbit_outbox/${encodeURIComponent(transaction + '__' + tarea)}`;
  const existente = await fsGet(token, path);
  if (existente) return false;
  await fsPatch(token, path, {
    transaction,
    tarea,
    estado: 'hecho',
    creado_en: new Date().toISOString()
  });
  return true;
}

export { procesarEventoOrbit, reservarTareaOutbox, resolverMasterclass, MASTERCLASS_MAP };
