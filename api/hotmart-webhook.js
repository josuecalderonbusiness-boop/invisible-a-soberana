// api/hotmart-webhook.js — versión final
// Mantiene toda la lógica original de listas + agrega teléfono a Brevo + guarda en Sheets

import { procesarEventoOrbit, reservarTareaOutbox } from './_lib/orbit-domain.js';
import { enviarCorreoInmediatoMasterclass } from './_lib/correo1-masterclass.js';

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
    // PENDIENTE: crear la lista "COMPRADORA_MASTERCLASS" en Brevo y reemplazar este valor.
    // Mientras sea null, las compradoras de la masterclass caen en la lista del Workshop (11)
    // pero quedan marcadas con el atributo PRODUCTO='masterclass' para no perder el dato.
    const MASTERCLASS_LIST_ID   = null;

    const isCompra7D            = String(productId) === SOBERANA_7D_PRODUCT_ID;
    const isMasterclass         = String(productId) === MASTERCLASS_PRODUCT_ID;
    const targetList            = isCompra7D ? 14 : (isMasterclass && MASTERCLASS_LIST_ID ? MASTERCLASS_LIST_ID : 11);
    const tipoContacto          = isCompra7D ? '7d' : (isMasterclass ? 'masterclass' : 'workshop');
    const perfilContacto        = isCompra7D ? 'COMPRADORA_7D' : (isMasterclass ? 'COMPRADORA_MASTERCLASS' : 'COMPRADORA_WORKSHOP');
    const primerNombre          = nombre.split(' ')[0] || '';
    const telefonoLimpio        = limpiarTelefono(telefono);

    if (isMasterclass && !MASTERCLASS_LIST_ID) {
      console.log('⚠️  Masterclass sin lista Brevo propia todavía — usando lista 11 (Workshop) con atributo PRODUCTO=masterclass');
    }
    console.log(`Tipo: ${tipoContacto} → Lista #${targetList}`);

    // ── Orbit: identidad + Compra + Acceso ────────────────────────
    // Aislado en su propio try/catch a propósito: un fallo aquí nunca debe impedir que el resto
    // del webhook (Brevo/Sheets/WhatsApp/masterclass_compras/workbook_acceso) siga funcionando
    // exactamente como hoy. Si Orbit falla, se cae a los valores que el webhook ya usaba antes de
    // que Orbit existiera (masterclass = 'mas-se-aleja', acceso = activo) — nunca revoca por error.
    let orbitMasterclass = isMasterclass ? 'mas-se-aleja' : null;
    let orbitAccesoActivo = true;
    let orbitTransaction = null;
    if (isMasterclass) {
      try {
        const orbitResultado = await procesarEventoOrbit(body);
        if (orbitResultado.ok) {
          orbitTransaction = orbitResultado.transaction;
          if (orbitResultado.masterclass) orbitMasterclass = orbitResultado.masterclass;
          if (orbitResultado.accesoActivo !== null) orbitAccesoActivo = orbitResultado.accesoActivo;
          console.log('Orbit procesado:', JSON.stringify(orbitResultado));
        } else {
          console.log('Orbit no procesó el evento (fallback a comportamiento previo):', orbitResultado.motivo);
        }
      } catch (err) {
        console.error('Orbit error (se ignora, no bloquea el webhook):', err.message);
      }
    }

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
            ...(isMasterclass ? { PRODUCTO: 'masterclass' } : {})
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
        if (await reservarTareaOutboxSeguro(orbitTransaction, 'bienvenida_whatsapp')) {
          await programarBienvenidaMasterclass(telefonoLimpio, primerNombre, email);
        }
        await enviarCorreo1Seguro(email, primerNombre, orbitMasterclass, telefonoLimpio);
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
      updateBody.attributes.PRODUCTO = 'masterclass';
    }

    // Solo enviar la bienvenida de WhatsApp si nunca se le ha enviado antes a este contacto —
    // evita duplicados si por alguna razón el webhook se dispara más de una vez para la misma compra.
    const bienvenidaYaEnviada = contact.attributes?.BIENVENIDA_WA_ENVIADA === true;
    if (isMasterclass && !bienvenidaYaEnviada) {
      updateBody.attributes.BIENVENIDA_WA_ENVIADA = true;
    }

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
      // Idempotencia propia (correo1_estado en masterclass_compras) — seguro llamarlo aunque este
      // webhook sea "Compra completa" repitiendo lo que "Compra aprobada" ya disparó.
      await enviarCorreo1Seguro(email, primerNombre || contact.attributes?.FIRSTNAME || '', orbitMasterclass, telefonoLimpio || contact.attributes?.SMS || '');
    }

    if (isMasterclass && !bienvenidaYaEnviada && await reservarTareaOutboxSeguro(orbitTransaction, 'bienvenida_whatsapp')) {
      await programarBienvenidaMasterclass(
        telefonoLimpio || contact.attributes?.SMS || '',
        primerNombre || contact.attributes?.FIRSTNAME || '',
        email
      );
    } else if (isMasterclass) {
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

