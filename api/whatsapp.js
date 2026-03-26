// api/whatsapp.js — Con día 2 integrado

// Media IDs de audios subidos a Meta
// REEMPLAZAR cuando tengas los audios grabados y subidos
const AUDIO_DIA2_TERMINO = '1620415032329794'; // Audio "Ya lo terminé"
const AUDIO_DIA2_NO_VIO  = '2362093030941177';  // Audio "Aún no lo veo"

// Día 4 — Videos respuesta (subir a Meta y reemplazar IDs)
const VIDEO_DIA4_A = '1507744617738426'; // Video A — para quien contó
const VIDEO_DIA4_B = '976614471691735'; // Video B — para quien no contó

export default async function handler(req, res) {

  // ── GET: verificación webhook Meta ──────────────────────────────
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Forbidden' });
  }

  // ── POST: trigger programado desde Apps Script ───────────────────
  if (req.method === 'POST' && req.body?.trigger === true) {
    const { phone, paso, nombre } = req.body;
    console.log(`Trigger: phone=${phone} paso=${paso}`);
    await ejecutarPaso(phone, paso, nombre || '');
    return res.status(200).json({ ok: true });
  }

  // ── POST desde Orbit: envío manual ──────────────────────────────
  if (req.method === 'POST' && req.body?.to && req.body?.message) {
    const sent = await sendWhatsApp(req.body.to, req.body.message);
    return res.status(sent ? 200 : 500).json({ ok: sent });
  }

  // ── POST: webhook entrante Meta ──────────────────────────────────
  if (req.method === 'POST' && req.body?.object === 'whatsapp_business_account') {
    const entry    = req.body.entry?.[0]?.changes?.[0]?.value;
    const messages = entry?.messages;
    if (!messages?.length) return res.status(200).json({ ok: true });

    const msg   = messages[0];
    const msgId = msg.id || '';

    if (msgId) {
      const duplicado = await verificarYMarcar(msgId);
      if (duplicado) {
        console.log(`Duplicado ignorado: ${msgId}`);
        return res.status(200).json({ ok: true });
      }
    }

    await procesarMensaje(msg);
    return res.status(200).json({ ok: true });
  }

  return res.status(200).json({ ok: true });
}

// ════════════════════════════════════════════════════════════════
// ANTI-DUPLICADO
// ════════════════════════════════════════════════════════════════

async function verificarYMarcar(msgId) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return false;
  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 2000);
    const res  = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ accion: 'verificar_mensaje', msgId }),
      signal:  controller.signal
    });
    clearTimeout(timeout);
    const data = await res.json();
    return data.duplicado === true;
  } catch (err) {
    console.log('verificarYMarcar timeout — procesando igual');
    return false;
  }
}

// ════════════════════════════════════════════════════════════════
// PROCESAMIENTO PRINCIPAL
// ════════════════════════════════════════════════════════════════

async function procesarMensaje(msg) {
  const phone = '+' + msg.from;
  const text  = (msg.text?.body || '').toLowerCase().trim();
  const tipo  = msg.type;

  console.log(`=== Mensaje WA de ${phone} [${tipo}]: "${text}" ===`);

  if (tipo === 'interactive') {
    const btnId = msg.interactive?.button_reply?.id || '';
    console.log(`Botón interactivo: id=${btnId}`);
    await manejarBotonInteractivo(phone, btnId);
    return;
  }

  if (tipo === 'button') {
    const btnTx = msg.button?.text || '';
    console.log(`Botón plantilla: "${btnTx}"`);
    await manejarBotonPlantilla(phone, btnTx);
    return;
  }

  // Detectar si está en estado esperando_dia4
  const estado = await obtenerEstado(phone);
  if (estado === 'esperando_dia4') {
    console.log('→ Ella está contando después del día 4');
    await borrarEstado(phone);
    const contacto = await buscarEnSheetsPorTelefono(phone);
    const nombre   = contacto?.nombre || 'amiga';
    await sendWhatsApp(phone, `Ok, escúchame esto 👇 ${nombre}`);
    if (VIDEO_DIA4_A !== 'PENDIENTE_VIDEO_DIA4_A') {
      await sendVideo(phone, VIDEO_DIA4_A);
    } else {
      console.log('Video día 4 A pendiente de subir a Meta');
    }
    return;
  }

  // Detectar si ella escribió después de ver el workshop
  // (mensaje libre después del día 0)
  const esRespuestaWorkshop =
    text.includes('lo vi') ||
    text.includes('lo termine') ||
    text.includes('lo terminé') ||
    text.includes('ya lo vi') ||
    text.includes('termin') ||
    text.includes('listo') ||
    text.includes('list') ||
    text.includes('increíble') ||
    text.includes('increible') ||
    text.includes('wow') ||
    text.includes('impresionante') ||
    text.includes('genial') ||
    text.includes('excelente') ||
    text.includes('buenísimo') ||
    text.includes('me gustó') ||
    text.includes('me gusto');

  if (esRespuestaWorkshop) {
    console.log('→ Ella terminó el workshop y escribió');
    const contacto = await buscarEnSheetsPorTelefono(phone);
    const nombre   = contacto?.nombre || '';
    // Cancelar trigger día 2 versión B y enviar versión A inmediato
    await cancelarTrigger(phone, 'dia2_no_vio');
    await ejecutarPaso(phone, 'dia2_termino', nombre);
    return;
  }

  // Mensaje de bienvenida
  const esBienvenida =
    text.includes('acabo de comprar') ||
    text.includes('comunidad vip') ||
    text.includes('soberana');

  if (esBienvenida) {
    const contacto = await buscarEnSheetsPorTelefono(phone);
    const nombre   = contacto?.nombre || 'amiga';
    const email    = contacto?.email  || 'sin-match@soberana';
    console.log(`Contacto: ${email} (${nombre})`);
    await sendTemplate(phone, nombre);
    return;
  }

  console.log('Mensaje no reconocido — enviando respuesta genérica');
  await sendWhatsApp(phone,
    `Recibí tu mensaje. 🙏\n\n` +
    `Sigue pendiente — en los próximos días te escribo de nuevo.`
  );
}

// ════════════════════════════════════════════════════════════════
// LÓGICA DE BOTONES
// ════════════════════════════════════════════════════════════════

async function manejarBotonPlantilla(phone, boton) {
  const b = boton.toLowerCase();
  console.log(`Procesando botón plantilla: "${b}"`);

  if (b.includes('pude') || b.includes('ya pude')) {
    await sendUrlButton(phone,
      `Tu herramienta de trabajo ya está lista. 🛠️\n\nAquí vas a registrar tus respuestas del Workshop, activar tus recordatorios y aplicar cada palanca a tu ritmo.\n\n👇 Descárgala antes de empezar.`,
      'Ver herramienta', 'https://soberana-app.josuecalderon.lat'
    );
    await sendUrlButton(phone,
      `Únete también a la comunidad privada.\n\nAhí publico perspectiva masculina directa, casos reales y cosas que no digo en ningún otro lado.\n\nSolo para compradoras. 👇`,
      'Unirme ahora', 'https://chat.whatsapp.com/BqxkKzCjlFj5RdX7MYOJi2'
    );
    await programarTrigger(phone, 'confirmacion_comunidad', 1, ''); // PRUEBA: 1 min (producción: 3)
  }

  else if (b.includes('ya lo termin') || b.includes('termin')) {
    const contacto = await buscarEnSheetsPorTelefono(phone);
    const nombre   = contacto?.nombre || '';
    await cancelarTrigger(phone, 'dia2_no_vio');
    await ejecutarPaso(phone, 'dia2_termino', nombre);
  }

  else if (b.includes('aun no') || b.includes('aún no')) {
    const contacto = await buscarEnSheetsPorTelefono(phone);
    const nombre   = contacto?.nombre || '';
    await ejecutarPaso(phone, 'dia2_no_vio_confirmado', nombre);
  }

  else if (b.includes('quiero contarte') || b.includes('si, quiero') || b.includes('sí, quiero')) {
    const contacto = await buscarEnSheetsPorTelefono(phone);
    const nombre   = contacto?.nombre || '';
    await guardarEstado(phone, 'esperando_dia4');
    await sendWhatsApp(phone, `Estoy aquí.\n\nCuando quieras — escríbeme lo que notaste. No hay prisa. 👇`);
  }

  else if (b.includes('te cuento en otra') || b.includes('otra ocasion') || b.includes('otra ocasión')) {
    const contacto = await buscarEnSheetsPorTelefono(phone);
    const nombre   = contacto?.nombre || '';
    const n = nombre || 'amiga';
    await sendWhatsApp(phone, `Entiendo, ${n}. Escucha esto 👇`);
    if (VIDEO_DIA4_B !== 'PENDIENTE_VIDEO_DIA4_B') {
      await sendVideo(phone, VIDEO_DIA4_B);
    }
  }

  else if (b.includes('podido') || b.includes('no he')) {
    await sendWhatsApp(phone,
      `Tranquila. Lo resolvemos ahora. 🙏\n\n1️⃣ Busca en *spam* o *promociones* un correo de Hotmart\n\n2️⃣ El correo viene de noreply@hotmart.com\n\n3️⃣ Si no aparece — respóndeme aquí con tu correo y te reenvío el acceso manualmente.`
    );
  }
}

async function manejarBotonInteractivo(phone, btnId) {
  const contacto = await buscarEnSheetsPorTelefono(phone);
  const nombre   = contacto?.nombre || '';

  if (btnId === 'comunidad_si') {
    await sendButtons(phone,
      `Ya tienes todo lo que necesitas. 🎯\n\nAhora solo falta una cosa: ver el Workshop completo. Sin saltar partes.\n\nHay un momento en el segundo módulo que lo cambia todo. Cuando llegues ahí — vas a saber exactamente de qué hablo.\n\n¿Cuándo vas a verlo?`,
      [
        { id: 'workshop_hoy',    title: '🔥 Hoy mismo' },
        { id: 'workshop_semana', title: '📅 Esta semana' },
        { id: 'workshop_nose',   title: '🤔 Aún no sé' }
      ]
    );
  }

  else if (btnId === 'comunidad_no') {
    await sendUrlButton(phone,
      `Toca el enlace y únete antes de empezar el Workshop.\n\nLa comunidad es parte de tu acceso.`,
      'Unirme ahora', 'https://chat.whatsapp.com/BqxkKzCjlFj5RdX7MYOJi2'
    );
    await programarTrigger(phone, 'confirmacion_comunidad', 1, nombre); // PRUEBA: 1 min (producción: 3)
  }

  else if (btnId === 'workshop_hoy') {
    // Enviar mensaje con botón interactivo
    await sendButtons(phone,
      `Perfecto. 💪\n\nCuando termines el Workshop — presiona el botón de abajo.\n\nNos vemos adentro.`,
      [
        { id: 'workshop_terminado', title: '✅ Terminé el Workshop' }
      ]
    );
    // Trigger día 2 en 48h — si no presiona el botón
    await programarTrigger(phone, 'dia2_no_vio', 2, nombre); // PRUEBA: 2 min (producción: 2880)
  }

  else if (btnId === 'workshop_terminado') {
    // Ella terminó el workshop — programar día 4 primero
    await programarTrigger(phone, 'dia4_reflexion', 5, nombre); // PRUEBA: 5 min (producción: 5760)
    const n = nombre || 'amiga';
    await sendWhatsApp(phone, `Muy bien ${n}, te diré algo 👇`);
    if (AUDIO_DIA2_TERMINO !== 'PENDIENTE_MEDIA_ID_TERMINO') {
      await sendAudio(phone, AUDIO_DIA2_TERMINO);
    }
  }

  else if (btnId === 'workshop_semana') {
    await sendWhatsApp(phone, `Bien. Te escribo en unos días. 📅\n\nCuando lo veas — escríbeme.`);
    await programarTrigger(phone, 'dia2_no_vio', 2, nombre); // PRUEBA: 2 min (producción: 2880)
  }

  else if (btnId === 'workshop_nose') {
    await sendWhatsApp(phone, `Sin problema. Aquí estaré. 🙏\n\nCuando estés lista — el Workshop te espera.`);
    await programarTrigger(phone, 'dia2_no_vio', 2, nombre); // PRUEBA: 2 min (producción: 2880)
  }

  // Botones del día 4
  else if (btnId === 'dia4_si_cuento') {
    // Ella quiere contar — guardar estado y responder
    await guardarEstado(phone, 'esperando_dia4');
    await sendWhatsApp(phone, `Estoy aquí.\n\nCuando quieras — escríbeme lo que notaste. No hay prisa. 👇`);
  }

  else if (btnId === 'dia4_otra_ocasion') {
    // Ella no quiere contar ahora — enviar video B directamente
    const n = nombre || 'amiga';
    await sendWhatsApp(phone, `Entiendo, ${n}. Escucha esto 👇`);
    if (VIDEO_DIA4_B !== 'PENDIENTE_VIDEO_DIA4_B') {
      await sendVideo(phone, VIDEO_DIA4_B);
    } else {
      console.log('Video día 4 B pendiente de subir a Meta');
    }
  }

  // Botones del día 2 plantilla
  else if (btnId === 'dia2_termino') {
    // Ella confirmó que terminó el workshop desde la plantilla
    await ejecutarPaso(phone, 'dia2_termino', nombre);
  }

  else if (btnId === 'dia2_no_vio') {
    // Ella confirmó que aún no lo vio desde la plantilla
    await ejecutarPaso(phone, 'dia2_no_vio_confirmado', nombre);
  }
}

// ════════════════════════════════════════════════════════════════
// PASOS PROGRAMADOS
// ════════════════════════════════════════════════════════════════

async function ejecutarPaso(phone, paso, nombre) {
  console.log(`Ejecutando paso: ${paso} para ${phone} (${nombre})`);

  if (paso === 'confirmacion_comunidad') {
    await sendButtons(phone,
      '¿Lograste unirte a la comunidad?',
      [
        { id: 'comunidad_si', title: '✅ Ya estoy dentro' },
        { id: 'comunidad_no', title: '⏳ Aún no' }
      ]
    );
  }

  else if (paso === 'dia2_termino') {
    // Programar día 4 PRIMERO antes de enviar audio
    await programarTrigger(phone, 'dia4_reflexion', 5, nombre); // PRUEBA: 5 min (producción: 5760)
    // Luego enviar audio
    const n = nombre || 'amiga';
    await sendWhatsApp(phone, `Muy bien ${n}, te diré algo 👇`);
    if (AUDIO_DIA2_TERMINO !== 'PENDIENTE_MEDIA_ID_TERMINO') {
      await sendAudio(phone, AUDIO_DIA2_TERMINO);
    } else {
      console.log('Audio día 2 termino pendiente de subir a Meta');
    }
  }

  else if (paso === 'dia2_no_vio') {
    // Programar día 4 PRIMERO
    await programarTrigger(phone, 'dia4_reflexion', 5, nombre); // PRUEBA: 5 min (producción: 5760)
    const n = nombre || 'amiga';
    await sendTemplateDia2(phone, n);
  }

  else if (paso === 'dia4_reflexion') {
    // Enviar plantilla día 4 con botones
    await sendTemplateDia4(phone, nombre || 'amiga');
  }

  else if (paso === 'dia2_no_vio_confirmado') {
    // Programar día 4 PRIMERO
    await programarTrigger(phone, 'dia4_reflexion', 5, nombre); // PRUEBA: 5 min (producción: 5760)
    const n = nombre || 'amiga';
    await sendWhatsApp(phone, `Entonces ${n}, hay algo que debes escuchar 👇`);
    if (AUDIO_DIA2_NO_VIO !== 'PENDIENTE_MEDIA_ID_NO_VIO') {
      await sendAudio(phone, AUDIO_DIA2_NO_VIO);
    } else {
      console.log('Audio día 2 no vio pendiente de subir a Meta');
    }
  }
}

// ════════════════════════════════════════════════════════════════
// SHEETS Y TRIGGERS
// ════════════════════════════════════════════════════════════════

async function buscarEnSheetsPorTelefono(phone) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return null;
  try {
    const tel = phone.replace(/[^0-9]/g, '').slice(-10);
    const res = await fetch(`${url}?accion=buscar_por_telefono&telefono=${tel}`);
    const data = await res.json();
    return data.ok ? data : null;
  } catch (err) { return null; }
}

async function programarTrigger(phone, paso, minutos, nombre) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion:  'programar_trigger',
        phone:   phone,
        paso:    paso,
        minutos: minutos,
        nombre:  nombre,
        webhook: 'https://invisible-a-soberana.josuecalderon.lat/api/whatsapp'
      })
    });
    const data = await res.json();
    console.log(`Trigger (${paso} en ${minutos}min):`, data.ok ? 'OK' : JSON.stringify(data));
  } catch (err) {
    console.error('programarTrigger error:', err.message);
  }
}

async function cancelarTrigger(phone, paso) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'cancelar_trigger',
        phone:  phone,
        paso:   paso
      })
    });
    console.log(`Trigger cancelado: ${paso} para ${phone}`);
  } catch (err) {
    console.error('cancelarTrigger error:', err.message);
  }
}

// ════════════════════════════════════════════════════════════════
// FUNCIONES DE ENVÍO
// ════════════════════════════════════════════════════════════════

const WA_BASE = () => `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
const WA_HDR  = () => ({
  'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
  'Content-Type':  'application/json'
});

async function sendTemplate(to, nombre) {
  const number = to.replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'template',
      template: {
        name: 'bienvenida_pacto_soberana', language: { code: 'es_MX' },
        components: [{ type: 'body', parameters: [{ type: 'text', parameter_name: 'firstname', text: nombre }] }]
      }
    })
  });
  const data = await res.json();
  console.log(`Template bienvenida → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}

async function sendTemplateDia2(to, nombre) {
  const number = to.replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'template',
      template: {
        name: 'dia2_workshop_cs', language: { code: 'es_MX' },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', parameter_name: 'firstname', text: nombre }]
          },
          {
            type: 'button', sub_type: 'quick_reply', index: '0',
            parameters: [{ type: 'payload', payload: 'dia2_termino' }]
          },
          {
            type: 'button', sub_type: 'quick_reply', index: '1',
            parameters: [{ type: 'payload', payload: 'dia2_no_vio' }]
          }
        ]
      }
    })
  });
  const data = await res.json();
  console.log(`Template día 2 → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}

async function sendWhatsApp(to, message) {
  const number = to.replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'text', text: { body: message }
    })
  });
  const data = await res.json();
  console.log(`WA → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}

async function sendButtons(to, body, buttons) {
  const number = to.replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'interactive',
      interactive: {
        type: 'button', body: { text: body },
        action: { buttons: buttons.map(b => ({ type: 'reply', reply: { id: b.id, title: b.title } })) }
      }
    })
  });
  const data = await res.json();
  console.log(`Buttons → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}

async function sendUrlButton(to, body, buttonText, url) {
  const number = to.replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'interactive',
      interactive: {
        type: 'cta_url', body: { text: body },
        action: { name: 'cta_url', parameters: { display_text: buttonText, url } }
      }
    })
  });
  const data = await res.json();
  console.log(`UrlBtn → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}

async function sendAudio(to, mediaId) {
  const number = to.replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'audio',
      audio: { id: mediaId }
    })
  });
  const data = await res.json();
  console.log(`Audio → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}


// ════════════════════════════════════════════════════════════════
// GESTIÓN DE ESTADOS (para conversaciones en curso)
// ════════════════════════════════════════════════════════════════

async function guardarEstado(phone, estado) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'guardar_estado',
        phone:  phone,
        estado: estado
      })
    });
    console.log(`Estado guardado: ${estado} para ${phone}`);
  } catch (err) {
    console.error('guardarEstado error:', err.message);
  }
}

async function obtenerEstado(phone) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return null;
  try {
    const tel = phone.replace(/[^0-9]/g, '').slice(-10);
    const res = await fetch(`${url}?accion=obtener_estado&telefono=${tel}`);
    const data = await res.json();
    return data.ok ? data.estado : null;
  } catch (err) {
    return null;
  }
}

async function borrarEstado(phone) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'borrar_estado',
        phone:  phone
      })
    });
  } catch (err) {
    console.error('borrarEstado error:', err.message);
  }
}

// ════════════════════════════════════════════════════════════════
// ENVIAR VIDEO
// ════════════════════════════════════════════════════════════════

async function sendVideo(to, mediaId) {
  const number = to.replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'video',
      video: { id: mediaId }
    })
  });
  const data = await res.json();
  console.log(`Video → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}

// ════════════════════════════════════════════════════════════════
// PLANTILLA DÍA 4
// ════════════════════════════════════════════════════════════════

async function sendTemplateDia4(to, nombre) {
  const number = to.replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'template',
      template: {
        name: 'dia4b_reflexion_cs', language: { code: 'es_MX' },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', parameter_name: 'firstname', text: nombre }]
          },
          {
            type: 'button', sub_type: 'quick_reply', index: '0',
            parameters: [{ type: 'payload', payload: 'dia4_si_cuento' }]
          },
          {
            type: 'button', sub_type: 'quick_reply', index: '1',
            parameters: [{ type: 'payload', payload: 'dia4_otra_ocasion' }]
          }
        ]
      }
    })
  });
  const data = await res.json();
  console.log(`Template día 4 → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}
