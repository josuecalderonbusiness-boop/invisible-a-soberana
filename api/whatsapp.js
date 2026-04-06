// api/whatsapp.js — Arquitectura híbrida v3
// Botones: procesados directamente en Vercel (inmediato)
// Textos libres: guardados en Sheets para Apps Script
// Triggers: siempre via Sheets

// ════════════════════════════════════════════════════════════════
// COHORTES — automático según fecha actual
// ════════════════════════════════════════════════════════════════
const COHORTES = [
  { cierre: '27 de abril',  cierreDate: '2026-04-27', inicio: '28 de abril'  },
  { cierre: '25 de mayo',   cierreDate: '2026-05-25', inicio: '26 de mayo'   },
  { cierre: '29 de junio',  cierreDate: '2026-06-29', inicio: '30 de junio'  },
  { cierre: '27 de julio',  cierreDate: '2026-07-27', inicio: '28 de julio'  }
];

function getCohorteActual() {
  const hoy = new Date();
  for (const c of COHORTES) {
    const cierre = new Date(c.cierreDate + 'T23:59:59');
    if (hoy <= cierre) return c;
  }
  return COHORTES[COHORTES.length - 1];
}

// ════════════════════════════════════════════════════════════════
// MEDIA IDs
// ════════════════════════════════════════════════════════════════
const AUDIO_DIA2_TERMINO = '1620415032329794';
const AUDIO_DIA2_NO_VIO  = '2362093030941177';
const VIDEO_DIA4_A       = '1507744617738426';
const VIDEO_DIA4_B       = '976614471691735';
const AUDIO_DIA6         = '4265678347083267';
const VIDEO_DIA13        = 'PENDIENTE_VIDEO_DIA13';
const VIDEO_DIA17        = 'PENDIENTE_VIDEO_DIA17'; // ***VIDEO PENDIENTE*** día 17
const AUDIO_DIA20        = 'PENDIENTE_AUDIO_DIA20'; // ***AUDIO PENDIENTE*** día 20
const VIDEO_DIA25        = 'PENDIENTE_VIDEO_DIA25'; // ***AUDIO PENDIENTE*** día 25 — historia
const VIDEO_DIA29        = 'PENDIENTE_VIDEO_DIA29'; // Video primera sesión día 29 // Grabar y subir a Meta

export default async function handler(req, res) {

  // ── GET: verificación webhook Meta ──────────────────────────────
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': verifyToken, 'hub.challenge': challenge, test, phone, token } = req.query;

    // ── TEST: disparar paso manualmente ──────────────────────────
    if (test && token === 'soberana2026') {
      if (!phone) return res.status(400).json({ error: 'phone requerido' });

      // test=dia13_raw → llamada directa a Meta y devuelve respuesta cruda
      if (test === 'dia13_raw') {
        const number = String(phone).replace(/[^0-9]/g, '');
        try {
          const metaRes = await fetch(WA_BASE(), {
            method: 'POST', headers: WA_HDR(),
            body: JSON.stringify({
              messaging_product: 'whatsapp', to: number, type: 'template',
              template: {
                name: 'dia13_7d_cs', language: { code: 'es_MX' },
                components: [
                  { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: 'dia13_ver' }] }
                ]
              }
            })
          });
          const metaData = await metaRes.json();
          return res.status(200).json({ meta_status: metaRes.status, meta_response: metaData });
        } catch (err) {
          return res.status(500).json({ ok: false, error: err.message });
        }
      }

      const paso = test;
      console.log(`TEST manual: paso=${paso} phone=${phone}`);
      try {
        await ejecutarPaso(String(phone), paso, '');
        return res.status(200).json({ ok: true, ejecutado: paso, phone });
      } catch (err) {
        console.error(`TEST error: ${err.message}`, err);
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    if (mode === 'subscribe' && verifyToken === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Forbidden' });
  }

  // ── POST: trigger desde Apps Script ─────────────────────────────
  // Detectar por 'paso' sin 'object' (Meta nunca envía 'paso')
  // Evita depender de trigger===true (puede llegar como string por encoding)
  if (req.method === 'POST' && req.body?.paso && !req.body?.object) {
    const { phone, paso, nombre } = req.body;
    console.log(`Trigger recibido: phone=${phone} paso=${paso} trigger=${JSON.stringify(req.body?.trigger)}`);
    try {
      await ejecutarPaso(String(phone), paso, nombre || '');
    } catch (err) {
      console.error(`Error ejecutando paso ${paso} para ${phone}: ${err.message}`, err);
    }
    return res.status(200).json({ ok: true });
  }

  // ── POST: webhook entrante Meta ──────────────────────────────────
  if (req.method === 'POST' && req.body?.object === 'whatsapp_business_account') {
    const entry    = req.body.entry?.[0]?.changes?.[0]?.value;
    const messages = entry?.messages;
    if (!messages?.length) return res.status(200).json({ ok: true });

    const msg  = messages[0];
    const tipo = msg.type || '';
    const phone = '+' + msg.from;

    // ── BOTONES → procesar inmediato en Vercel ──────────────────
    if (tipo === 'interactive' || tipo === 'button') {
      const msgId = msg.id || '';

      // Anti-duplicado rápido via Sheets
      if (msgId) {
        const dup = await verificarDuplicado(msgId);
        if (dup) {
          console.log(`Duplicado ignorado: ${msgId}`);
          return res.status(200).json({ ok: true });
        }
      }

      const isListReply   = msg.interactive?.type === 'list_reply';
      const btnId = tipo === 'interactive'
        ? (isListReply
            ? (msg.interactive?.list_reply?.id || '')
            : (msg.interactive?.button_reply?.id || '')).toLowerCase()
        : (msg.button?.payload || msg.button?.text || '').toLowerCase();
      const btnTx = tipo === 'interactive'
        ? (isListReply
            ? (msg.interactive?.list_reply?.title || '')
            : (msg.interactive?.button_reply?.title || '')).toLowerCase()
        : (msg.button?.text || '').toLowerCase();

      console.log(`Botón: id="${btnId}" tx="${btnTx}" payload="${msg.button?.payload}" text="${msg.button?.text}"`);

      // Procesar botón ANTES de responder
      await manejarBoton(phone, btnId, btnTx);
      return res.status(200).json({ ok: true });
    }

    // ── TEXTOS ───────────────────────────────────────────────────
    if (tipo === 'text') {
      const msgId = msg.id || '';
      const texto = (msg.text?.body || '').trim();
      const textoL = texto.toLowerCase();

      // Bienvenida → procesar inmediato en Vercel
      const esBienvenida = textoL.includes('acabo de comprar') || textoL.includes('comunidad vip') || textoL.includes('soberana');
      if (esBienvenida) {
        if (msgId) {
          const dup = await verificarDuplicado(msgId);
          if (dup) {
            console.log(`Duplicado bienvenida ignorado: ${msgId}`);
            return res.status(200).json({ ok: true });
          }
        }
        const contacto = await buscarContacto(phone);
        const nombre   = contacto?.nombre || 'amiga';
        await sendTemplate(phone, nombre, 'bienvenida_pacto_soberana');
        return res.status(200).json({ ok: true });
      }

      // Resto → guardar en Sheets para Apps Script
      await guardarEnSheets({
        msgId, phone, tipo, texto,
        btnId: '', btnTx: '',
        timestamp: new Date().toISOString()
      });

      console.log('Texto guardado: ' + texto.substring(0,30));
      return res.status(200).json({ ok: true });
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(200).json({ ok: true });
}

// ════════════════════════════════════════════════════════════════
// ANTI-DUPLICADO
// ════════════════════════════════════════════════════════════════
async function verificarDuplicado(msgId) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return false;
  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'verificar_duplicado', msgId }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    const data = await res.json();
    return data.duplicado === true;
  } catch {
    return false;
  }
}

// ════════════════════════════════════════════════════════════════
// GUARDAR TEXTO EN SHEETS
// ════════════════════════════════════════════════════════════════
async function guardarEnSheets(data) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'guardar_mensaje_entrante', ...data })
    });
  } catch (err) {
    console.error('guardarEnSheets error:', err.message);
  }
}

// ════════════════════════════════════════════════════════════════
// MANEJAR BOTONES — procesamiento inmediato
// ════════════════════════════════════════════════════════════════
async function manejarBoton(phone, btnId, btnTx) {
  const contacto = await buscarContacto(phone);
  const nombre   = contacto?.nombre || '';
  const n        = nombre || '';

  // ── DÍA 0 — Botones de bienvenida ───────────────────────────
  if (btnTx.includes('pude') || btnTx.includes('ya pude')) {
    await sendUrlButton(phone,
      `Tu herramienta de trabajo ya está lista. 🛠️\n\nAquí vas a registrar tus respuestas del Workshop, activar tus recordatorios y aplicar cada palanca a tu ritmo.\n\n👇 Descárgala antes de empezar.`,
      'Ver herramienta', 'https://soberana-app.josuecalderon.lat'
    );
    await sendUrlButton(phone,
      `Únete también a la comunidad privada.\n\nAhí publico perspectiva masculina directa, casos reales y cosas que no digo en ningún otro lado.\n\nSolo para compradoras. 👇`,
      'Unirme ahora', 'https://chat.whatsapp.com/BqxkKzCjlFj5RdX7MYOJi2'
    );
    await programarTrigger(phone, 'confirmacion_comunidad', 1, n);
  }

  else if (btnTx.includes('no he') || btnTx.includes('podido')) {
    await guardarEstadoSheets(phone, 'esperando_correo_soporte');
    await sendWhatsApp(phone,
      `Tranquila. Lo resolvemos ahora. 🙏\n\n` +
      `1️⃣ Busca en *spam* o *promociones* un correo de Hotmart\n\n` +
      `2️⃣ El correo viene de noreply@hotmart.com\n\n` +
      `3️⃣ Si no aparece — escríbeme tu correo aquí mismo y te reenvío el acceso en menos de 24 horas.`
    );
  }

  // ── DÍA 0 — Confirmación comunidad ──────────────────────────
  else if (btnId === 'comunidad_si') {
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
    await programarTrigger(phone, 'confirmacion_comunidad', 1, n);
  }

  // ── DÍA 0 — Encargo ─────────────────────────────────────────
  else if (btnId === 'workshop_hoy') {
    await programarTrigger(phone, 'dia2_no_vio', 2, n);
    await sendWhatsApp(phone,
      `Perfecto. 💪\n\nCuando termines el Workshop — escríbeme:\n*Ya tengo el código*\n\nNos vemos adentro.`
    );
  }

  else if (btnId === 'workshop_semana') {
    await programarTrigger(phone, 'dia2_no_vio', 2, n);
    await sendWhatsApp(phone,
      `Bien. 📅\n\nCuando lo termines — escríbeme:\n*Ya tengo el código*\n\nTe escribo en unos días.`
    );
  }

  else if (btnId === 'workshop_nose') {
    await programarTrigger(phone, 'dia2_no_vio', 2, n);
    await sendWhatsApp(phone,
      `Sin problema. 🙏\n\nCuando lo termines — escríbeme:\n*Ya tengo el código*\n\nAquí estaré.`
    );
  }

  // ── DÍA 2 — Plantilla ────────────────────────────────────────
  else if (btnId === 'dia2_termino' || btnTx.includes('ya lo termin') || btnTx.includes('termin')) {
    await cancelarTrigger(phone, 'dia2_no_vio');
    await cancelarTrigger(phone, 'dia4_reflexion');
    await programarTrigger(phone, 'dia4_reflexion', 5, n);
    await sendWhatsApp(phone, nombre ? `Muy bien ${n}, te diré algo 👇` : `Muy bien, te diré algo 👇`);
    await sendAudio(phone, AUDIO_DIA2_TERMINO);
  }

  else if (btnId === 'dia2_no_vio' || btnTx.includes('aún no') || btnTx.includes('aun no')) {
    await cancelarTrigger(phone, 'dia4_reflexion');
    await programarTrigger(phone, 'dia4_reflexion', 5, n);
    await sendWhatsApp(phone, nombre ? `Entonces ${n}, hay algo que debes escuchar 👇` : `Entonces, hay algo que debes escuchar 👇`);
    await sendAudio(phone, AUDIO_DIA2_NO_VIO);
  }

  // ── DÍA 4 — Plantilla ────────────────────────────────────────
  else if (btnId === 'dia4_si_cuento' || btnTx.includes('quiero contarte')) {
    await cancelarTrigger(phone, 'dia6_audio');
    await programarTrigger(phone, 'dia6_audio', 5, n);
    await programarTrigger(phone, 'dia4_video_c', 2, n); // PRUEBA: 2 min (producción: 60 min)
    await guardarEstadoSheets(phone, 'esperando_dia4');
    await sendWhatsApp(phone,
      `Estoy aquí.\n\nCuando quieras — escríbeme lo que notaste. No hay prisa. 👇`
    );
  }

  else if (btnId === 'dia4_otra_ocasion' || btnTx.includes('te cuento en otra') || btnTx.includes('otra ocasi')) {
    await cancelarTrigger(phone, 'dia6_audio');
    await programarTrigger(phone, 'dia6_audio', 5, n);
    await sendWhatsApp(phone, nombre ? `Entonces quiero que escuches esto 👇 ${n}` : `Entonces quiero que escuches esto 👇`);
    await sendVideo(phone, VIDEO_DIA4_B);
  }

  // ── SOPORTE — Verificar acceso ───────────────────────────────────
  else if (btnId === 'acceso_confirmado' || btnTx.includes('ya pude entrar') || btnTx.includes('sí, ya')) {
    // Ella confirmó que ya pudo entrar — iniciar flujo normal
    await cancelarTrigger(phone, 'flujo_bienvenida_directo');
    await guardarEstadoSheets(phone, 'acceso_confirmado');
    await sendUrlButton(phone,
      `Tu herramienta de trabajo ya está lista. 🛠️\n\nAquí vas a registrar tus respuestas del Workshop, activar tus recordatorios y aplicar cada palanca a tu ritmo.\n\n👇 Descárgala antes de empezar.`,
      'Ver herramienta', 'https://soberana-app.josuecalderon.lat'
    );
    await sendUrlButton(phone,
      `Únete también a la comunidad privada.\n\nAhí publico perspectiva masculina directa, casos reales y cosas que no digo en ningún otro lado.\n\nSolo para compradoras. 👇`,
      'Unirme ahora', 'https://chat.whatsapp.com/BqxkKzCjlFj5RdX7MYOJi2'
    );
    await programarTrigger(phone, 'confirmacion_comunidad', 1, n);
  }

  // ── DÍA 13 — Video ──────────────────────────────────────────────
  else if (btnId === 'dia13_ver') {
    await ejecutarPaso(phone, 'dia13_video', nombre);
  }

  // ── DÍA 17 ───────────────────────────────────────────────────────
  else if (btnId === 'dia17_ver') {
    await ejecutarPaso(phone, 'dia17_video', nombre);
  }

  // ── DÍA 20 ───────────────────────────────────────────────────────
  else if (btnId === 'dia20_escuchar') {
    await ejecutarPaso(phone, 'dia20_audio', nombre);
  }

  // ── DÍA 25 ───────────────────────────────────────────────────────
  else if (btnId === 'dia25_si') {
    await ejecutarPaso(phone, 'dia25_audio', nombre);
  }

  // ── DÍA 27 ───────────────────────────────────────────────────────
  else if (btnId === 'dia27_decide') {
    await cancelarTrigger(phone, 'dia27_tarde');
    await cancelarTrigger(phone, 'dia27_noche');
    await ejecutarPaso(phone, 'dia27_secuencia', nombre);
  }

  else if (btnId === 'dia27_tarde_escuchar') {
    await cancelarTrigger(phone, 'dia27_noche');
    // Enviar audio día 27 tarde
    const AUDIO_DIA27_TARDE = 'PENDIENTE_AUDIO_DIA27_TARDE'; // ***AUDIO PENDIENTE*** dolor anticipado
    if (AUDIO_DIA27_TARDE !== 'PENDIENTE_AUDIO_DIA27_TARDE') {
      await sendAudio(phone, AUDIO_DIA27_TARDE);
    } else {
      await sendWhatsApp(phone, '***AUDIO PENDIENTE*** día 27 tarde — dolor anticipado');
    }
    await sendWhatsApp(phone,
      `→ https://pay.hotmart.com/W97386435C\n\nQuedan 6 horas.\nGarantía de 7 días.\n— Josué`
    );
  }

  else if (btnId === 'dia27_compre') {
    await cancelarTrigger(phone, 'dia27_tarde');
    await cancelarTrigger(phone, 'dia27_noche');
    await sendWhatsApp(phone, `Bien.\n\nNos vemos adentro.\n\n— Josué`);
  }

  else if (btnId === 'dia27_duda') {
    await sendList(phone,
      `${n}, dime qué es lo que te detiene.`,
      'Ver opciones',
      [{
        title: '¿Qué te frena?',
        rows: [
          { id: 'obj_pensar',   title: 'Necesito pensarlo más',    description: 'Aún no me decido' },
          { id: 'obj_dinero',   title: 'No sé si tengo el dinero', description: 'Los $197 me generan duda' },
          { id: 'obj_tiempo',   title: 'No sé si tengo el tiempo', description: 'Mi agenda está muy llena' },
          { id: 'obj_caso',     title: 'No sé si es para mi caso', description: 'Mi situación es diferente' },
          { id: 'obj_programa', title: 'Tengo dudas del programa', description: 'Quiero saber más detalles' }
        ]
      }]
    );
  }

  // ── OBJECIONES 7D ──────────────────────────────────────────────
  else if (btnId === 'obj_pensar') {
    const cohorte = getCohorteActual();
    await sendWhatsApp(phone,
      `${n}.\n\nLlevas tiempo pensando.\n\nPensaste cuando algo no funcionó en tu relación. Pensaste cuando viste el Workshop. Pensaste cuando recibiste el diagnóstico.\n\nEl pensamiento no es el problema.\nEl problema es que pensar sin decidir es otra forma de quedarse igual.\n\nLa mujer que entra al 7D no llega porque ya tiene todo claro.\nLlega porque entiende que la claridad no aparece antes de la decisión.\nAparece después.\n\nLas inscripciones cierran el *${cohorte.cierre}*.\n\nhttps://pay.hotmart.com/W97386435C`
    );
  }

  else if (btnId === 'obj_dinero') {
    const cohorte = getCohorteActual();
    await sendWhatsApp(phone,
      `${n}.\n\n$197 no es lo que cuesta el 7D.\nEs lo que cuesta una semana de decisiones tomadas desde el mismo lugar de siempre.\n\nLa mujer que dice que no tiene $197 para invertir en el sistema que gobierna su vida — tiene un problema en su dimensión económica.\n\nY eso también lo trabajamos en el 7D.\n\nNo te digo esto para presionarte.\nTe lo digo porque el espejo no miente.\n\n¿Qué dice el tuyo?\n\nLas inscripciones cierran el *${cohorte.cierre}*.\n\nhttps://pay.hotmart.com/W97386435C`
    );
  }

  else if (btnId === 'obj_tiempo') {
    const cohorte = getCohorteActual();
    await sendWhatsApp(phone,
      `${n}.\n\nUna sesión por semana.\nCuatro semanas.\nEso es todo el tiempo que necesitas.\n\nPero hay algo más importante que el tiempo: en qué lo estás usando.\n\nSi tienes tiempo para todo menos para trabajarte a ti misma — eso no es falta de tiempo.\nEs una jerarquía de valores que todavía no te pone a ti primero.\n\nEso también lo trabajamos en el 7D.\n\nLas inscripciones cierran el *${cohorte.cierre}*.\n\nhttps://pay.hotmart.com/W97386435C`
    );
  }

  else if (btnId === 'obj_caso') {
    const cohorte = getCohorteActual();
    await sendWhatsApp(phone,
      `${n}.\n\nSi tu caso fuera demasiado específico para trabajarlo — no estarías aquí.\n\nLas mujeres que llegan al 7D no llegan porque todo está igual.\nLlegan porque algo cambió cuando tomaron el Workshop — y entienden que ese cambio merece una base más sólida.\n\nEsa eres tú.\n\nLas inscripciones cierran el *${cohorte.cierre}*.\n\nhttps://pay.hotmart.com/W97386435C`
    );
  }

  else if (btnId === 'obj_programa') {
    const cohorte = getCohorteActual();
    await sendWhatsApp(phone,
      `${n}, el Soberana 7D es esto:\n\n→ 4 semanas en vivo con Josué\n→ 1 sesión por semana — si no puedes en vivo queda grabada\n→ Las 7 dimensiones de tu vida — no solo la relación\n→ Comunidad privada de mujeres en el mismo proceso\n→ Workbook semana a semana\n→ App Soberana — una pregunta diaria rotando por tus 7 dimensiones\n→ Acceso de por vida en Kajabi\n→ $197 USD · Garantía 7 días\n\nSolo para mujeres que tomaron Código Soberana.\n\nLas inscripciones cierran el *${cohorte.cierre}*.\n\nhttps://pay.hotmart.com/W97386435C\n\n¿Alguna duda específica? 👇`
    );
  }

  // ── DÍA 15 — Pregunta directa ──────────────────────────────────
  else if (btnId === 'dia15_si') {
    const cohorte = getCohorteActual();
    await sendWhatsApp(phone,
      `Bien. 🙏\n\nAquí está el enlace para asegurar tu lugar:\n\nhttps://pay.hotmart.com/W97386435C\n\nLas inscripciones cierran el *${cohorte.cierre}*.\n\nCualquier duda — escríbeme aquí mismo.`
    );
  }
  else if (btnId === 'dia15_pregunta') {
    await sendList(phone,
      `${n}, dime qué es lo que te detiene.`,
      'Ver opciones',
      [{
        title: '¿Qué te frena?',
        rows: [
          { id: 'obj_pensar',   title: 'Necesito pensarlo más',      description: 'Aún no me decido' },
          { id: 'obj_dinero',   title: 'No sé si tengo el dinero',   description: 'Los $197 me generan duda' },
          { id: 'obj_tiempo',   title: 'No sé si tengo el tiempo',   description: 'Mi agenda está muy llena' },
          { id: 'obj_caso',     title: 'No sé si es para mi caso',   description: 'Mi situación es diferente' },
          { id: 'obj_programa', title: 'Tengo dudas del programa',   description: 'Quiero saber más detalles' }
        ]
      }]
    );
  }
  else if (btnId === 'dia15_no') {
    await sendWhatsApp(phone,
      `Está bien. Sin presión.\n\nSi en algún momento cambias de opinión — sabes dónde encontrarme.`
    );
    await programarTrigger(phone, 'dia17_despues', 4, nombre); // PRUEBA: 4 min (producción: 2880 = 2 días)
  }

  // ── DÍA 9 — Diagnóstico ─────────────────────────────────────────
  else if (btnId === 'dia9_inicio') {
    await guardarEstadoSheets(phone, 'dia9_p1');
    await sendButtons(phone,
      `Desde que aplicaste el Código Soberana — ¿cómo describes tu situación?`,
      [
        { id: 'dia9_p1_a', title: 'Noto cambios reales' },
        { id: 'dia9_p1_b', title: 'El patrón persiste' }
      ]
    );
  }

  else if (btnId === 'dia9_p1_a' || btnId === 'dia9_p1_b') {
    // Guardar respuesta P1 y enviar P2
    const r1 = btnId === 'dia9_p1_a' ? 'A' : 'B';
    await guardarEstadoSheets(phone, 'dia9_p2_' + r1);
    await sendButtons(phone,
      `Fuera de tu relación — tu energía, tu claridad, tu enfoque en lo que construyes — ¿cómo lo describes?`,
      [
        { id: 'dia9_p2_a', title: 'Todo fluye bien' },
        { id: 'dia9_p2_b', title: 'Me cuesta sostenerlo' }
      ]
    );
  }

  else if (btnId === 'dia9_p2_a' || btnId === 'dia9_p2_b') {
    // Recuperar R1 del estado, guardar R2 y enviar P3
    const r2 = btnId === 'dia9_p2_a' ? 'A' : 'B';
    // El estado actual tiene 'dia9_p2_X' donde X es R1
    const estadoActual = await obtenerEstadoSheets(phone);
    const r1 = estadoActual ? estadoActual.replace('dia9_p2_', '') : 'A';
    await guardarEstadoSheets(phone, 'dia9_p3_' + r1 + r2);
    await sendButtons(phone,
      `¿Hay áreas de tu vida donde sientes que tu crecimiento todavía no llega — trabajo, dinero, propósito, cuerpo?`,
      [
        { id: 'dia9_p3_a', title: 'Sí, hay áreas' },
        { id: 'dia9_p3_b', title: 'Estoy bien en todo' }
      ]
    );
  }

  else if (btnId === 'dia9_p3_a' || btnId === 'dia9_p3_b') {
    // Recuperar R1+R2 del estado y enviar resultado
    const r3 = btnId === 'dia9_p3_a' ? 'A' : 'B';
    const estadoActual = await obtenerEstadoSheets(phone);
    const previo = estadoActual ? estadoActual.replace('dia9_p3_', '') : 'AA';
    const combo = previo + r3;
    await guardarEstadoSheets(phone, '');
    await enviarResultadoDia9(phone, combo, nombre);
  }

  // ── DÍA 6 — Plantilla ────────────────────────────────────────
  else if (btnId === 'dia6_escuchar' || btnTx.includes('escuchar mensaje') || btnTx.includes('escuchar')) {
    await sendAudio(phone, AUDIO_DIA6);
  }

  else {
    console.log(`Botón no reconocido: id="${btnId}" tx="${btnTx}"`);
  }
}

// ════════════════════════════════════════════════════════════════
// PASOS — llamados desde Apps Script via trigger
// ════════════════════════════════════════════════════════════════
async function ejecutarPaso(phone, paso, nombre) {
  console.log(`Paso: ${paso} para ${phone} (${nombre})`);
  const n = nombre || 'amiga';

  if (paso === 'bienvenida') {
    await sendTemplate(phone, n, 'bienvenida_pacto_soberana');
  }
  else if (paso === 'confirmacion_comunidad') {
    await sendButtons(phone, '¿Lograste unirte a la comunidad?', [
      { id: 'comunidad_si', title: '✅ Ya estoy dentro' },
      { id: 'comunidad_no', title: '⏳ Aún no' }
    ]);
  }
  else if (paso === 'dia2_no_vio') {
    await programarTrigger(phone, 'dia4_reflexion', 5, n);
    await sendTemplateDia2(phone, n);
  }
  else if (paso === 'dia4_reflexion') {
    await programarTrigger(phone, 'dia6_audio', 6, n);
    await sendTemplateDia4(phone, n);
  }
  else if (paso === 'dia4_video_a') {
    // Marcar que ella respondió — cancela el video C
    await guardarEstadoSheets(phone, 'dia4_respondio');
    await sendWhatsApp(phone, nombre ? `Ok, escúchame esto 👇 ${n}` : `Ok, escúchame esto 👇`);
    await sendVideo(phone, VIDEO_DIA4_A);
  }
  else if (paso === 'dia4_video_c') {
    // Solo enviar si ella no respondió (el estado esperando_dia4 ya se borró si respondió)
    // Apps Script verifica el estado antes de llamar este paso
    await sendWhatsApp(phone, nombre ? `${n}, aunque no me lo contaste aún —` : `Aunque no me lo contaste aún —`);
    // VIDEO C — pendiente de subir cuando esté grabado
    await sendVideo(phone, '975237675175658'); // Video C
  }

  else if (paso === 'dia6_audio') {
    await sendTemplateDia6(phone, n);
    // Programar día 9
    await programarTrigger(phone, 'dia9_diagnostico', 3, n); // PRUEBA: 3 min (producción: 4320 = 3 días)
  }

  else if (paso === 'dia9_diagnostico') {
    await sendTemplateDia9(phone, n);
  }

  else if (paso === 'dia17_despues') {
    await sendTemplateDia17(phone, n);
    await programarTrigger(phone, 'dia20_urgencia', 3, n); // PRUEBA: 3 min (producción: 4320 = 3 días)
  }

  else if (paso === 'dia17_video') {
    const cohorte = getCohorteActual();
    if (VIDEO_DIA17 !== 'PENDIENTE_VIDEO_DIA17') {
      await sendVideo(phone, VIDEO_DIA17);
    } else {
      await sendWhatsApp(phone, `***VIDEO PENDIENTE*** día 17 — El después no existe`);
    }
    await sendWhatsApp(phone,
      `El Soberana 7D cierra sus puertas el *${cohorte.cierre}*.\n\n→ https://pay.hotmart.com/W97386435C`
    );
  }

  else if (paso === 'dia20_urgencia') {
    await sendTemplateDia20(phone, n);
    await programarTrigger(phone, 'dia25_calentamiento', 3, n); // PRUEBA: 3 min (producción: 7200 = 5 días)
  }

  else if (paso === 'dia20_audio') {
    const cohorte = getCohorteActual();
    if (AUDIO_DIA20 !== 'PENDIENTE_AUDIO_DIA20') {
      await sendAudio(phone, AUDIO_DIA20);
    } else {
      await sendWhatsApp(phone, `***AUDIO PENDIENTE*** día 20 — Urgencia`);
    }
    await sendWhatsApp(phone,
      `Las inscripciones cierran el *${cohorte.cierre}*.\n\n→ https://pay.hotmart.com/W97386435C\n\nGarantía de 7 días. Sin preguntas.`
    );
  }

  else if (paso === 'dia25_calentamiento') {
    await sendTemplateDia25(phone, n);
    await programarTrigger(phone, 'dia27_cierre', 3, n); // PRUEBA: 3 min (producción: 2880 = 2 días)
  }

  else if (paso === 'dia25_audio') {
    if (VIDEO_DIA25 !== 'PENDIENTE_VIDEO_DIA25') {
      await sendAudio(phone, VIDEO_DIA25);
    } else {
      console.log('Audio día 25 pendiente');
    }
  }

  else if (paso === 'dia27_cierre') {
    await sendTemplateDia27(phone, n);
    // Programar tarde y noche para las que no abran
    await programarTrigger(phone, 'dia27_tarde', 3, n);  // PRUEBA: 3 min (producción: 540 = 9 horas → 6 PM)
    await programarTrigger(phone, 'dia27_noche', 6, n);  // PRUEBA: 6 min (producción: 780 = 13 horas → 10 PM)
  }

  else if (paso === 'dia27_tarde') {
    // Solo enviar si no compró
    await sendTemplateDia27Tarde(phone, n);
  }

  else if (paso === 'dia27_noche') {
    // Solo enviar si no compró
    await sendTemplateDia27Noche(phone, n);
  }

  else if (paso === 'dia27_secuencia') {
    // Ella presionó "La mía también decide" — secuencia completa
    const cohorte = getCohorteActual();
    await sendWhatsApp(phone,
      `Bien.\n\nAquí está tu lugar:\nhttps://pay.hotmart.com/W97386435C\n\nGarantía de 7 días. Sin preguntas.\n\nLas inscripciones cierran hoy a las 11:59 PM.\n\n— Josué`
    );
    // Programar seguimiento 3 horas después
    await programarTrigger(phone, 'dia27_followup', 3, n); // PRUEBA: 3 min (producción: 180 = 3 horas)
  }

  else if (paso === 'dia27_followup') {
    await sendWhatsApp(phone,
      `${n}.\n\nHace un momento tomaste una decisión.\n\n¿Ya aseguraste tu lugar?`
    );
    await sendButtons(phone,
      ``,
      [
        { id: 'dia27_compre',  title: 'Ya entré al 7D' },
        { id: 'dia27_duda',    title: 'Tengo una duda' }
      ]
    );
  }

  else if (paso === 'dia27_urgencia') {
    const cohorte = getCohorteActual();
    await sendWhatsApp(phone,
      `${n}.\n\nQuedan pocas horas.\n\nNo para presionarte — para recordarte que la mujer que quieres ser no aparece esperando el momento perfecto.\n\nAparece decidiendo en momentos como este.\n\nhttps://pay.hotmart.com/W97386435C`
    );
  }

  else if (paso === 'dia27_final') {
    await sendWhatsApp(phone,
      `${n}.\n\nUna hora.\n\nDespués de esto — el Soberana 7D cierra sus puertas.\n\nhttps://pay.hotmart.com/W97386435C\n\nGarantía de 7 días. Sin preguntas.`
    );
  }

  // Día 29 — Solo email (campaña manual Brevo)
  // No hay mensaje WA el día 29

  else if (paso === 'dia13_texto_video') {
    console.log('Ejecutando día 13 para: ' + phone);
    // Enviar plantilla día 13
    await sendTemplateDia13(phone, n);
    // Programar día 15
    await programarTrigger(phone, 'dia15_pregunta_directa', 3, n); // PRUEBA: 3 min (producción: 2880 = 2 días)
  }

  else if (paso === 'dia13_video') {
    // Ella presionó "Ver mensaje" — enviar texto con fechas + video
    const cohorte = getCohorteActual();
    await sendWhatsApp(phone,
      `Las inscripciones cierran el *${cohorte.cierre}*.\n` +
      `El entrenamiento inicia el *${cohorte.inicio}*.\n\n` +
      `Quiero que veas esto antes de decidir. 👇`
    );
    if (VIDEO_DIA13 !== 'PENDIENTE_VIDEO_DIA13') {
      await sendVideo(phone, VIDEO_DIA13);
    } else {
      console.log('Video día 13 pendiente de grabar y subir');
    }
  }

  else if (paso === 'dia15_pregunta_directa') {
    await sendTemplateDia15(phone, n);
  }

  else if (paso === 'verificar_acceso' || paso === 'verificar_acceso_recordatorio') {
    // Plantilla que pregunta si ya pudo entrar (también usado como recordatorio 24h)
    const contacto = await buscarContacto(phone);
    const nombreReal = contacto?.nombre || n;
    await sendTemplateVerificarAcceso(phone, nombreReal);
  }

  else if (paso === 'flujo_bienvenida_directo') {
    // Verificar directamente en Sheets — evita race condition con acceso_confirmado
    const estadoActual = await obtenerEstadoSheets(phone);
    if (estadoActual === 'acceso_confirmado') {
      console.log(`flujo_bienvenida_directo ignorado — acceso ya confirmado: ${phone}`);
      return;
    }
    // Si no respondió la verificación — iniciar flujo directo
    await sendUrlButton(phone,
      `Tu herramienta de trabajo ya está lista. 🛠️\n\nAquí vas a registrar tus respuestas del Workshop, activar tus recordatorios y aplicar cada palanca a tu ritmo.\n\n👇 Descárgala antes de empezar.`,
      'Ver herramienta', 'https://soberana-app.josuecalderon.lat'
    );
    await sendUrlButton(phone,
      `Únete también a la comunidad privada.\n\nAhí publico perspectiva masculina directa, casos reales y cosas que no digo en ningún otro lado.\n\nSolo para compradoras. 👇`,
      'Unirme ahora', 'https://chat.whatsapp.com/BqxkKzCjlFj5RdX7MYOJi2'
    );
    await programarTrigger(phone, 'confirmacion_comunidad', 1, n);
  }
  else if (paso === 'soporte_acceso') {
    await sendWhatsApp(phone,
      `Tranquila. Lo resolvemos ahora. 🙏\n\n` +
      `1️⃣ Busca en *spam* o *promociones* un correo de Hotmart\n\n` +
      `2️⃣ El correo viene de noreply@hotmart.com\n\n` +
      `3️⃣ Si no aparece — escríbeme tu correo aquí mismo.`
    );
  }
  else if (paso === 'confirmar_correo_soporte') {
    // nombre aquí es el correo que escribió
    const contactoSop = await buscarContacto(phone);
    const nombreSop   = contactoSop?.nombre || '';
    await sendWhatsApp(phone, `Recibí tu correo. ✅\n\nVoy a reenviar tu acceso en las próximas horas.\n\nEn cuanto lo tengas — te llegará un mensaje de confirmación aquí.`);
    await notificarSoporte(phone, nombre, nombreSop);
    await programarTrigger(phone, 'verificar_acceso', 2, nombreSop); // PRUEBA: 2 min (producción: 120 = 2 horas)
    await programarTrigger(phone, 'verificar_acceso_recordatorio', 1440, nombreSop); // 24 horas — para las que no respondieron
  }

  else if (paso === 'dia2_termino') {
    await programarTrigger(phone, 'dia4_reflexion', 5, n);
    await sendWhatsApp(phone, nombre ? `Muy bien ${n}, te diré algo 👇` : `Muy bien, te diré algo 👇`);
    await sendAudio(phone, AUDIO_DIA2_TERMINO);
  }
  else if (paso === 'dia2_no_vio_confirmado') {
    await programarTrigger(phone, 'dia4_reflexion', 5, n);
    await sendWhatsApp(phone, nombre ? `Entonces ${n}, hay algo que debes escuchar 👇` : `Entonces, hay algo que debes escuchar 👇`);
    await sendAudio(phone, AUDIO_DIA2_NO_VIO);
  }
}

// ════════════════════════════════════════════════════════════════
// PROGRAMAR TRIGGER EN SHEETS
// ════════════════════════════════════════════════════════════════
async function programarTrigger(phone, paso, minutos, nombre) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return;
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

async function cancelarTrigger(phone, paso) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'cancelar_trigger', phone, paso })
    });
  } catch (err) {
    console.error('cancelarTrigger error:', err.message);
  }
}

async function obtenerEstadoSheets(phone) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return null;
  try {
    const tel = phone.replace(/[^0-9]/g, '').slice(-10);
    const res = await fetch(`${url}?accion=obtener_estado&telefono=${tel}`);
    const data = await res.json();
    return data.ok ? data.estado : null;
  } catch { return null; }
}

async function enviarResultadoDia9(phone, combo, nombre) {
  const n = nombre || 'amiga';
  let mensaje = '';

  if (combo === 'AAA') {
    mensaje = `${n}, lo que describes tiene un nombre.\n\nEs la mujer que activó el código en su relación — y que empieza a sentir que el sistema quiere expandirse a todas las áreas de su vida.\n\nEso no es casualidad. Es la señal de que estás lista para el siguiente nivel.\n\nMañana te cuento exactamente qué significa eso. Revisa tu correo.`;
  } else if (combo === 'BBB') {
    mensaje = `${n}, lo que describes también tiene nombre.\n\nEs la mujer que siente que algo en el sistema no terminó de conectar del todo. No es falla tuya — es que el mapa estaba incompleto.\n\nMañana te explico cuál era la parte que faltaba. Revisa tu correo.`;
  } else if (combo.startsWith('A')) {
    mensaje = `${n}, lo que describes es exactamente lo más honesto que puede decir una Soberana en proceso.\n\nCambios reales en algunas áreas. Resistencia en otras. Eso no es incoherencia — es la señal de que hay dimensiones que todavía no han sido tocadas.\n\nMañana hablamos de eso. Revisa tu correo.`;
  } else {
    mensaje = `${n}, lo que describes tiene más información de la que parece.\n\nHay algo que el Workshop activó — y hay algo que todavía está esperando ser trabajado. Las dos cosas son verdad al mismo tiempo.\n\nMañana te cuento qué es lo que está esperando. Revisa tu correo.`;
  }

  await sendWhatsApp(phone, mensaje);
  // Programar día 13
  await programarTrigger(phone, 'dia13_texto_video', 4, nombre || ''); // PRUEBA: 4 min (producción: 5760 = 4 días)
}

async function guardarEstadoSheets(phone, estado) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'guardar_estado', phone, estado })
    });
  } catch (err) {
    console.error('guardarEstadoSheets error:', err.message);
  }
}

// ════════════════════════════════════════════════════════════════
// BUSCAR CONTACTO
// ════════════════════════════════════════════════════════════════
async function buscarContacto(phone) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return null;
  try {
    const tel = phone.replace(/[^0-9]/g, '').slice(-10);
    const res = await fetch(`${url}?accion=buscar_por_telefono&telefono=${tel}`);
    const data = await res.json();
    return data.ok ? data : null;
  } catch { return null; }
}

// ════════════════════════════════════════════════════════════════
// FUNCIONES DE ENVÍO
// ════════════════════════════════════════════════════════════════
const WA_BASE = () => `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
const WA_HDR  = () => ({
  'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
  'Content-Type':  'application/json'
});

async function sendTemplate(to, nombre, templateName) {
  const number = String(to).replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'template',
      template: {
        name: templateName, language: { code: 'es_MX' },
        components: [{ type: 'body', parameters: [{ type: 'text', parameter_name: 'firstname', text: nombre }] }]
      }
    })
  });
  const data = await res.json();
  console.log(`Template ${templateName} → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}

async function sendTemplateDia2(to, nombre) {
  const number = String(to).replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'template',
      template: {
        name: 'dia2_workshop_cs', language: { code: 'es_MX' },
        components: [
          { type: 'body', parameters: [{ type: 'text', parameter_name: 'firstname', text: nombre }] },
          { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: 'dia2_termino' }] },
          { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: 'dia2_no_vio' }] }
        ]
      }
    })
  });
  const data = await res.json();
  console.log(`Template día 2 → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}

async function sendTemplateDia4(to, nombre) {
  const number = String(to).replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'template',
      template: {
        name: 'dia4b_reflexion_cs', language: { code: 'es_MX' },
        components: [
          { type: 'body', parameters: [{ type: 'text', parameter_name: 'firstname', text: nombre }] },
          { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: 'dia4_si_cuento' }] },
          { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: 'dia4_otra_ocasion' }] }
        ]
      }
    })
  });
  const data = await res.json();
  console.log(`Template día 4 → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}

async function sendTemplateDia17(to, nombre) {
  const number = String(to).replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'template',
      template: {
        name: 'dia17_despues_cs', language: { code: 'es_MX' },
        components: [
          { type: 'body', parameters: [{ type: 'text', parameter_name: 'firstname', text: nombre }] },
          { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: 'dia17_ver' }] }
        ]
      }
    })
  });
  const data = await res.json();
  console.log(`Template día 17 → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}

async function sendTemplateDia20(to, nombre) {
  const number = String(to).replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'template',
      template: {
        name: 'dia20_urgencia_cs', language: { code: 'es_MX' },
        components: [
          { type: 'body', parameters: [{ type: 'text', parameter_name: 'firstname', text: nombre }] },
          { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: 'dia20_escuchar' }] }
        ]
      }
    })
  });
  const data = await res.json();
  console.log(`Template día 20 → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}

async function sendTemplateDia25(to, nombre) {
  const number = String(to).replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'template',
      template: {
        name: 'dia25_calentamiento_cs', language: { code: 'es_MX' },
        components: [
          { type: 'body', parameters: [{ type: 'text', parameter_name: 'firstname', text: nombre }] },
          { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: 'dia25_si' }] }
        ]
      }
    })
  });
  const data = await res.json();
  console.log(`Template día 25 → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}

async function sendTemplateDia27Tarde(to, nombre) {
  const number = String(to).replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'template',
      template: {
        name: 'dia27_tarde_cs', language: { code: 'es_MX' },
        components: [
          { type: 'body', parameters: [{ type: 'text', parameter_name: 'firstname', text: nombre }] },
          { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: 'dia27_tarde_escuchar' }] }
        ]
      }
    })
  });
  const data = await res.json();
  console.log(`Template día 27 tarde → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}

async function sendTemplateDia27Noche(to, nombre) {
  const number = String(to).replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'template',
      template: {
        name: 'dia27_noche_cs', language: { code: 'es_MX' },
        components: [
          { type: 'body', parameters: [{ type: 'text', parameter_name: 'firstname', text: nombre }] }
        ]
      }
    })
  });
  const data = await res.json();
  console.log(`Template día 27 noche → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}

async function sendTemplateDia27(to, nombre) {
  const number = String(to).replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'template',
      template: {
        name: 'dia27_cierre_cs', language: { code: 'es_MX' },
        components: [
          { type: 'body', parameters: [{ type: 'text', parameter_name: 'firstname', text: nombre }] },
          { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: 'dia27_decide' }] }
        ]
      }
    })
  });
  const data = await res.json();
  console.log(`Template día 27 → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}

async function sendTemplateDia13(to, nombre) {
  const number = String(to).replace(/[^0-9]/g, '');
  console.log('Enviando template día 13 a: ' + number);
  try {
    const res = await fetch(WA_BASE(), {
      method: 'POST', headers: WA_HDR(),
      body: JSON.stringify({
        messaging_product: 'whatsapp', to: number, type: 'template',
        template: {
          name: 'dia13_7d_cs', language: { code: 'es_MX' },
          components: [
            { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: 'dia13_ver' }] }
          ]
        }
      })
    });
    const data = await res.json();
    console.log('Enviando template día 13 a: ' + number + ' — resultado: ' + JSON.stringify(data));
  } catch (err) {
    console.error('Error enviando template día 13 a: ' + number + ' — ' + err.message, err);
  }
}

async function sendTemplateDia15(to, nombre) {
  const number = String(to).replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'template',
      template: {
        name: 'dia15_decision_cs', language: { code: 'es_MX' },
        components: [
          { type: 'body', parameters: [{ type: 'text', parameter_name: 'firstname', text: nombre }] },
          { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: 'dia15_pregunta' }] },
          { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: 'dia15_si' }] },
          { type: 'button', sub_type: 'quick_reply', index: '2', parameters: [{ type: 'payload', payload: 'dia15_no' }] }
        ]
      }
    })
  });
  const data = await res.json();
  console.log(`Template día 15 → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}

async function sendTemplateVerificarAcceso(to, nombre) {
  const number = String(to).replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'template',
      template: {
        name: 'verificar_acceso_cs', language: { code: 'es_MX' },
        components: [
          { type: 'body', parameters: [{ type: 'text', parameter_name: 'firstname', text: nombre }] },
          { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: 'acceso_confirmado' }] }
        ]
      }
    })
  });
  const data = await res.json();
  console.log(`Template verificar_acceso → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}

async function sendTemplateDia9(to, nombre) {
  const number = String(to).replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'template',
      template: {
        name: 'dia9_diagnostico_cs', language: { code: 'es_MX' },
        components: [
          { type: 'body', parameters: [{ type: 'text', parameter_name: 'firstname', text: nombre }] },
          { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: 'dia9_inicio' }] }
        ]
      }
    })
  });
  const data = await res.json();
  console.log(`Template día 9 → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}

async function sendTemplateDia6(to, nombre) {
  const number = String(to).replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'template',
      template: {
        name: 'dia6_audio_cs', language: { code: 'es_MX' },
        components: [
          { type: 'body', parameters: [{ type: 'text', parameter_name: 'firstname', text: nombre }] },
          { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: 'dia6_escuchar' }] }
        ]
      }
    })
  });
  const data = await res.json();
  console.log(`Template día 6 → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}

async function sendList(to, body, buttonText, sections) {
  const number = String(to).replace(/[^0-9]/g, '');
  const res = await fetch(WA_BASE(), {
    method: 'POST', headers: WA_HDR(),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: number, type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: body },
        action: {
          button: buttonText,
          sections: sections.map(s => ({
            title: s.title,
            rows: s.rows.map(r => ({
              id: r.id,
              title: r.title,
              description: r.description || ''
            }))
          }))
        }
      }
    })
  });
  const data = await res.json();
  console.log(`List → ${number}: ${data.messages?.[0]?.id ? '✓' : JSON.stringify(data)}`);
}

async function sendWhatsApp(to, message) {
  const number = String(to).replace(/[^0-9]/g, '');
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
  const number = String(to).replace(/[^0-9]/g, '');
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
  const number = String(to).replace(/[^0-9]/g, '');
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
  const number = String(to).replace(/[^0-9]/g, '');
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

async function sendVideo(to, mediaId) {
  const number = String(to).replace(/[^0-9]/g, '');
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

async function moverANoCompradoras7D(phone) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'no_compradora_7d',
        phone:  phone
      })
    });
    console.log(`Movida a no compradoras 7D: ${phone}`);
  } catch (err) {
    console.error('moverANoCompradoras7D error:', err.message);
  }
}

async function notificarSoporte(phone, correoCliente, nombre) {
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Código Soberana', email: 'soporte@josuecalderon.lat' },
        to: [{ email: 'soporte@josuecalderon.lat' }],
        subject: '⚠️ Soporte acceso — compradora necesita ayuda',
        htmlContent: `<h2>Compradora necesita reenvío de acceso</h2><p><strong>Nombre:</strong> ${nombre||'No disponible'}</p><p><strong>WhatsApp:</strong> <a href="https://wa.me/${String(phone).replace(/[^0-9]/g,'')}">Escribirle aquí</a></p><p><strong>Correo:</strong> ${correoCliente}</p><p><strong>Acción:</strong> Buscar en Hotmart y reenviar acceso.</p>`
      })
    });
    console.log('Soporte notificado ✓');
  } catch (err) {
    console.error('notificarSoporte error:', err.message);
  }
}
