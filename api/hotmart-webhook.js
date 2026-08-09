// api/hotmart-webhook.js — versión final
// Mantiene toda la lógica original de listas + agrega teléfono a Brevo + guarda en Sheets

import { procesarEventoOrbit, reservarTareaOutbox, ESTADOS_ACTIVOS, ESTADOS_REVOCADOS } from './_lib/orbit-domain.js';
import { enviarCorreoInmediatoMasterclass } from './_lib/correo1-masterclass.js';
import { masterclassEnVivo, sendTemplateMasterclass, cancelarTrigger } from './whatsapp.js';
import { fsUpdate } from './_lib/firestore-rest.js';
import { registrarResultadoBienvenidaPorTelefono } from './_lib/recuperacion-acceso.js';

// Refund Management System (REFUND-MANAGEMENT-SYSTEM.md) — Comunicación, no Acceso (eso sigue
// siendo de Orbit V2, sin tocar). Mismos 2 grupos ya aprobados: revocación total (ESTADOS_REVOCADOS,
// reutilizado de orbit-domain.js, no una segunda lista) y pausa preventiva (PROTEST) — ambos
// reciben exactamente la misma acción de comunicación, solo cambia el motivo guardado.
async function suspenderComunicacionSiAplica(docId, estado, telefono) {
  const suspende = ESTADOS_REVOCADOS.includes(estado) || estado === 'PROTEST';
  if (!suspende) return;

  try {
    await fsUpdate('masterclass_compras', docId, {
      comunicacion_suspendida: true,
      comunicacion_suspendida_motivo: estado,
      comunicacion_suspendida_fecha: new Date().toISOString()
    });
    if (telefono) {
      await Promise.all([
        cancelarTrigger(telefono, 'recordatorio_evento_masterclass'),
        cancelarTrigger(telefono, 'recordatorio_replay_masterclass'),
        cancelarTrigger(telefono, 'puente_workshop'),
        cancelarTrigger(telefono, 'seguimiento_masterclass')
      ]);
    }
    console.log(`Comunicación suspendida (${estado}):`, docId);
  } catch (err) {
    console.error('suspenderComunicacionSiAplica error (no bloquea el webhook):', docId, err.message);
  }
}

// Aislado en su propio try/catch, igual que el bloque de Orbit — un fallo del Correo 1 nunca debe
// impedir que el resto del webhook (Brevo/Sheets/WhatsApp/masterclass_compras) siga funcionando.
async function enviarCorreo1Seguro(email, primerNombre, orbitMasterclass, telefonoLimpio) {
  try {
    await enviarCorreoInmediatoMasterclass({
      email, nombre: primerNombre, producto: orbitMasterclass, telefono: telefonoLimpio
    });
  } catch (err) {
    console.error('Correo 1 (transaccional) error inesperado, no bloquea el webhook:', err.message);
  }
}

// 🔧 CORREGIDO 2026-08-07 — Camino B pasa de "programar a 60 minutos" a "enviar de inmediato".
// Reemplaza únicamente el momento del envío — reutiliza sendTemplateMasterclass/masterclassEnVivo
// tal cual (api/whatsapp.js) y registrarResultadoBienvenidaPorTelefono (Nivel 1, ya existente para
// el flujo de Recuperación de Acceso) para dejar el mismo dato que ese motor ya consulta. No toca
// Camino A, no toca programarTrigger/cancelarTrigger (siguen usándose para los recordatorios
// posteriores), no reorganiza nada más de este archivo.
async function enviarBienvenidaWhatsAppInmediata(telefono, nombre, email) {
  if (!telefono) {
    console.log(`Sin teléfono para ${email} — no se puede enviar la bienvenida de WhatsApp`);
    return false;
  }
  try {
    const templateName = masterclassEnVivo() ? 'bienvenida_live_cs' : 'bienvenida_replay_cs';
    const aceptado = await sendTemplateMasterclass(telefono, nombre || 'amiga', templateName);
    await registrarResultadoBienvenidaPorTelefono(telefono, aceptado);
    return aceptado;
  } catch (err) {
    console.error('Bienvenida WhatsApp inmediata: error inesperado:', email, err.message);
    return false;
  }
}

// Marca BIENVENIDA_WA_ENVIADA en Brevo SOLO después de que Meta aceptó el envío (pedido explícito,
// 2026-08-07) — antes se marcaba de forma optimista al programar el trigger de 60 min, lo cual ya
// no aplica porque ahora el resultado real se conoce en el mismo request.
async function marcarBienvenidaEnviadaBrevo(email, BREVO_KEY) {
  try {
    await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
      body: JSON.stringify({ attributes: { BIENVENIDA_WA_ENVIADA: true } })
    });
  } catch (err) {
    console.error('marcarBienvenidaEnviadaBrevo error (no bloquea, la bienvenida ya se envió):', email, err.message);
  }
}

// Envoltorio de reservarTareaOutbox: un fallo aquí (ej. Firestore no responde) nunca debe impedir
// ni la respuesta 200 al webhook ni la comunicación legítima. Ante excepción, se asume "todavía no
// ejecutada" (true) — el peor caso posible es un WhatsApp duplicado, nunca uno perdido, y nunca peor
// que el comportamiento previo a que Orbit existiera (que no tenía ninguna deduplicación en la rama
// de creación de contacto, y solo el flag de Brevo en la rama de actualización).
async function reservarTareaOutboxSeguro(transaction, tarea) {
  try {
    return await reservarTareaOutbox(transaction, tarea);
  } catch (err) {
    console.error('reservarTareaOutbox falló (se asume no ejecutada, se procede igual):', err.message);
    return true;
  }
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, service: 'hotmart-webhook' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const body = req.body;
    console.log('Hotmart webhook received:', JSON.stringify(body).substring(0, 600));

    // ── Extraer datos del comprador ──────────────────────────────
    const email  =
      body?.data?.buyer?.email ||
      body?.buyer?.email ||
      body?.email || null;

    const nombre =
      body?.data?.buyer?.name ||
      body?.buyer?.name ||
      body?.name || '';

    // Webhook 2.0 de Hotmart envía el teléfono como checkout_phone (+ checkout_phone_code con el
    // indicativo de país) — phone/phone_number no existen en 2.0, por eso 2/2 compras llegaron con
    // tel vacío (FQ-1, validación end-to-end 2026-07-26). Las rutas antiguas se conservan como
    // fallback por si algún webhook quedara en 1.0.
    const checkoutPhoneDigits = String(body?.data?.buyer?.checkout_phone || '').replace(/[^\d]/g, '');
    const checkoutCodeDigits  = String(body?.data?.buyer?.checkout_phone_code || '').replace(/[^\d]/g, '');
    const telefonoCheckout = checkoutPhoneDigits
      ? ((checkoutCodeDigits && !checkoutPhoneDigits.startsWith(checkoutCodeDigits))
          ? checkoutCodeDigits + checkoutPhoneDigits
          : checkoutPhoneDigits)
      : '';

    const telefono =
      telefonoCheckout ||
      body?.data?.buyer?.phone_number ||
      body?.data?.buyer?.phone ||
      body?.buyer?.phone_number ||
      body?.buyer?.phone ||
      body?.phone || '';

    const productId =
      body?.data?.product?.id ||
      body?.product?.id || null;

    if (!email) {
      console.log('No email found in payload');
      return res.status(200).json({ received: true, action: 'no_email' });
    }

    console.log(`Comprador: ${nombre} | ${email} | tel: ${telefono} | producto: ${productId}`);

    const BREVO_KEY             = process.env.BREVO_KEY;
    const SOBERANA_7D_PRODUCT_ID = '7386435';
    const MASTERCLASS_PRODUCT_ID = '8128025';
    // Lista propia de Brevo para Masterclass (creada a mano por Josué 2026-08-08, ver
    // BUSINESS-SYSTEMS.md "CRM RESET") — corrige la contaminacion real encontrada en produccion:
    // el fallback anterior (lista 11, "Compradoras Codigo Soberana") hacia que una compra de
    // Masterclass disparara la automatizacion COMPRADORAS-CODIGO SOBERANA (trigger "contacto
    // anadido a lista #11"). Lista 11 vuelve a ser exclusiva de Codigo Soberana.
    const MASTERCLASS_LIST_ID   = 19;

    const isCompra7D            = String(productId) === SOBERANA_7D_PRODUCT_ID;
    const isMasterclass         = String(productId) === MASTERCLASS_PRODUCT_ID;
    const targetList            = isCompra7D ? 14 : (isMasterclass ? MASTERCLASS_LIST_ID : 11);
    const tipoContacto          = isCompra7D ? '7d' : (isMasterclass ? 'masterclass' : 'workshop');
    const perfilContacto        = isCompra7D ? 'COMPRADORA_7D' : (isMasterclass ? 'COMPRADORA_MASTERCLASS' : 'COMPRADORA_WORKSHOP');
    const primerNombre          = nombre.split(' ')[0] || '';
    const telefonoLimpio        = limpiarTelefono(telefono);

    console.log(`Tipo: ${tipoContacto} → Lista #${targetList}`);

    // ── Orbit: identidad + Compra + Acceso ────────────────────────
    // Aislado en su propio try/catch a propósito: un fallo aquí nunca debe impedir que el resto
    // del webhook (Brevo/Sheets/WhatsApp/masterclass_compras/workbook_acceso) siga funcionando
    // exactamente como hoy. Si Orbit falla, se cae a los valores que el webhook ya usaba antes de
    // que Orbit existiera (masterclass = 'mas-se-aleja', acceso = activo) — nunca revoca por error.
    let orbitMasterclass = isMasterclass ? 'mas-se-aleja' : null;
    let orbitAccesoActivo = true;
    let orbitEstado = null; // null = Orbit no pudo determinarlo (ver comunicacionAutorizada abajo)
    let orbitTransaction = null;
    if (isMasterclass) {
      try {
        const orbitResultado = await procesarEventoOrbit(body);
        if (orbitResultado.ok) {
          orbitTransaction = orbitResultado.transaction;
          if (orbitResultado.masterclass) orbitMasterclass = orbitResultado.masterclass;
          if (orbitResultado.accesoActivo !== null) orbitAccesoActivo = orbitResultado.accesoActivo;
          orbitEstado = orbitResultado.estado || null;
          console.log('Orbit procesado:', JSON.stringify(orbitResultado));
        } else {
          console.log('Orbit no procesó el evento (fallback a comportamiento previo):', orbitResultado.motivo);
        }
      } catch (err) {
        console.error('Orbit error (se ignora, no bloquea el webhook):', err.message);
      }
    }

    // 🔴 BUG CORREGIDO 2026-08-07 — "comunicación prematura ante eventos de pago no confirmado":
    // antes de este cambio, la bienvenida de WhatsApp y el Correo 1 se disparaban para CUALQUIER
    // evento del producto (BILLET_PRINTED, DELAYED, etc.), sin verificar el estado real de la
    // compra — solo el Acceso (orbitAccesoActivo) se calculaba correctamente. Regla definitiva:
    // "Solo ESTADOS_ACTIVOS puede disparar comunicaciones de bienvenida" — misma fuente de verdad
    // que ya usa Orbit para el Acceso, no una segunda lista. Si Orbit no pudo determinar el estado
    // (orbitEstado === null, ej. error de Orbit), se falla ABIERTO — mismo criterio ya establecido
    // para orbitAccesoActivo arriba ("nunca revoca por error", no se penaliza a una compradora real
    // por un fallo de infraestructura de Orbit).
    const comunicacionAutorizada = orbitEstado === null || ESTADOS_ACTIVOS.includes(orbitEstado);

    // Refund Management System (REFUND-MANAGEMENT-SYSTEM.md) — reutiliza ESTADOS_REVOCADOS de
    // orbit-domain.js, no una segunda clasificación. PROTEST recibe la misma acción de comunicación
    // que una revocación total (pausa, no revoca Acceso — eso sigue siendo de Orbit V2, sin tocar).
    const suspenderComunicacion = isMasterclass && (ESTADOS_REVOCADOS.includes(orbitEstado) || orbitEstado === 'PROTEST');

    // ── Buscar contacto en Brevo ─────────────────────────────────
    const searchRes = await fetch(
      `https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`,
      { method: 'GET', headers: { 'api-key': BREVO_KEY } }
    );

    if (!searchRes.ok) {
      // Contacto no existe — crear con todos los datos
      console.log('Contacto no existe — creando:', email);
      const createRes = await fetch('https://api.brevo.com/v3/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
        body: JSON.stringify({
          email,
          attributes: {
            FIRSTNAME:     primerNombre,
            SMS:           telefonoLimpio,
            HOTMART_PHONE: telefonoLimpio,
            // PRODUCTO guarda el programa_id real (identidad permanente de la masterclass,
            // catalogo masterclass_catalogo/{programa_id}), no la palabra generica "masterclass"
            // — necesario para poder distinguir entre masterclasses distintas en el futuro.
            ...(isMasterclass ? { PRODUCTO: orbitMasterclass } : {}),
            ...(suspenderComunicacion ? { COMUNICACION_SUSPENDIDA: true } : {})
          },
          listIds: [targetList],
          updateEnabled: true
        })
      });

      if (!createRes.ok) {
        const errBody = await createRes.text();
        console.error('Brevo contact creation FAILED:', createRes.status, errBody);
      } else {
        console.log('Brevo contact creation OK:', createRes.status);
      }

      await guardarEnSheets({
        fecha:    now(),
        nombre:   primerNombre,
        email:    email,
        whatsapp: telefonoLimpio,
        perfil:   perfilContacto,
        lista:    String(targetList),
        mensaje:  'Contacto nuevo creado desde Hotmart'
      });
      await guardarEnFirestore(email, primerNombre, tipoContacto, isMasterclass ? orbitMasterclass : null);

      // Contacto recién creado → nunca se le pudo haber enviado la bienvenida antes.
      if (isMasterclass) {
        await guardarCompraMasterclass(email, primerNombre, orbitMasterclass, telefonoLimpio, orbitAccesoActivo);
        await suspenderComunicacionSiAplica(`${email}__${orbitMasterclass}`, orbitEstado, telefonoLimpio);
        if (comunicacionAutorizada) {
          if (await reservarTareaOutboxSeguro(orbitTransaction, 'bienvenida_whatsapp')) {
            const aceptado = await enviarBienvenidaWhatsAppInmediata(telefonoLimpio, primerNombre, email);
            if (aceptado) await marcarBienvenidaEnviadaBrevo(email, BREVO_KEY);
          }
          await enviarCorreo1Seguro(email, primerNombre, orbitMasterclass, telefonoLimpio);
        } else {
          console.log('Comunicación NO autorizada (estado no aprobado):', email, orbitEstado);
        }
      }

      return res.status(200).json({
        received: true, action: 'contact_created', email, list: targetList
      });
    }

    // ── Contacto existe — actualizar listas y teléfono ───────────
    const contact      = await searchRes.json();
    const currentLists = contact.listIds || [];

    // Listas de las que hay que remover (lógica original)
    let listsToRemove = [];
    if (isCompra7D) {
      listsToRemove = currentLists.filter(id => [13].includes(id));
    } else {
      listsToRemove = currentLists.filter(id => [7, 8, 9].includes(id));
    }

    // Actualizar: listas + teléfono
    const updateBody = {
      listIds:       [targetList],
      unlinkListIds: listsToRemove,
      attributes:    {}
    };

    // Guardar teléfono solo si Hotmart lo envió
    if (telefonoLimpio) {
      updateBody.attributes.HOTMART_PHONE = telefonoLimpio;
      // Solo sobreescribir SMS si aún no tiene número confirmado
      const smsActual = contact.attributes?.SMS || '';
      if (!smsActual) {
        updateBody.attributes.SMS = telefonoLimpio;
        console.log(`SMS asignado desde Hotmart: ${telefonoLimpio}`);
      } else {
        console.log(`SMS ya existe (${smsActual}) — no se sobreescribe`);
      }
    }

    if (primerNombre && !contact.attributes?.FIRSTNAME) {
      updateBody.attributes.FIRSTNAME = primerNombre;
    }

    if (isMasterclass) {
      // Mismo criterio que en la creacion de contacto: PRODUCTO = programa_id real.
      updateBody.attributes.PRODUCTO = orbitMasterclass;
    }
    if (suspenderComunicacion) {
      updateBody.attributes.COMUNICACION_SUSPENDIDA = true;
    }

    // Solo enviar la bienvenida de WhatsApp si nunca se le ha enviado antes a este contacto —
    // evita duplicados si por alguna razón el webhook se dispara más de una vez para la misma compra.
    const bienvenidaYaEnviada = contact.attributes?.BIENVENIDA_WA_ENVIADA === true;
    // 🔧 CORREGIDO 2026-08-07: ya no se marca aquí de forma optimista (antes se hacía al mismo
    // tiempo que se programaba el trigger de 60 min). Ahora el envío es inmediato y en el mismo
    // request, así que el flag se marca más abajo, solo si Meta de verdad aceptó el envío
    // (marcarBienvenidaEnviadaBrevo) — nunca antes de saber el resultado real.

    const updateRes = await fetch(
      `https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
        body: JSON.stringify(updateBody)
      }
    );

    console.log('Brevo update status:', updateRes.status);

    // Guardar en Sheets
    await guardarEnSheets({
      fecha:    now(),
      nombre:   primerNombre || contact.attributes?.FIRSTNAME || '',
      email:    email,
      whatsapp: telefonoLimpio || contact.attributes?.SMS || '',
      perfil:   perfilContacto,
      lista:    String(targetList),
      mensaje:  `Listas removidas: ${listsToRemove.join(',') || 'ninguna'}`
    });
    await guardarEnFirestore(email, primerNombre || contact.attributes?.FIRSTNAME || '', tipoContacto, isMasterclass ? orbitMasterclass : null);
    if (isMasterclass) {
      await guardarCompraMasterclass(email, primerNombre || contact.attributes?.FIRSTNAME || '', orbitMasterclass, telefonoLimpio || contact.attributes?.SMS || '', orbitAccesoActivo);
      await suspenderComunicacionSiAplica(`${email}__${orbitMasterclass}`, orbitEstado, telefonoLimpio || contact.attributes?.SMS || '');
      if (comunicacionAutorizada) {
        // Idempotencia propia (correo1_estado en masterclass_compras) — seguro llamarlo aunque este
        // webhook sea "Compra completa" repitiendo lo que "Compra aprobada" ya disparó.
        await enviarCorreo1Seguro(email, primerNombre || contact.attributes?.FIRSTNAME || '', orbitMasterclass, telefonoLimpio || contact.attributes?.SMS || '');
      } else {
        console.log('Comunicación NO autorizada (estado no aprobado):', email, orbitEstado);
      }
    }

    if (isMasterclass && comunicacionAutorizada && !bienvenidaYaEnviada && await reservarTareaOutboxSeguro(orbitTransaction, 'bienvenida_whatsapp')) {
      const aceptado = await enviarBienvenidaWhatsAppInmediata(
        telefonoLimpio || contact.attributes?.SMS || '',
        primerNombre || contact.attributes?.FIRSTNAME || '',
        email
      );
      if (aceptado) await marcarBienvenidaEnviadaBrevo(email, BREVO_KEY);
    } else if (isMasterclass && bienvenidaYaEnviada) {
      console.log(`Bienvenida ya se había enviado antes a ${email} — no se repite`);
    }

    return res.status(200).json({
      received:        true,
      action:          `moved_to_compradoras_${tipoContacto}`,
      email,
      list:            targetList,
      removedFromLists: listsToRemove,
      phone:           telefonoLimpio
    });

  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(200).json({ received: true, error: err.message });
  }
}

// ── Bienvenida de WhatsApp — Camino B (REGLA WHATSAPP — MASTERCLASS, BUSINESS-SYSTEMS.md, sección
// FUNNEL-SYSTEM) ───────────────────────────────────────────────────────────────────────────────
// Ya NO se envía la plantilla de inmediato al comprar. Se programa a 60 minutos — si la compradora
// escribe antes por su cuenta (Camino A, ver api/whatsapp.js), ese mensaje abre la ventana y cancela
// este trigger, evitando que coexistan la plantilla y una bienvenida duplicada. Quien ejecuta el
// trigger es api/whatsapp.js (paso 'bienvenida_masterclass') — ahí mismo decide Live/Replay según
// la fecha del evento, misma fuente de verdad (MASTERCLASS_EVENTO_FIN) que ya vivía duplicada aquí.
// Nombre funcional, reutilizable para cualquier producto de entrada futuro en estado Evergreen/Replay
// (ver regla de nomenclatura en entry-product-system/SKILL.md) — nunca renombrar por producto.
async function programarBienvenidaMasterclass(phone, nombre, email) {
  if (!phone) {
    console.log(`Sin teléfono para ${email} — no se puede programar la bienvenida de WhatsApp`);
    return;
  }
  await programarTrigger(phone, 'bienvenida_masterclass', 60, nombre || ''); // producción: 60 min
}

async function programarTrigger(phone, paso, minutos, nombre) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) { console.log('Sin SHEETS_WEBHOOK_URL — no se pudo programar el trigger'); return; }
  const fechaEjecucion = new Date(Date.now() + minutos * 60 * 1000).toISOString();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'guardar_trigger_sheets',
        phone, paso, nombre: nombre || '',
        fechaEjecucion,
        webhook: 'https://invisible-a-soberana.josuecalderon.lat/api/whatsapp'
      })
    });
    const data = await res.json();
    console.log(`Trigger (${paso} en ${minutos}min):`, data.ok ? 'OK' : JSON.stringify(data));
  } catch (err) {
    console.error('programarTrigger error:', err.message);
  }
}

// ── Limpiar y normalizar teléfono ────────────────────────────────
function limpiarTelefono(tel) {
  if (!tel) return '';
  let limpio = String(tel).replace(/[^\d+]/g, '');
  if (!limpio) return '';
  if (!limpio.startsWith('+')) {
    if (limpio.startsWith('57') && limpio.length >= 12) {
      limpio = '+' + limpio;
    } else if (limpio.startsWith('52') && limpio.length >= 12) {
      limpio = '+' + limpio;
    } else {
      limpio = '+57' + limpio; // default Colombia
    }
  }
  return limpio;
}

// ── Guardar en Google Sheets ─────────────────────────────────────
async function guardarEnSheets(data) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) { console.log('Sin SHEETS_WEBHOOK_URL'); return false; }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    console.log('Sheets:', res.ok ? 'OK' : res.status);
    return res.ok;
  } catch (err) {
    console.error('guardarEnSheets:', err.message);
    return false;
  }
}

// ── Fecha Colombia ───────────────────────────────────────────────
// producto: slug del Entry Product (ej. 'mas-se-aleja') — solo aplica cuando tipo === 'masterclass'.
// Nota: un mismo email compra una sola masterclass hoy; si en el futuro una compradora acumula
// varias, este doc-por-email deja de alcanzar y hace falta una subcolección por producto — no se
// construye antes de que un caso real lo necesite.
async function guardarEnFirestore(email, nombre, tipo, producto) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    const { google } = await import('googleapis');
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/datastore']
    });
    const token = await auth.getAccessToken();
    const url = `https://firestore.googleapis.com/v1/projects/soberana-app/databases/(default)/documents/workbook_acceso/${encodeURIComponent(email)}`;
    await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          nombre: { stringValue: nombre },
          activo: { booleanValue: true },
          tipo: { stringValue: tipo },
          ...(producto ? { producto: { stringValue: producto } } : {}),
          fecha: { stringValue: new Date().toISOString() }
        }
      })
    });
    console.log('Firestore workbook_acceso actualizado:', email);
  } catch(err) {
    console.error('Error Firestore:', err.message);
  }
}

// ── Biblioteca de masterclasses compradas — un documento POR COMPRA, no por email ─────────
// A diferencia de workbook_acceso (un doc por email, se sobreescribe), esta colección permite que
// una misma clienta acumule varias masterclasses sin que una compra borre a la anterior. El
// Dashboard compartido ("Mi Espacio") lee de aquí — ver masterclass-platform-system, Bitácora
// "Corrección #2 de alcance" (2026-07-15).
async function guardarCompraMasterclass(email, nombre, producto, telefono, activo = true) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    const { google } = await import('googleapis');
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/datastore']
    });
    const token = await auth.getAccessToken();
    const docId = `${email}__${producto}`;
    const url = `https://firestore.googleapis.com/v1/projects/soberana-app/databases/(default)/documents/masterclass_compras/${encodeURIComponent(docId)}`;
    await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          email: { stringValue: email },
          nombre: { stringValue: nombre },
          producto: { stringValue: producto },
          // D-1: teléfono normalizado (FQ-1), fuente propia de Masterclass para personalizar
          // WhatsApp sin consultar el directorio histórico de Sheets — ver api/whatsapp.js.
          telefono: { stringValue: telefono || '' },
          activo: { booleanValue: activo },
          fecha: { stringValue: new Date().toISOString() }
        }
      })
    });
    console.log('Firestore masterclass_compras actualizado:', docId, '| activo:', activo);
  } catch (err) {
    console.error('Error guardando compra de masterclass:', err.message);
  }
}

function now() {
  return new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
}

