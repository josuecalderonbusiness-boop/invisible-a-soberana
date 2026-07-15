// api/hotmart-webhook.js — versión final
// Mantiene toda la lógica original de listas + agrega teléfono a Brevo + guarda en Sheets

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

    const telefono =
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
      await guardarEnFirestore(email, primerNombre, tipoContacto);

      // Contacto recién creado → nunca se le pudo haber enviado la bienvenida antes.
      if (isMasterclass) {
        await enviarBienvenidaWhatsApp(telefonoLimpio, primerNombre, email);
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
    await guardarEnFirestore(email, primerNombre || contact.attributes?.FIRSTNAME || '', tipoContacto);

    if (isMasterclass && !bienvenidaYaEnviada) {
      await enviarBienvenidaWhatsApp(
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

// ── Bienvenida proactiva de WhatsApp (plantilla de Meta) ──────────
// El webhook es quien decide y dispara — no depende de que la clienta llegue a la página de
// Gracias ni escriba primero (ver entry-product-system/SKILL.md → "El Webhook como orquestador").
// Nombre funcional, reutilizable para cualquier producto de entrada futuro en estado Evergreen/Replay
// (ver regla de nomenclatura en la misma Skill) — nunca renombrar por producto.
const WHATSAPP_TEMPLATE_BIENVENIDA = 'bienvenida_acceso_cs';

async function enviarBienvenidaWhatsApp(phone, nombre, email) {
  if (!phone) {
    console.log(`Sin teléfono para ${email} — no se puede enviar la bienvenida de WhatsApp`);
    return;
  }
  const number = String(phone).replace(/[^0-9]/g, '');
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp', to: number, type: 'template',
          template: {
            name: WHATSAPP_TEMPLATE_BIENVENIDA, language: { code: 'es_MX' },
            components: [{
              type: 'body',
              parameters: [{ type: 'text', parameter_name: 'firstname', text: nombre || 'amiga' }]
            }]
          }
        })
      }
    );
    const data = await res.json();
    if (data.messages?.[0]?.id) {
      console.log(`Plantilla ${WHATSAPP_TEMPLATE_BIENVENIDA} enviada a ${number} (${email})`);
    } else {
      console.error(`Fallo enviando ${WHATSAPP_TEMPLATE_BIENVENIDA} a ${number}:`, JSON.stringify(data));
    }
  } catch (err) {
    console.error('Error enviando bienvenida de WhatsApp:', err.message);
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
async function guardarEnFirestore(email, nombre, tipo) {
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
          fecha: { stringValue: new Date().toISOString() }
        }
      })
    });
    console.log('Firestore workbook_acceso actualizado:', email);
  } catch(err) {
    console.error('Error Firestore:', err.message);
  }
}

function now() {
  return new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
}

