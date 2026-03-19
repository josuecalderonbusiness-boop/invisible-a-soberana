// api/whatsapp.js — invisible-a-soberana (Vercel)
// Flujo: WhatsApp mensaje → buscar en Brevo por email → actualizar SMS → guardar en Sheets

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

  // ── POST desde Orbit: envío manual de mensaje ─────────────────────
  if (req.method === 'POST' && req.body?.to && req.body?.message) {
    const { to, message } = req.body;
    const sent = await sendWhatsApp(to, message);
    return res.status(sent ? 200 : 500).json({ ok: sent });
  }

  // ── POST: webhook entrante de Meta ────────────────────────────────
  if (req.method === 'POST' && req.body?.object === 'whatsapp_business_account') {
    try {
      const entry    = req.body.entry?.[0];
      const change   = entry?.changes?.[0];
      const value    = change?.value;
      const messages = value?.messages;

      if (!messages || messages.length === 0) {
        return res.status(200).json({ ok: true });
      }

      const msg      = messages[0];
      const from     = msg.from;           // número en formato internacional sin +
      const text     = msg.text?.body || '';
      const phone    = '+' + from;

      console.log(`Mensaje de ${phone}: ${text}`);

      // Detectar mensaje de bienvenida de compradora
      const esBienvenida =
        text.toLowerCase().includes('acabo de comprar') ||
        text.toLowerCase().includes('comunidad vip') ||
        text.toLowerCase().includes('código soberana');

      if (esBienvenida) {
        console.log('Compradora detectada:', phone);

        // 1. Buscar contacto en Brevo por teléfono (o por SMS si ya lo guardamos)
        //    Como no sabemos su email aquí, buscamos por SMS o creamos registro temporal
        const contacto = await buscarContactoBrevo(phone);

        if (contacto) {
          // 2. Actualizar campo SMS en Brevo
          await actualizarSMSBrevo(contacto.email, phone);

          // 3. Guardar en Google Sheets
          await guardarEnSheets({
            fecha:     new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
            nombre:    contacto.attributes?.FIRSTNAME || '',
            email:     contacto.email,
            whatsapp:  phone,
            perfil:    contacto.attributes?.QUIZ_PROFILE || '',
            lista:     contacto.listIds?.join(', ') || '',
            mensaje:   text.substring(0, 100)
          });

          // 4. Responder con enlace comunidad + regalo
          await sendWhatsApp(phone,
            `¡Hola${contacto.attributes?.FIRSTNAME ? ' ' + contacto.attributes.FIRSTNAME : ''}! 🎉\n\n` +
            `Tu compra está confirmada. Aquí tienes tu acceso:\n\n` +
            `👥 *Comunidad VIP:*\n` +
            `https://chat.whatsapp.com/BqxkKzCjlFj5RdX7MYOJi2\n\n` +
            `🎁 *Tu regalo:*\n` +
            `Revisa tu correo — ya te lo envié.\n\n` +
            `Nos vemos adentro. 🔑`
          );

        } else {
          // No encontramos el contacto — igual guardamos el teléfono y respondemos
          console.log('Contacto no encontrado en Brevo para:', phone);

          await guardarEnSheets({
            fecha:     new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
            nombre:    '',
            email:     'NO ENCONTRADO',
            whatsapp:  phone,
            perfil:    '',
            lista:     '',
            mensaje:   text.substring(0, 100)
          });

          await sendWhatsApp(phone,
            `¡Hola! 🎉 Confirmamos tu compra.\n\n` +
            `👥 *Comunidad VIP:*\n` +
            `https://chat.whatsapp.com/BqxkKzCjlFj5RdX7MYOJi2\n\n` +
            `🎁 Revisa tu correo para tu regalo.\n\n` +
            `Nos vemos adentro. 🔑`
          );
        }
      }

      return res.status(200).json({ ok: true });

    } catch (err) {
      console.error('Error webhook:', err);
      return res.status(200).json({ ok: true }); // Siempre 200 a Meta
    }
  }

  return res.status(200).json({ ok: true });
}


// ── FUNCIÓN: Buscar contacto en Brevo ────────────────────────────────
// Estrategia: busca por atributo SMS. Si no existe, busca contactos recientes
// de la lista de compradoras Workshop (lista 11) sin SMS.
async function buscarContactoBrevo(phone) {
  const BREVO_KEY = process.env.BREVO_KEY;

  try {
    // Primero intentar buscar por SMS exacto (si ya fue guardado antes)
    const searchRes = await fetch(
      `https://api.brevo.com/v3/contacts?limit=10&offset=0&sort=desc`,
      {
        headers: {
          'api-key': BREVO_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    // Buscar en lista 11 (compradoras Workshop) contacto sin SMS
    // que haya entrado recientemente (últimas 24h)
    const listaRes = await fetch(
      `https://api.brevo.com/v3/contacts/lists/11/contacts/import`,
      {
        headers: { 'api-key': BREVO_KEY }
      }
    );

    // Obtener últimos contactos de lista 11
    const contactosRes = await fetch(
      `https://api.brevo.com/v3/contacts?limit=50&listId=11&sort=desc`,
      {
        headers: { 'api-key': BREVO_KEY }
      }
    );

    if (!contactosRes.ok) {
      console.error('Error Brevo lista:', await contactosRes.text());
      return null;
    }

    const data = await contactosRes.json();
    const contactos = data.contacts || [];

    // Buscar el más reciente sin número de SMS
    const sinSMS = contactos.find(c =>
      !c.attributes?.SMS ||
      c.attributes?.SMS === '' ||
      c.attributes?.SMS === null
    );

    if (sinSMS) {
      console.log('Contacto sin SMS encontrado:', sinSMS.email);
      return sinSMS;
    }

    // Si todos tienen SMS, devolver el más reciente (puede estar actualizando)
    return contactos[0] || null;

  } catch (err) {
    console.error('Error buscando en Brevo:', err);
    return null;
  }
}


// ── FUNCIÓN: Actualizar SMS en Brevo ─────────────────────────────────
async function actualizarSMSBrevo(email, phone) {
  const BREVO_KEY = process.env.BREVO_KEY;

  try {
    const res = await fetch(
      `https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`,
      {
        method: 'PUT',
        headers: {
          'api-key': BREVO_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          attributes: {
            SMS: phone
          }
        })
      }
    );

    if (res.ok || res.status === 204) {
      console.log(`SMS actualizado en Brevo para ${email}: ${phone}`);
      return true;
    } else {
      const err = await res.text();
      console.error('Error actualizando SMS en Brevo:', err);
      return false;
    }
  } catch (err) {
    console.error('Error Brevo SMS:', err);
    return false;
  }
}


// ── FUNCIÓN: Guardar en Google Sheets ────────────────────────────────
async function guardarEnSheets(data) {
  const SHEETS_URL = process.env.SHEETS_WEBHOOK_URL;

  if (!SHEETS_URL) {
    console.log('SHEETS_WEBHOOK_URL no configurada — saltando Sheets');
    return false;
  }

  try {
    const res = await fetch(SHEETS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (res.ok) {
      console.log('Guardado en Sheets:', data.email);
      return true;
    } else {
      console.error('Error Sheets:', await res.text());
      return false;
    }
  } catch (err) {
    console.error('Error Sheets fetch:', err);
    return false;
  }
}


// ── FUNCIÓN: Enviar mensaje por WhatsApp ─────────────────────────────
async function sendWhatsApp(to, message) {
  const TOKEN    = process.env.WHATSAPP_TOKEN;
  const PHONE_ID = process.env.WHATSAPP_PHONE_ID;

  // Limpiar número
  const number = to.replace(/[^0-9]/g, '');

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
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
    if (data.messages?.[0]?.id) {
      console.log('WA enviado a', number);
      return true;
    } else {
      console.error('Error WA:', JSON.stringify(data));
      return false;
    }
  } catch (err) {
    console.error('Error sendWhatsApp:', err);
    return false;
  }
}
