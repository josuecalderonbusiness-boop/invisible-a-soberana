// api/hotmart-webhook.js — versión final
// Mantiene toda la lógica original de listas + agrega teléfono a Brevo + guarda en Sheets

export default async function handler(req, res) {
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
    const isCompra7D            = String(productId) === SOBERANA_7D_PRODUCT_ID;
    const targetList            = isCompra7D ? 14 : 11;
    const primerNombre          = nombre.split(' ')[0] || '';
    const telefonoLimpio        = limpiarTelefono(telefono);

    console.log(`Tipo: ${isCompra7D ? 'Soberana 7D' : 'Workshop'} → Lista #${targetList}`);

    // ── Buscar contacto en Brevo ─────────────────────────────────
    const searchRes = await fetch(
      `https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`,
      { method: 'GET', headers: { 'api-key': BREVO_KEY } }
    );

    if (!searchRes.ok) {
      // Contacto no existe — crear con todos los datos
      console.log('Contacto no existe — creando:', email);
      await fetch('https://api.brevo.com/v3/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
        body: JSON.stringify({
          email,
          attributes: {
            FIRSTNAME:     primerNombre,
            SMS:           telefonoLimpio,
            HOTMART_PHONE: telefonoLimpio
          },
          listIds: [targetList],
          updateEnabled: true
        })
      });

      await guardarEnSheets({
        fecha:    now(),
        nombre:   primerNombre,
        email:    email,
        whatsapp: telefonoLimpio,
        perfil:   isCompra7D ? 'COMPRADORA_7D' : 'COMPRADORA_WORKSHOP',
        lista:    String(targetList),
        mensaje:  'Contacto nuevo creado desde Hotmart'
      });

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
      perfil:   isCompra7D ? 'COMPRADORA_7D' : 'COMPRADORA_WORKSHOP',
      lista:    String(targetList),
      mensaje:  `Listas removidas: ${listsToRemove.join(',') || 'ninguna'}`
    });

    return res.status(200).json({
      received:        true,
      action:          isCompra7D ? 'moved_to_compradoras_7d' : 'moved_to_compradoras_workshop',
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
function now() {
  return new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
}
