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
function msFinReplayMs(exp) { return msFinClaseMs(exp) + exp.ventanaReplayHoras * 3600000; }

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

function msRenderClaseGratuita() {
  clearInterval(window._msClaseInterval);
  _msUltimoVideoReplayRenderizado = null;
  const card = document.getElementById('ms-clase-card');
  if (!dbExperienciaGratuita) { card.style.display = 'none'; return; }

  card.style.display = 'block';
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
  } else if (exp.fase === 'en_vivo') {
    eyebrow.textContent = '🔴 En vivo ahora';
    title.textContent = 'Tu clase está en curso';
    sub.textContent = 'Entra a tu clase en vivo.';
    countdown.style.display = 'none';
    video.style.display = 'none';
    cal.style.display = 'none';
    if (exp.enlaceEnVivo) {
      btn.style.display = 'inline-block';
      btn.href = exp.enlaceEnVivo;
      btn.textContent = 'Entrar a la clase →';
    } else {
      btn.style.display = 'inline-block';
      btn.removeAttribute('href');
      btn.textContent = 'El enlace llega en un momento';
    }
  } else { // 'replay'
    eyebrow.textContent = 'Disponible en tu espacio';
    title.textContent = 'Revive tu clase';
    countdown.style.display = 'flex';
    dbFmtCountdown('ms-clase-cd', msFinReplayMs(exp) - Date.now());
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
  // 2026-09-14, PRIORIDAD MAXIMA): CTA comercial hacia Código Soberana,
  // visible en en_vivo Y en replay por igual — nunca se espera a que el
  // replay venza. Se condiciona a oportunidadBootcampActiva.abierta (nunca
  // solo a la fase): si la Persona ya tiene acceso vigente a Código
  // Soberana, Orbit devuelve oportunidadBootcampActiva:null y esta CTA
  // jamas se ofrece (nunca se le vuelve a vender lo que ya tiene). Mismo
  // guard `if (elemento)` que `grupo` arriba — /mi-espacio no declara estos
  // ids en su propio ms-clase-card (tiene su propia tarjeta de Bootcamp
  // separada, ms-bootcamp-abierto-card en mi-espacio/index.html), asi que
  // esto no le afecta en absoluto.
  const mostrarCtaComercial = (exp.fase === 'en_vivo' || exp.fase === 'replay') &&
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
