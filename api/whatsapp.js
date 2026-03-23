// api/whatsapp.js — versión con plantilla bienvenida_pacto_soberana

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
      const phone = '+' + msg.from;
      const text  = msg.text?.body || '';

      // Ignorar respuestas a botones de plantilla (evita loops)
      if (msg.type === 'button') {
        console.log(`Botón presionado por ${phone}: "${msg.button?.text}"`);
        await manejarRespuestaBoton(phone, msg.button?.text);
        return res.status(200).json({ ok: true });
      }

      console.log(`=== Mensaje WA de ${phone}: "${text}" ===`);

      const esBienvenida =
        text.toLowerCase().includes('acabo de comprar') ||
        text.toLowerCase().includes('comunidad vip') ||
        text.toLowerCase().includes('soberana');

      if (!esBienvenida) {
        console.log('No es mensaje de bienvenida, ignorando');
        return res.status(200).json({ ok: true });
      }

      // PASO 1: Buscar en lista 11 por HOTMART_PHONE
      console.log('Buscando por HOTMART_PHONE en lista 11...');
      let contacto  = await buscarPorHotmartPhone(phone);
      let matchTipo = 'hotmart_phone';

      // PASO 2: Fallback — buscar más reciente sin SMS
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
          if (!contacto.attributes?.SMS) {
            await actualizarSMS(email, phone);
          }
        } else {
          console.log(`Números distintos — Hotmart: ${hotmartPhone} | WA real: ${phone}`);
          await actualizarSMS(email, phone);
        }

      } else {
        console.log('No se encontró compradora en lista 11');
        email = 'sin-match@soberana';
      }

      // PASO 3: Guardar en Sheets
      await guardarEnSheets({
        fecha:    new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
        nombre:   nombre,
        email:    email,
        whatsapp: phone,
        perfil:   contacto?.attributes?.QUIZ_PROFILE || '',
        lista:    found ? '11' : 'sin-match',
        mensaje:  `match:${matchTipo} | ${text.substring(0, 80)}`
      });

      // PASO 4: Enviar plantilla de bienvenida con su nombre
      const nombreFinal = nombre || 'amiga';
      await sendTemplate(phone, nombreFinal);

      return res.status(200).json({ ok: true, email, phone });

    } catch (err) {
      console.error('Error webhook:', err.message, err.stack);
      return res.status(200).json({ ok: true });
    }
  }

  return res.status(200).json({ ok: true });
}

// ── Manejar respuesta a botones de plantilla ─────────────────────
async function manejarRespuestaBoton(phone, boton) {
  if (!boton) return;

  const textoBoton = boton.toLowerCase();

  if (textoBoton.includes('ya pude entrar') || textoBoton.includes('sí')) {
    // Ella pudo acceder — enviar herramienta
    await sendWhatsApp(phone,
      `Perfecto. 🎯\n\n` +
      `Aquí tienes tu herramienta de trabajo. Es donde vas a aplicar cada palanca del Workshop a tu ritmo:\n\n` +
      `👇 https://soberana-app.josuecalderon.lat\n\n` +
      `Descárgala e instálala antes de empezar el Workshop.`
    );
  } else if (textoBoton.includes('no he podido') || textoBoton.includes('no')) {
    // Ella no pudo acceder — ayudar
    await sendWhatsApp(phone,
      `Tranquila. 🙏\n\n` +
      `Revisa estas tres cosas:\n\n` +
      `1️⃣ Busca en *spam* o *promociones* un correo de Hotmart\n` +
      `2️⃣ El correo viene de noreply@hotmart.com\n` +
      `3️⃣ Si no aparece, respóndeme con tu correo y te reenvío el acceso manually`
    );
  }
}

// ── Enviar plantilla aprobada por Meta ───────────────────────────
async function sendTemplate(to, nombre) {
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
          type: 'template',
          template: {
            name: 'bienvenida_pacto_soberana',
            language: { code: 'es_MX' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: nombre }
                ]
              }
            ]
          }
        })
      }
    );
    const data = await res.json();
    const ok = !!data.messages?.[0]?.id;
    console.log(`Template → ${number}: ${ok ? '✓ enviado' : JSON.stringify(data)}`);
    return ok;
  } catch (err) {
    console.error('sendTemplate error:', err.message);
    return false;
  }
}

// ── Buscar en lista 11 por HOTMART_PHONE ─────────────────────────
async function buscarPorHotmartPhone(phone) {
  try {
    const url = `https://api.brevo.com/v3/contacts?limit=50&listId=11&sort=desc`;
    const res = await fetch(url, {
      headers: { 'api-key': process.env.BREVO_KEY }
    });
    const raw = await res.text();
    if (!res.ok) { console.error('Error Brevo:', raw); return null; }
    const data      = JSON.parse(raw);
    const contactos = data.contacts || [];
    const phoneNorm = normalizar(phone);
    const match = contactos.find(c => {
      const hp  = normalizar(c.attributes?.HOTMART_PHONE || '');
      const sms = normalizar(c.attributes?.SMS || '');
      return (hp && hp === phoneNorm) || (sms && sms === phoneNorm);
    });
    return match || null;
  } catch (err) {
    console.error('buscarPorHotmartPhone error:', err.message);
    return null;
  }
}

// ── Buscar compradora más reciente sin SMS (fallback) ────────────
async function buscarCompradoraSinSMS() {
  try {
    const url = `https://api.brevo.com/v3/contacts?limit=50&listId=11&sort=desc`;
    const res = await fetch(url, {
      headers: { 'api-key': process.env.BREVO_KEY, 'Content-Type': 'application/json' }
    });
    const raw = await res.text();
    if (!res.ok) { console.error('Error Brevo:', raw); return null; }
    const data      = JSON.parse(raw);
    const contactos = data.contacts || [];
    if (contactos.length === 0) return null;
    const sinSMS = contactos.find(c => {
      const sms = c.attributes?.SMS;
      return !sms || sms === '' || sms === null || sms === undefined;
    });
    return sinSMS || null;
  } catch (err) {
    console.error('buscarCompradoraSinSMS error:', err.message);
    return null;
  }
}

// ── Actualizar SMS en Brevo ──────────────────────────────────────
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
    console.log(`PUT Brevo ${email} → status ${res.status}`);
    return res.status === 204 || res.status === 200;
  } catch (err) {
    console.error('actualizarSMS error:', err.message);
    return false;
  }
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
    console.error('guardarEnSheets error:', err.message);
    return false;
  }
}

// ── Enviar WhatsApp texto libre ──────────────────────────────────
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

// ── Normalizar número ────────────────────────────────────────────
function normalizar(tel) {
  return (tel || '').replace(/[^\d]/g, '').slice(-10);
}
