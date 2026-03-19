// api/whatsapp.js — invisible-a-soberana (Vercel) v3
// Flujo real: ella compra → Hotmart la agrega a Brevo lista 11 → 
// ella escribe WA → webhook busca el más reciente de lista 11 sin SMS → le asigna el número

export default async function handler(req, res) {

  // ── GET: verificación webhook Meta ────────────────────────────────
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      console.log('Webhook verificado OK');
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Forbidden' });
  }

  // ── POST desde Orbit: envío manual ────────────────────────────────
  if (req.method === 'POST' && req.body?.to && req.body?.message) {
    const sent = await sendWhatsApp(req.body.to, req.body.message);
    return res.status(sent ? 200 : 500).json({ ok: sent });
  }

  // ── POST: webhook entrante Meta ────────────────────────────────────
  if (req.method === 'POST' && req.body?.object === 'whatsapp_business_account') {
    try {
      const messages = req.body.entry?.[0]?.changes?.[0]?.value?.messages;
      if (!messages?.length) return res.status(200).json({ ok: true });

      const msg   = messages[0];
      const phone = '+' + msg.from;
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

      // PASO 1: Buscar en lista 11 el contacto más reciente SIN número
      console.log('Buscando compradoras en lista 11...');
      const contacto = await buscarCompradoraSinSMS();

      let nombre = '';
      let email  = '';
      let found  = false;

      if (contacto) {
        nombre = contacto.attributes?.FIRSTNAME || contacto.attributes?.VORNAME || '';
        email  = contacto.email;
        found  = true;
        console.log(`Compradora encontrada: ${email} (${nombre})`);

        // PASO 2: Actualizar su SMS en Brevo
        const updated = await actualizarSMS(email, phone);
        console.log(`SMS actualizado: ${updated}`);
      } else {
        console.log('No se encontró compradora sin SMS en lista 11');
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
        mensaje:  text.substring(0, 150)
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

// ── Buscar compradora más reciente de lista 11 sin SMS ────────────
async function buscarCompradoraSinSMS() {
  try {
    // Traer los últimos 50 contactos de lista 11
    const url = `https://api.brevo.com/v3/contacts?limit=50&listId=11&sort=desc`;
    console.log('Llamando Brevo:', url);

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

    const data = JSON.parse(raw);
    const contactos = data.contacts || [];
    console.log(`Contactos en lista 11: ${contactos.length}`);

    if (contactos.length === 0) return null;

    // Buscar el más reciente sin SMS
    const sinSMS = contactos.find(c => {
      const sms = c.attributes?.SMS;
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

// ── Actualizar campo SMS en Brevo ─────────────────────────────────
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
        body: JSON.stringify({
          attributes: { SMS: phone }
        })
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

// ── Guardar en Google Sheets ──────────────────────────────────────
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

// ── Enviar mensaje WhatsApp ───────────────────────────────────────
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
    const ok = !!data.messages?.[0]?.id;
    console.log(`WA → ${number}: ${ok ? '✓ enviado' : JSON.stringify(data)}`);
    return ok;
  } catch (err) {
    console.error('sendWhatsApp error:', err.message);
    return false;
  }
}
