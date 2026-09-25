// public/mi-espacio/experiencia-gratuita.js — Puerta 2, Slice 4: fuente única
// de la lógica de la tarjeta de experiencia gratuita (espera/en_vivo/replay).
//
// Extraído de public/mi-espacio/index.html sin cambiar su comportamiento —
// lo usan dos superficies distintas:
//   - public/mi-espacio/index.html (dentro del shell completo, ms-clase-card)
//   - public/clase-gratuita/index.html (sala aislada, Slice 4)
// Una sola fuente de verdad para no terminar con dos versiones de
// espera→en_vivo→replay que un día se contradigan.
//
// Contrato implícito: quien cargue este script debe declarar, antes de
// llamar a msRenderClaseGratuita(), una variable global `dbExperienciaGratuita`
// (objeto experienciaGratuitaActiva de Orbit, o null) y los elementos del DOM
// con los ids que usa msTickClaseGratuita (ms-clase-eyebrow, ms-clase-title,
// ms-clase-sub, ms-clase-countdown, ms-clase-cd-{d,h,m,s}, ms-clase-video,
// ms-clase-btn, ms-clase-calendario, ms-clase-card).
//
// Puerta 5 — Ensayo General, Estación 3 (2026-09-14): CTA comercial hacia
// Código Soberana, opcional — solo se activa si quien carga el script
// TAMBIEN declara una variable global `dbOportunidadBootcamp` (objeto
// oportunidadBootcampActiva de Orbit, o null) y los elementos
// ms-clase-cta-label/ms-clase-cta-comercial. Ninguno de los dos es
// obligatorio (mismo guard `if (elemento)` que ya usa ms-clase-grupo) —
// /mi-espacio no los declara (tiene su propia tarjeta de Bootcamp separada)
// y sigue funcionando exactamente igual que antes de este corte.
//
// Script clásico, sin módulos — mismo estilo que el resto del proyecto (sin
// bundler, cada página se basta con <script src="...">).

// Reloj QA (hallazgo 2026-09-23, prueba real en Preview): el botón "Entrar a
// tu sesión" abre /sala en una pestaña nueva — depender solo de la cookie
// qa_reloj_* para cruzar esa frontera de pestaña resultó frágil en algunos
// navegadores móviles (la cookie no llegaba, /sala caía al reloj real vía
// resolverAhoraQA fail-closed). /sala/index.html ya sabe leer
// ?qaReloj=&qaAhora= de su propia URL como mecanismo independiente — esto
// solo lo alimenta, leyendo lo que cgCapturarQaRelojDeUrl ya guardó en
// sessionStorage en esta misma carga de página. Inerte fuera de una prueba
// QA: sessionStorage nunca tiene estas claves en uso real.
function msSufijoQaRelojSala() {
  try {
    const secreto = sessionStorage.getItem('qaRelojSecreto');
    const simulado = sessionStorage.getItem('qaRelojSimulado');
    if (!secreto || !simulado) return '';
    return '&qaReloj=' + encodeURIComponent(secreto) + '&qaAhora=' + encodeURIComponent(simulado);
  } catch (err) {
    return '';
  }
}

// Espejo mínimo de dbTickCountdown (usada para el countdown de un Programa
// comprado) — mismos 4 campos (d/h/m/s), prefijo de ids parametrizado para
// no duplicar la lógica de formateo.
function dbFmt(n) { return String(n).padStart(2, '0'); }

function dbFmtCountdown(prefijo, diffMs) {
  const diff = Math.max(0, diffMs);
  document.getElementById(prefijo + '-d').textContent = dbFmt(Math.floor(diff / 86400000));
  document.getElementById(prefijo + '-h').textContent = dbFmt(Math.floor((diff % 86400000) / 3600000));
  document.getElementById(prefijo + '-m').textContent = dbFmt(Math.floor((diff % 3600000) / 60000));
  document.getElementById(prefijo + '-s').textContent = dbFmt(Math.floor((diff % 60000) / 1000));
}

// ── Puerta 2, Slice 5 — tarjeta de experienciaGratuitaActiva (tier 1). ──
// fase en {'espera','en_vivo','replay'} — 'vencido' no existe como valor,
// es la ausencia del campo (dbExperienciaGratuita === null) — cada
// superficie decide qué hacer con esa ausencia (Mi Espacio la oculta y cae
// en su bienvenida genérica; la sala aislada, Slice 4, muestra su propio
// estado "finalizada" — esa decisión vive fuera de este archivo).
function msFinClaseMs(exp) { return new Date(exp.fechaHora).getTime() + exp.duracionEstimada * 1000; }
// Puerta 5 — Ensayo General, Estación 3, PRIORIDAD MAXIMA (2026-09-14): el
// vencimiento del replay YA NO es fechaHora+duracion+ventanaReplayHoras (72h
// fijas) — es exactamente el cierre de la ventana comercial del Bootcamp,
// que Orbit ya calcula y expone como `vigenteHasta` (ISO). El frontend NUNCA
// vuelve a inventar esta fecha — msFinReplayMs queda retirada a proposito
// (usar exp.vigenteHasta directamente, ver el countdown de 'replay' abajo).

// Puerta 5 — Ensayo General (hallazgo real 2026-09-14): msTickClaseGratuita
// corre cada 1s para refrescar el contador, pero el video de replay NUNCA
// debe reconstruirse en cada tick — recrear el <iframe> cada segundo lo
// hace parpadear y nunca reproducir (cualquier intento de play se borra un
// segundo despues). Este flag recuerda que enlace ya quedo pintado, para
// que el iframe se cree una sola vez por carga de pagina.
let _msUltimoVideoReplayRenderizado = null;

// Puerta 5 — Ensayo General, Estación 3 (decision de negocio cerrada
// 2026-09-14, PRIORIDAD MAXIMA): la Masterclass gratuita es la puerta de
// entrada a Código Soberana, no un fin en si misma — la CTA comercial debe
// existir desde en_vivo y permanecer durante todo el replay (72h), nunca
// esperar a que la experiencia gratuita venza. Mismo checkout permanente
// que ya usa /mi-espacio (ms-bootcamp-abierto-btn, BOOTCAMP_CHECKOUT_URL en
// mi-espacio/index.html) — const CON OTRO NOMBRE a proposito: mi-espacio
// carga este archivo Y declara su propio BOOTCAMP_CHECKOUT_URL en su script
// inline, en el mismo scope global de esa pagina — dos `const` con el mismo
// nombre ahi chocarian (SyntaxError). Si el valor del checkout cambia,
// actualizar los DOS lugares (no hay bundler, cada pagina se basta con su
// propio <script src>, ver encabezado de este archivo).
const CODIGO_SOBERANA_CHECKOUT_URL = 'https://pay.hotmart.com/A107564829Y?bid=1789093799825';

// Puerta 5, Estación 7 (Zoom embebido completo, diseño cerrado 2026-09-15):
// opt-in EXPLICITO — solo /clase-gratuita declara
// `window.msHabilitarZoomEmbebido = true` antes de cargar este script.
// /mi-espacio comparte los mismos ids (ms-clase-btn/ms-clase-video, ver
// encabezado del archivo) pero NUNCA declara ese flag, asi que su tarjeta
// sigue exactamente igual que siempre (enlace externo plano) — este cambio
// no le afecta en absoluto. Requiere ademas que la pagina defina
// `window.abrirZoomEmbebido` (cargando /mi-espacio/zoom-embed.js antes de
// este script) y opcionalmente `window.msObtenerHeadersQaReloj` (para el
// reloj QA de ensayo, mismo mecanismo todo-o-nada que el resto de la Puerta 5).
function msPrepararBotonZoomEmbebido(btn, video) {
  // msTickClaseGratuita corre cada 1s (mismo patron que el resto de este
  // archivo) — una vez que el embed arranco con exito (dataset.zoomEmbedActivo),
  // nunca se vuelve a tocar el display aqui, o el siguiente tick lo ocultaria
  // un segundo despues de mostrarlo.
  if (video.dataset.zoomEmbedActivo) return;
  video.style.display = 'none'; // se muestra solo si el embed realmente arranca
  if (!window.msHabilitarZoomEmbebido || typeof window.abrirZoomEmbebido !== 'function') return;
  if (btn.dataset.zoomEmbedWired) return; // idempotente entre ticks de msTickClaseGratuita
  btn.dataset.zoomEmbedWired = '1';
  const enlaceOriginal = btn.href;
  const textoOriginal = btn.textContent;
  btn.addEventListener('click', function (ev) {
    ev.preventDefault();
    btn.textContent = 'Conectando…';
    window.abrirZoomEmbebido({
      obtenerJoinInfo: () => fetch('/api/mi-espacio-auth?accion=masterclass-zoom-join', {
        credentials: 'include',
        headers: (window.msObtenerHeadersQaReloj && window.msObtenerHeadersQaReloj()) || {},
      }).then((r) => r.json()),
      contenedorId: video.id,
      enlaceGenericoRespaldo: enlaceOriginal,
      onExito: function () {
        video.dataset.zoomEmbedActivo = '1';
        btn.style.display = 'none';
        video.style.display = 'block';
      },
      onFallback: function (motivo, enlace) {
        btn.textContent = textoOriginal;
        window.open(enlace || enlaceOriginal, '_blank', 'noopener');
      },
    });
  });
}

// ── Transición automática espera → en_vivo (SIMULIVE, diseño cerrado
// 2026-09-24) ────────────────────────────────────────────────────────
// Mismo patrón que wbProgramarTransicionHitos/wbRevaluarHitos
// (public/workbook/index.html): un solo setTimeout hacia el instante
// exacto (nunca polling), corregido contra el reloj del servidor, con
// visibilitychange/pageshow/focus como red de seguridad — nunca el
// disparador principal. A diferencia de Workbook, aquí SÍ hace falta una
// llamada real de red al llegar la hora: la fase la decide Orbit, no una
// resta de fechas en el cliente.
let _msOffsetServidorMs = 0;
let _msTimerTransicionSimulive = null;
let _msNavegandoASala = false;
let _msRevaluandoExperiencia = false;

// Quien cargue este script puede llamar a esto con la respuesta de
// CUALQUIER fetch propio para corregir el reloj — opcional; sin esto se
// usa Date.now() tal cual, igual que siempre.
function msRegistrarHoraServidor(res) {
  try {
    const cab = res && res.headers && res.headers.get && res.headers.get('Date');
    const t = cab ? Date.parse(cab) : NaN;
    if (isFinite(t)) _msOffsetServidorMs = t - Date.now();
  } catch (err) { /* sin cabecera: se usa el reloj del dispositivo */ }
}
function msAhoraMs() { return Date.now() + _msOffsetServidorMs; }

function msProgramarTransicionSimulive(exp) {
  if (_msTimerTransicionSimulive) { clearTimeout(_msTimerTransicionSimulive); _msTimerTransicionSimulive = null; }
  if (!exp || exp.fase !== 'espera') return;
  const instanteMs = new Date(exp.fechaHora).getTime();
  const demora = Math.max(instanteMs - msAhoraMs() + 300, 250); // 300ms de margen: que el reloj ya haya cruzado la hora
  if (demora > 2147483647) return; // tope de setTimeout (~24 dias); las señales de respaldo cubren el resto
  _msTimerTransicionSimulive = setTimeout(function () {
    _msTimerTransicionSimulive = null;
    msRevaluarExperienciaGratuita();
  }, demora);
}

// Disparador de respaldo (visibilitychange/pageshow/focus): solo actúa
// si el reloj corregido ya alcanzó la hora de la sesión — mientras
// falte, el setTimeout ya programado sigue siendo la única fuente de
// verdad, esto no lo reemplaza ni compite con él.
function msRevaluarSiYaEsHora() {
  const exp = dbExperienciaGratuita;
  if (!exp || exp.fase !== 'espera') return;
  if (msAhoraMs() < new Date(exp.fechaHora).getTime()) return;
  msRevaluarExperienciaGratuita();
}

// Vuelve a consultar el estado real. La página que carga este archivo
// define `window.msRecargarExperienciaGratuita` apuntando a SU PROPIA
// función de carga (mismo patrón todo-o-nada que
// window.abrirZoomEmbebido/msObtenerHeadersQaReloj más abajo en este
// archivo) — sin ese hook, esta función no hace nada.
function msRevaluarExperienciaGratuita() {
  if (_msRevaluandoExperiencia || _msNavegandoASala) return;
  if (typeof window.msRecargarExperienciaGratuita !== 'function') return;
  _msRevaluandoExperiencia = true;
  Promise.resolve(window.msRecargarExperienciaGratuita()).finally(function () {
    _msRevaluandoExperiencia = false;
  });
}

(function msActivarRevaluacionExperienciaGratuita() {
  if (window.__msRevaluacionExperienciaActiva) return;
  window.__msRevaluacionExperienciaActiva = true;
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') msRevaluarSiYaEsHora();
  });
  window.addEventListener('pageshow', function () { msRevaluarSiYaEsHora(); });
  window.addEventListener('focus', function () { msRevaluarSiYaEsHora(); });
})();

function msRenderClaseGratuita() {
  clearInterval(window._msClaseInterval);
  _msUltimoVideoReplayRenderizado = null;
  const card = document.getElementById('ms-clase-card');
  if (!dbExperienciaGratuita) { card.style.display = 'none'; msProgramarTransicionSimulive(null); return; }

  card.style.display = 'block';
  msProgramarTransicionSimulive(dbExperienciaGratuita);
  msTickClaseGratuita();
  window._msClaseInterval = setInterval(msTickClaseGratuita, 1000);
}

function msTickClaseGratuita() {
  const exp = dbExperienciaGratuita;
  if (!exp) return;
  const eyebrow = document.getElementById('ms-clase-eyebrow');
  const title = document.getElementById('ms-clase-title');
  const sub = document.getElementById('ms-clase-sub');
  const countdown = document.getElementById('ms-clase-countdown');
  const video = document.getElementById('ms-clase-video');
  const btn = document.getElementById('ms-clase-btn');
  const cal = document.getElementById('ms-clase-calendario');
  const grupo = document.getElementById('ms-clase-grupo');
  const ctaLabel = document.getElementById('ms-clase-cta-label');
  const ctaComercial = document.getElementById('ms-clase-cta-comercial');

  const fechaTexto = new Date(exp.fechaHora).toLocaleString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });

  if (exp.fase === 'espera') {
    eyebrow.textContent = 'Tu próxima clase';
    title.textContent = fechaTexto;
    sub.textContent = 'Tu lugar ya está reservado. Te avisamos aquí mismo cuando empiece.';
    countdown.style.display = 'flex';
    dbFmtCountdown('ms-clase-cd', new Date(exp.fechaHora).getTime() - Date.now());
    video.style.display = 'none';
    btn.style.display = 'none';
    cal.style.display = 'inline-block';
    cal.href = msLinkCalendario(exp);
  } else if (exp.fase === 'en_vivo' && exp.modalidad === 'simulive') {
    // SIMULIVE — puente sala real (diseño cerrado 2026-09-23): nunca Zoom,
    // nunca el mensaje "el enlace llega en un momento" (ese es exclusivo de
    // LIVE, para cuando el link de Zoom todavía no se generó — SIMULIVE no
    // tiene ese problema, la sala siempre está lista). Nomenclatura
    // congelada: nunca presentar el contenido pregrabado como si fuera un
    // LIVE real.
    eyebrow.textContent = 'Sesión programada';
    title.textContent = 'Tu sesión está comenzando…';
    sub.textContent = 'Te llevamos a tu sesión en un momento.';
    countdown.style.display = 'none';
    cal.style.display = 'none';
    video.style.display = 'none';
    btn.style.display = 'inline-block';
    btn.href = '/sala?convocatoriaId=' + encodeURIComponent(exp.convocatoriaId) + msSufijoQaRelojSala();
    btn.textContent = 'Entrar a tu sesión →';
    // Autoingreso (diseño 2026-09-24): nunca esperar un clic — el botón
    // sigue visible como respaldo manual, pero se navega sola a los
    // 1200ms usando btn.href (la MISMA url ya asignada arriba, nunca
    // reconstruida). _msNavegandoASala es el guard idempotente: sin él,
    // cada tick del countdown (cada 1s) o cada visibilitychange/pageshow/
    // focus que llegue mientras la página todavía no terminó de
    // descargarse volvería a programar otra navegación.
    if (!_msNavegandoASala) {
      _msNavegandoASala = true;
      setTimeout(function () { window.location.href = btn.href; }, 1200);
    }
  } else if (exp.fase === 'en_vivo') {
    eyebrow.textContent = '🔴 En vivo ahora';
    title.textContent = 'Tu clase está en curso';
    sub.textContent = 'Entra a tu clase en vivo.';
    countdown.style.display = 'none';
    cal.style.display = 'none';
    if (exp.enlaceEnVivo) {
      btn.style.display = 'inline-block';
      btn.href = exp.enlaceEnVivo;
      btn.textContent = 'Entrar a la clase →';
      msPrepararBotonZoomEmbebido(btn, video);
    } else {
      video.style.display = 'none';
      btn.style.display = 'inline-block';
      btn.removeAttribute('href');
      btn.textContent = 'El enlace llega en un momento';
    }
  } else if (exp.fase === 'replay' && exp.modalidad === 'simulive') {
    // SIMULIVE — puerta de replay (diseño cerrado 2026-09-25, hallazgo real
    // en teléfono real): a diferencia de LIVE, SIMULIVE nunca llena
    // enlaceReplay — su replay vive enteramente en /sala (mismo motor que
    // ya sirve en_vivo, ver sala-simulive.js), nunca en un video aparte.
    // Sin esta rama, caía en el `else` de abajo (pensado solo para LIVE) y
    // mostraba "video pendiente" sin ningún botón — ninguna mujer podía
    // volver a su replay desde /clase-gratuita (el único destino que
    // reciben los correos/WhatsApp de recordatorio). Sin autoingreso, a
    // diferencia de en_vivo+simulive: puede volver días después (vigenteHasta
    // sigue gobernando la ventana), primero decide si quiere verlo.
    eyebrow.textContent = 'Disponible en tu espacio';
    title.textContent = 'Revive tu clase';
    sub.textContent = 'Disponible por tiempo limitado.';
    countdown.style.display = 'flex';
    dbFmtCountdown('ms-clase-cd', new Date(exp.vigenteHasta).getTime() - Date.now());
    cal.style.display = 'none';
    video.style.display = 'none';
    btn.style.display = 'inline-block';
    btn.href = '/sala?convocatoriaId=' + encodeURIComponent(exp.convocatoriaId) + msSufijoQaRelojSala();
    btn.textContent = 'Entrar a tu replay →';
  } else { // 'replay' (LIVE, con enlaceReplay — sin cambios)
    // Puerta 5, Estación 7 (ciclo de vida del embed, diseño cerrado
    // 2026-09-15): si el embed de Zoom llegó a estar activo (en_vivo), esta
    // es la transición en_vivo -> replay — cierra la sesión de Zoom ANTES
    // de que el código de abajo reemplace video.innerHTML con el iframe de
    // Bunny, para no dejar un cliente de Zoom vivo detrás de un DOM que ya
    // no lo muestra. Solo se dispara una vez (el flag se borra de
    // inmediato), no en cada tick de los que siguen ya en fase replay.
    if (video.dataset.zoomEmbedActivo) {
      delete video.dataset.zoomEmbedActivo;
      if (typeof window.cerrarZoomEmbebidoActivo === 'function') window.cerrarZoomEmbebidoActivo();
    }
    eyebrow.textContent = 'Disponible en tu espacio';
    title.textContent = 'Revive tu clase';
    countdown.style.display = 'flex';
    dbFmtCountdown('ms-clase-cd', new Date(exp.vigenteHasta).getTime() - Date.now());
    cal.style.display = 'none';
    btn.style.display = 'none';
    video.style.display = 'block';
    sub.textContent = exp.enlaceReplay ? 'Disponible por tiempo limitado.' : 'El video se activa aquí apenas esté listo.';
    // Solo se toca el DOM del video cuando el enlace efectivamente cambia
    // (primera vez que se pinta esta pagina) — nunca en cada tick del
    // contador, para no destruir un video que ya esta reproduciendose.
    if (_msUltimoVideoReplayRenderizado !== (exp.enlaceReplay || null)) {
      video.innerHTML = exp.enlaceReplay
        ? '<iframe src="' + exp.enlaceReplay + '" allow="autoplay;fullscreen" allowfullscreen></iframe>'
        : '<p style="display:flex;align-items:center;justify-content:center;height:100%;font-family:\'Jost\',sans-serif;font-size:13px;color:var(--text-muted);padding:20px;text-align:center;">Video pendiente — se activa aquí apenas se suba la grabación.</p>';
      _msUltimoVideoReplayRenderizado = exp.enlaceReplay || null;
    }
  }

  // Puerta 5 — Ensayo General, Estación 3 (decision de negocio cerrada
  // 2026-09-14, PRIORIDAD MAXIMA): CTA comercial hacia Código Soberana.
  // `exp.dentroVentanaCtaComercial` (calculado por Orbit) YA encierra toda
  // la logica de "¿en que momento debe verse?" — en 'espera' es false, en
  // 'en_vivo' es true SOLO en los ultimos minutos antes de finClase
  // (nunca desde el minuto 0 — no competir con la experiencia de la clase,
  // ni depende de cuanto tiempo lleva ELLA en la pagina), en 'replay' es
  // siempre true. El frontend nunca vuelve a calcular ninguna fecha aqui —
  // solo combina esa señal con oportunidadBootcampActiva.abierta: si la
  // Persona ya tiene acceso vigente a Código Soberana, Orbit devuelve
  // oportunidadBootcampActiva:null y esta CTA jamas se ofrece (nunca se le
  // vuelve a vender lo que ya tiene). Mismo guard `if (elemento)` que
  // `grupo` arriba — /mi-espacio no declara estos ids en su propio
  // ms-clase-card (tiene su propia tarjeta de Bootcamp separada,
  // ms-bootcamp-abierto-card en mi-espacio/index.html), asi que esto no le
  // afecta en absoluto.
  const mostrarCtaComercial = !!exp.dentroVentanaCtaComercial &&
    !!dbOportunidadBootcamp && dbOportunidadBootcamp.abierta === true;
  if (ctaComercial) {
    ctaComercial.style.display = mostrarCtaComercial ? 'inline-block' : 'none';
    if (mostrarCtaComercial) ctaComercial.href = CODIGO_SOBERANA_CHECKOUT_URL;
  }
  if (ctaLabel) ctaLabel.style.display = mostrarCtaComercial ? 'block' : 'none';

  // Puerta 2 — Slice 6: enlace del grupo de WhatsApp asignado a la
  // convocatoria (rotación 1→2→3→4→1). Se muestra en espera y en replay
  // (unirse al grupo tiene sentido ahi), pero NUNCA en en_vivo — decision
  // de negocio cerrada 2026-09-14 (Ensayo General, Estación 4): a la hora
  // de entrar a la clase queremos una sola jerarquia (entrar a la clase),
  // sin una segunda puerta compitiendo al lado. El grupo ya cumplio su
  // funcion antes de este momento.
  // Puerta 5 — Ensayo General, Estación 3 (2026-09-14): tampoco se muestra
  // cuando la CTA comercial esta activa — "no debe competir" (requisito
  // explicito de negocio). Esto es una supresion mecanica, NO el
  // rediseño/copy de WhatsApp en replay que sigue pendiente aparte, sin
  // tocar, como ajuste UX independiente.
  // Solo se muestra ademas si Orbit ya tiene un enlace real configurado
  // (nunca se inventa uno) — `grupo` puede no existir en el DOM de paginas
  // que no incluyan este boton, por eso el guard.
  if (grupo) {
    if (exp.fase !== 'en_vivo' && !mostrarCtaComercial && exp.enlaceGrupoWhatsapp) {
      grupo.href = exp.enlaceGrupoWhatsapp;
      grupo.style.display = 'inline-block';
    } else {
      grupo.style.display = 'none';
    }
  }
}

// "Añadir al calendario" (Estado 1, sección 4 del documento de
// experiencia) — enlace de Google Calendar, sin dependencias nuevas.
// Título deliberadamente neutral (decisión de producto 2026-09-09): esta
// experiencia es autónoma y sin venta — el evento de calendario nunca debe
// mencionar Código Soberana, para no anticipar una oferta antes de tiempo.
function msLinkCalendario(exp) {
  const inicio = new Date(exp.fechaHora);
  const fin = new Date(msFinClaseMs(exp));
  const fmt = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: 'Clase gratuita — He intentado todo y nada cambia',
    dates: fmt(inicio) + '/' + fmt(fin),
    details: 'Tu clase reservada dentro de Mi Espacio.',
  });
  return 'https://www.google.com/calendar/render?' + params.toString();
}
