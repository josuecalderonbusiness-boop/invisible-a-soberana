// api/whatsapp.js — invisible-a-soberana (Vercel)
// Flujo: mensaje WA → guardar número en Brevo (buscar por SMS o crear) → Sheets → responder

export default async function handler(req, res) {

  // ── GET: verificación del webhook de Meta ──────────────────────────
  if (req.method === 'GET') {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      console.log('Webhook verificado');
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Forbidden' });
  }

  // ── POST desde Orbit: envío manual ────────────────────────────────
  if (req.method === 'POST' && req.body?.to && req.body?.message) {
    const { to, message } = req.body;
    const sent = await sendWhatsApp(to, message);
    return res.status(sent ? 200 : 500).json({ ok: sent });
  }

  // ── POST: webhook entrante de Meta ────────────────────────────────
  if (req.method === 'POST' && req.body?.object === 'whatsapp_business_account') {
    try {
      const messages = req.body.entry?.[0]?.changes?.[0]?.value?.messages;
      if (!messages || messages.length === 0) {
        return res.status(200).json({ ok: true });
      }

      const msg   = messages[0];
      const from  = msg.from; // sin +
      const text  = msg.text?.body || '';
      const phone = '+' + from;

      console.log(`WA de ${phone}: ${text}`);

      const esBienvenida =
        text.toLowerCase().includes('acabo de comprar') ||
        text.toLowerCase().includes('comunidad vip') ||
        text.toLowerCase().includes('soberana');

      if (!esBienvenida) {
        return res.status(200).json({ ok: true });
      }

      console.log('Compradora detectada:', phone);

      // 1. Buscar contacto en Brevo por SMS
      const contacto = await buscarPorSMS(phone);

      let nombre = '';
      let email  = '';

      if (contacto) {
        // Ya existe — actualizar SMS por si acaso
        nombre = contacto.attributes?.FIRSTNAME || '';
        email  = contacto.email;
        await actualizarSMS(email, phone);
        console.log('Contacto existente:', email);
      } else {
        // No existe — buscar el más reciente de lista 11 sin SMS
        const reciente = await buscarRecienteSinSMS();
        if (reciente) {
          nombre = reciente.attributes?.FIRSTNAME || '';
          email  = reciente.email;
          await actualizarSMS(email, phone);
          console.log('SMS asignado a contacto reciente:', email);
        } else {
          // Último recurso: crear contacto nuevo solo con el número
          email = phone + '@whatsapp.temp';
          await crearContactoWA(phone);
          console.log('Contacto temporal creado para:', phone);
        }
      }

      // 2. Guardar en Sheets
      await guardarEnSheets({
        fecha:    new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
        nombre:   nombre,
        email:    email,
        whatsapp: phone,
        perfil:   contacto?.attributes?.QUIZ_PROFILE || '',
        lista:    '11',
        mensaje:  text.substring(0, 100)
      });

      // 3. Responder con acceso
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

      return res.status(200).json({ ok: true });

    } catch (err) {
      console.error('Error webhook:', err);
      return res.status(200).json({ ok: true });
    }
  }

  return res.status(200).json({ ok: true });
}

// ── Buscar contacto en Brevo por atributo SMS ─────────────────────
async function buscarPorSMS(phone) {
  try {
    const res = await fetch(
      `https://api.brevo.com/v3/contacts/filter?filters={"SMS":"${phone}"}`,
      { headers: { 'api-key': process.env.BREVO_KEY } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.contacts?.[0] || null;
  } catch (e) {
    console.error('buscarPorSMS error:', e);
    return null;
  }
}

// ── Buscar el contacto más reciente de lista 11 sin SMS ───────────
async function buscarRecienteSinSMS() {
  try {
    const res = await fetch(
      `https://api.brevo.com/v3/contacts?limit=20&listId=11&sort=desc`,
      { headers: { 'api-key': process.env.BREVO_KEY } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const contactos = data.contacts || [];
    return contactos.find(c =>
      !c.attributes?.SMS || c.attributes.SMS === '' || c.attributes.SMS === null
    ) || null;
  } catch (e) {
    console.error('buscarRecienteSinSMS error:', e);
    return null;
  }
}

// ── Actualizar SMS en Brevo ───────────────────────────────────────
async function actualizarSMS(email, phone) {
  try {
    const res = await fetch(
      `https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`,
      {
        method: 'PUT',
        headers: { 'api-key': process.env.BREVO_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ attributes: { SMS: phone } })
      }
    );
    console.log(`SMS actualizado para ${email}: ${res.status}`);
    return res.ok || res.status === 204;
  } catch (e) {
    console.error('actualizarSMS error:', e);
    return false;
  }
}

// ── Crear contacto temporal cuando no hay match en Brevo ─────────
async function crearContactoWA(phone) {
  try {
    const res = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: phone.replace('+', '') + '@whatsapp.soberana',
        attributes: { SMS: phone, FIRSTNAME: 'Soberana' },
        listIds: [11],
        updateEnabled: true
      })
    });
    const data = await res.json();
    console.log('Contacto WA creado:', data.id || data);
    return data;
  } catch (e) {
    console.error('crearContactoWA error:', e);
    return null;
  }
}

// ── Guardar en Google Sheets ─────────────────────────────────────
async function guardarEnSheets(data) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    console.log('Sheets:', res.ok ? 'OK' : await res.text());
    return res.ok;
  } catch (e) {
    console.error('guardarEnSheets error:', e);
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
    console.log(`WA a ${number}: ${ok ? 'enviado' : JSON.stringify(data)}`);
    return ok;
  } catch (e) {
    console.error('sendWhatsApp error:', e);
    return false;
  }
}
