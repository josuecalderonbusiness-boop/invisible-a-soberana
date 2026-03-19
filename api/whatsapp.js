// api/whatsapp.js — versión final
// Conserva toda la lógica del v3 original + agrega match por HOTMART_PHONE

export default async function handler(req, res) {

  // ── GET: verificación webhook Meta ──────────────────────────────
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      console.log('Webhook verificado OK');
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Forbidden' });
  }

  // ── POST desde Orbit: envío manual ──────────────────────────────
  if (req.method === 'POST' && req.body?.to && req.body?.message) {
    const sent = await sendWhatsApp(req.body.to, req.body.message);
    return res.status(sent ? 200 : 500).json({ ok: sent });
  }

  // ── POST: webhook entrante Meta ──────────────────────────────────
  if (req.method === 'POST' && req.body?.object === 'whatsapp_business_account') {
    try {
      const messages = req.body.entry?.[0]?.changes?.[0]?.value?.messages;
      if (!messages?.length) return res.status(200).json({ ok: true });

      const msg   = messages[0];
      const phone = '+' + msg.from; // número real desde el que escribe
      const text  = msg.text?.body || '';

      console.log(`=== Mensaje WA de ${phone}: "${text}" ===`);

      const esBienvenida =
        text.toLowerCase().includes('acabo de comprar') ||
        text.toLowerCase().includes('comunidad vip') ||
        text.toLowerCase().includes('soberana');

      if (!esBienvenida) {
        console.log('No es mensaje de bienvenida, ignorando');
        return res.status(200).json({ ok: true });
      }

      // PASO 1: Buscar en lista 11 por HOTMART_PHONE (número exacto de Hotmart)
      console.log('Buscando por HOTMART_PHONE en lista 11...');
      let contacto  = await buscarPorHotmartPhone(phone);
      let matchTipo = 'hotmart_phone';

      // PASO 2: Si no hay match por HOTMART_PHONE, buscar el más reciente sin SMS
      // (lógica original del v3 como fallback)
      if (!contacto) {
        console.log('Sin match por HOTMART_PHONE — buscando más reciente sin SMS...');
        contacto  = await buscarCompradoraSinSMS();
        matchTipo = 'reciente_sin_sms';
      }

      let nombre = '';
      let email  = '';
      let found  = false;

      if (contacto) {
        nombre = contacto.attributes?.FIRSTNAME || contacto.attributes?.VORNAME || '';
        email  = contacto.email;
        found  = true;
        console.log(`Compradora encontrada (${matchTipo}): ${email} (${nombre})`);

        const hotmartPhone = contacto.attributes?.HOTMART_PHONE || '';
        const numerosIguales = normalizar(hotmartPhone) === normalizar(phone);

        if (numerosIguales) {
          console.log('Números coinciden — confirmado');
          // Solo actualizar SMS si aún no lo tiene
          if (!contacto.attributes?.SMS) {
            await actualizarSMS(email, phone);
          }
        } else {
          // Números distintos — el número real de WA tiene prioridad
          console.log(`Números distintos — Hotmart: ${hotmartPhone} | WA real: ${phone}`);
          await actualizarSMS(email, phone);
        }

      } else {
        console.log('No se encontró compradora en lista 11');
        email = 'sin-match@soberana';
      }

      // PASO 3: Guardar en Sheets siempre
      await guardarEnSheets({
        fecha:    new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
        nombre:   nombre,
        email:    email,
        whatsapp: phone,
        perfil:   contacto?.attributes?.QUIZ_PROFILE || '',
        lista:    found ? '11' : 'sin-match',
        mensaje:  `match:${matchTipo} | ${text.substring(0, 80)}`
      });

      // PASO 4: Responder siempre
      const saludo = nombre ? ` ${nombre}` : '';
      await sendWhatsApp(phone,
        `¡Hola${saludo}! 🎉\n\n` +
        `Tu compra está confirmada. Aquí tienes tu acceso:\n\n` +
        `👥 *Comunidad VIP:*\n` +
        `https://chat.whatsapp.com/BqxkKzCjlFj5RdX7MYOJi2\n\n` +
        `🎁 *Tu regalo:*\n` +
        `Revisa tu correo — ya te lo envié.\n\n` +
        `Nos vemos adentro. 🔑`
      );

      return res.status(200).json({ ok: true, email, phone });

    } catch (err) {
      console.error('Error webhook:', err.message, err.stack);
      return res.status(200).json({ ok: true });
    }
  }

  return res.status(200).json({ ok: true });
}

// ── NUEVO: Buscar en lista 11 por HOTMART_PHONE ──────────────────
// Compara últimos 10 dígitos para tolerar diferencias de código de país
async function buscarPorHotmartPhone(phone) {
  try {
    const url = `https://api.brevo.com/v3/contacts?limit=50&listId=11&sort=desc`;
    console.log('Buscando por HOTMART_PHONE:', url);

    const res = await fetch(url, {
      headers: { 'api-key': process.env.BREVO_KEY }
    });

    const raw = await res.text();
    console.log(`Brevo status: ${res.status}`);

    if (!res.ok) {
      console.error('Error Brevo:', raw);
      return null;
    }

    const data     = JSON.parse(raw);
    const contactos = data.contacts || [];
    const phoneNorm = normalizar(phone);

    const match = contactos.find(c => {
      const hp  = normalizar(c.attributes?.HOTMART_PHONE || '');
      const sms = normalizar(c.attributes?.SMS || '');
      const coincide = (hp && hp === phoneNorm) || (sms && sms === phoneNorm);
      if (hp || sms) console.log(`  ${c.email} → HP:${hp} SMS:${sms} | buscado:${phoneNorm} → ${coincide}`);
      return coincide;
    });

    return match || null;
  } catch (err) {
    console.error('buscarPorHotmartPhone error:', err.message);
    return null;
  }
}

// ── ORIGINAL: Buscar compradora más reciente sin SMS (fallback) ───
async function buscarCompradoraSinSMS() {
  try {
    const url = `https://api.brevo.com/v3/contacts?limit=50&listId=11&sort=desc`;
    console.log('Buscando sin SMS:', url);

    const res = await fetch(url, {
      headers: {
        'api-key': process.env.BREVO_KEY,
        'Content-Type': 'application/json'
      }
    });

    const raw = await res.text();
    console.log(`Brevo status: ${res.status}`);
    console.log(`Brevo body: ${raw.substring(0, 500)}`);

    if (!res.ok) {
      console.error('Error Brevo:', raw);
      return null;
    }

    const data     = JSON.parse(raw);
    const contactos = data.contacts || [];
    console.log(`Contactos en lista 11: ${contactos.length}`);

    if (contactos.length === 0) return null;

    const sinSMS = contactos.find(c => {
      const sms   = c.attributes?.SMS;
      const sinNum = !sms || sms === '' || sms === null || sms === undefined;
      console.log(`  ${c.email} → SMS: "${sms}" → sinSMS: ${sinNum}`);
      return sinNum;
    });

    return sinSMS || null;

  } catch (err) {
    console.error('buscarCompradoraSinSMS error:', err.message);
    return null;
  }
}

// ── ORIGINAL: Actualizar SMS en Brevo ────────────────────────────
async function actualizarSMS(email, phone) {
  try {
    const res = await fetch(
      `https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`,
      {
        method: 'PUT',
        headers: {
          'api-key': process.env.BREVO_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ attributes: { SMS: phone } })
      }
    );
    const status = res.status;
    console.log(`PUT Brevo ${email} → status ${status}`);
    return status === 204 || status === 200;
  } catch (err) {
    console.error('actualizarSMS error:', err.message);
    return false;
  }
}

// ── ORIGINAL: Guardar en Google Sheets ───────────────────────────
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
    console.error('guardarEnSheets error:', err.message);
    return false;
  }
}

// ── ORIGINAL: Enviar WhatsApp ────────────────────────────────────
async function sendWhatsApp(to, message) {
  const number = to.replace(/[^0-9]/g, '');
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
          messaging_product: 'whatsapp',
          to: number,
          type: 'text',
          text: { body: message }
        })
      }
    );
    const data = await res.json();
    const ok   = !!data.messages?.[0]?.id;
    console.log(`WA → ${number}: ${ok ? '✓ enviado' : JSON.stringify(data)}`);
    return ok;
  } catch (err) {
    console.error('sendWhatsApp error:', err.message);
    return false;
  }
}

// ── NUEVO: Normalizar número para comparación ────────────────────
// Compara últimos 10 dígitos — tolera diferencias de código de país
function normalizar(tel) {
  return (tel || '').replace(/[^\d]/g, '').slice(-10);
}
