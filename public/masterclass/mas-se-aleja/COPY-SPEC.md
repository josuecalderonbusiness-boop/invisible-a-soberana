# Masterclass "Más Se Aleja" — Spec de Copy, Diseño y Comportamiento

**Archivo fuente:** `public/masterclass/mas-se-aleja/index.html`
**URL en vivo:** `he-intentado-todo-porque-nada-cambia.josuecalderon.lat` (subdominio propio; la ruta anterior `josuecalderon.lat/masterclass/mas-se-aleja` fue dada de baja y redirige a home)
**Última actualización de este documento:** 2026-07-24 (reflejando el estado real del código a esa fecha)

Este documento describe la landing tal como existe hoy en producción: cada texto, color, fuente, tiempo de animación y regla de comportamiento. Está pensado para que un auditor (humano o IA) pueda revisar la coherencia de copy, diseño y UX sin tener que leer el HTML/CSS/JS directamente.

---

## 1. Identidad de marca y sistema de diseño

### 1.1 Paleta de colores (variables CSS `:root`)

| Variable | Hex | Uso |
|---|---|---|
| `--wine-deep` | `#3D0C11` | Fondo base, acentos profundos |
| `--wine-primary` | `#6B1A2A` | Bordes, acentos |
| `--wine-medium` | `#8B2D3F` | Textos sobre crema (agenda), precios |
| `--wine-light` | `#A84455` | — |
| `--gold-deep` | `#7A5C1E` | Extremo oscuro de gradientes dorados |
| `--gold-primary` | `#B8892A` | Color de acento principal (eyebrows, iconos, bordes) |
| `--gold-medium` | `#D4A843` | Medio de gradientes dorados |
| `--gold-light` | `#E8C870` | Texto dorado claro, énfasis (`<strong>`) |
| `--charcoal-deep` | `#221214` | Fondo base del body |
| `--charcoal` | `#2A1C21` | Fondo de s6/s7 (zona post-video, apenas más clara) |
| `--charcoal-soft` | `#3A2830` | — |
| `--text-light` | `#F0E6EA` | Texto principal sobre fondo oscuro |
| `--text-muted` | `#C4A8B0` | Texto secundario/labels |
| `--cream-warm` | `#F9F3E8` | Fondo de las tarjetas de agenda |

**Regla de "temperatura por zona":** toda la página usa la misma familia burgundy/vino — nunca hay degradado hacia otro color de marca. Hero + Video (s1–s5): burgundy profundo (`--charcoal-deep`, el color base). Después del video (s6–s7): apenas más claro (`--charcoal`), casi imperceptible. Zona CTA (s8 en adelante): vuelve al profundo.

### 1.2 Fuentes

```
--font-display: 'Playfair Display', Georgia, serif   → titulares grandes, precios de marca, wordmark
--font-body:    'Inter', sans-serif                    → texto de cuerpo por defecto (sans-serif)
--font-elegant: 'Cormorant Garamond', Georgia, serif   → cursiva — uso MUY restringido (ver 1.3)
'Jost', sans-serif                                     → labels, botones, metadatos, precios pequeños
```

### 1.3 Regla de la cursiva (Cormorant Garamond)

**Decisión de marca: la cursiva NO es la fuente por defecto de la landing.** `.mc-line` y `.mc-imagine-line` (las clases de texto narrativo) usan Inter (sans-serif) por defecto. La cursiva queda reservada, exclusivamente, a estos puntos:

1. **s1–s4** ("Has intentado hablar.", "Has intentado esperar.", "Has intentado cambiar tú.", "Y aun así... nada cambia.") — vía la clase `.mc-letter-line`. Letras grandes (32–50px), es la "carta" de apertura.
2. **s7, primera línea:** "Sé que esa pregunta te incomodó." — vía clase `.mc-cursive` puesta a mano.
3. **s8:** "en solo 90 minutos." — vía selector `#mc-pause-90` puesto a mano.
4. **s5:** los puntos suspensivos "···" antes del reveal post-video (`.mc-reveal-ellipsis`) — es puntuación, no una frase.
5. **Cierre de la página:** la cita de Josué, `"Hay relaciones que cambian cuando una mujer deja de sobrevivir… y vuelve a vivir." — Josué Calderón` (`.mc-quote-signature`).

Todo lo demás —incluyendo el resto de s6, s7, s8, la agenda, el chat, el footer— usa Inter o Jost.

### 1.4 Botones

**Botón CTA dorado** (`.mc-btn`) — mismo gradiente en toda la marca:
```css
background: linear-gradient(135deg, gold-deep, gold-primary, gold-medium, gold-primary, gold-deep);
background-size: 300% 100%;
color: charcoal-deep; border-radius: 12px;
font: Inter 15px/700, letter-spacing .3px
box-shadow: 0 8px 28px rgba(184,137,42,.4)
animación: mcCtaPulse (pulso de sombra, 2.4s) + mcGoldShift (el gradiente "respira", 3s), ambas infinitas
```

**Flechas de continuar** (`.mc-continue`) — icono chevron, 18×18, `stroke:#B8892A`, opacidad .7→1 en hover, rebote infinito (`mcBounce`, vertical, 1.8s). Variante horizontal `mcBounceRight` para las flechas que apuntan a la derecha (ver 1.5).

**Etiqueta tipo "pill"** (`.mc-answer-btn span`, usada en "Responderla ↓") — borde fino 1px `rgba(184,137,42,.45)`, relleno tenue `rgba(184,137,42,.08)`, `border-radius:999px`. Deliberadamente NO es un botón sólido de compra — es una invitación a continuar, no a pagar.

### 1.5 Dirección de las flechas — regla narrativa

- **Flechas hacia abajo** (chevron `M6 9l6 6 6-6`): el patrón por defecto, "sigue bajando".
- **Flechas hacia la derecha** (chevron `M9 6l6 6-6 6`, rebote `mcBounceRight` horizontal): se usan en momentos que se sienten como "pedir algo, no solo avanzar": "Responderla" (s5), "Cuéntame más" (s8, pausa), la flecha bajo los checks (s8), y la flecha al final de la primera hoja de agenda (`#mc-agenda-continue`). El clic en estas SIEMPRE acelera la secuencia — nunca es la única forma de avanzar (ver 1.7).

### 1.7 Filosofía de navegación — guiar, no retener

**Regla de marca (decisión de UX explícita, 2026-07-24):** la diferencia entre "la página me está guiando" y "la página no me deja bajar" es enorme y decisiva para que esta landing no se sienta manipulativa. Por eso:

- **El scroll NUNCA está bloqueado**, salvo dos puntos justificados (ver abajo). El resto de la landing (s1–s4, s6–s9, carta, footer) permite scroll libre en ambas direcciones en todo momento.
- **Los botones/flechas son el gesto recomendado, no el único gesto permitido.** Sirven para comunicar "hay algo más" y para acelerar momentos con secuencias temporizadas (s8) — pero si la usuaria no los toca, la secuencia avanza sola (`waitForClickOrAuto`, 3.5s). Nunca queda "atrapada" esperando una acción obligatoria.
- **Los únicos dos bloqueos reales de toda la landing son el video (s5→s6, `mcUnlockScroll`) y el chat de WhatsApp hasta el primer audio (`mcUnlockChatScroll`, ver 3.1).** Ambos tienen la misma justificación narrativa: "quiero mostrarte/contarte algo antes de que sigas" — no es simplemente "no te dejo bajar", es contenido que debe experimentarse antes de la siguiente revelación. Bloquean **en ambas direcciones** (ni arriba ni abajo) mientras la posición está dentro de su zona (no solo un flag `locked`), con salida de seguridad automática por tiempo (100s el video, 60s el chat). Fuera de esas zonas y después de desbloquearse, el scroll es completamente normal en ambas direcciones.
  - **Detalle técnico importante:** interceptar `wheel`/`touchmove` evento por evento con `preventDefault()` NO alcanza — un scroll con impulso (inercia de trackpad o mobile, o un gesto rápido) sigue moviéndose después de que el evento terminó, sin disparar más eventos que interceptar (confirmado con pruebas reales: el scroll atravesaba el bloqueo). La solución real es congelar el `<body>` por completo (`position:fixed` + `top` negativo igual al scroll actual) apenas la posición entra en la zona bloqueada — así no queda nada que scrollear, sin importar el impulso. Se libera restaurando `position` y haciendo `scrollTo` a la posición exacta guardada.
- El efecto cinematográfico de "una idea a la vez" ya lo logra el `scroll-snap-type: y proximity` del contenedor — no hace falta bloquear el scroll para conseguirlo. Alguien que llega scrolleando desde Instagram no debería sentir que la página "le dice que no": eso hace que el cerebro se ponga a resolver la interfaz en vez de sentir el mensaje.

### 1.6 Efecto "reveal" (aparición al hacer scroll)

```css
.reveal { opacity:0; transform:translateY(8px); filter:blur(4px);
  transition: 1.6s cubic-bezier(.16,1,.3,1) en opacity/transform/filter; }
.reveal.in { opacity:1; transform:translateY(0); filter:blur(0); }
```
Se activa vía `IntersectionObserver` (threshold 0.2) sobre **todos** los elementos `.reveal` de la página, una sola vez cada uno (`unobserve` tras disparar).

Variante **`.reveal-side`**: en vez de subir, entra desde la derecha (`translateX(60px)→0`). Se usa en la segunda tarjeta de agenda (s9) para que se sienta como "la hoja siguiente", no como el resto de las pantallas.

Variante **`.reveal-letter`** (solo s1–s4): blur más fuerte (12px) y más recorrido (34px), transición más larga (1.9s) — entrada más dramática para la "carta" de apertura.

---

## 2. Estructura de pantallas (scroll-snap, una idea a la vez)

Contenedor `#mc-scroll` con `scroll-snap-type: y proximity`. Cada `.screen` es `min-height:100vh`, contenido centrado. Puntos de progreso fijos a la derecha (`#mc-dots`, 9 puntos, ocultos en móvil <480px).

### s1 — "Has intentado hablar."
- Solo esa línea, cursiva, grande. Flecha abajo → s2.

### s2 — "Has intentado esperar."
- Igual patrón. Flecha abajo → s3.

### s3 — "Has intentado cambiar tú."
- Igual patrón. Flecha abajo → s4.

### s4 — "EL GIRO"
- "Y aun así...<br>**nada cambia.**" — un solo bloque, entra todo junto (sin delay separado; antes "nada cambia." entraba 1s después, pero si la usuaria desliza rápido sin leer se rompía la intención del mensaje). Flecha abajo → s5.

### s5 — VIDEO
- Kicker: "ANTES DE RESERVAR TU LUGAR..." (Jost 12px, uppercase, letter-spacing 2.5px, dorado)
- Subtexto (delay 1.8s): "Quiero mostrarte en menos de 2 minutos por qué todo lo que has intentado hasta hoy no produjo el cambio que esperabas."
- Video embebido (Bunny Stream, ID `d7f15362-7aa9-4010-9d5b-537c62708489`, library `711470`), **duración real: 112s (1:52)**.
  - Carga con `autoplay=true&muted=true` — arranca solo, en silencio.
  - Filtro de blur que se aclara en 6s (`mcVideoBlurClear`: 26px→11px) + capa de tinte vino que se aclara igual (`mcTintClear`: opacidad 1→.55).
  - Botón "▶ Activa el sonido" pulsante sobre el video. Al hacer clic (`unmuteVideo()`): recarga el iframe con `muted=false` desde el segundo 0 (reinicio completo, no un "unmute" del estado actual — es más confiable que depender de que Bunny responda comandos). Quita el blur/tinte, oculta kicker y subtexto en secuencia (0ms, 450ms). El video se queda centrado en la pantalla — ya no sube ni se reancla arriba (así era antes; se quitó deliberadamente).
- **Reveal post-video** — dispara con un temporizador fijo a **109s** (3 segundos antes de que termine el video de 112s), NO con eventos del reproductor (el protocolo Player.js de Bunny no era confiable):
  1. Texto grande (Jost 700, dorado): "... hay una pregunta que no puedo responder por ti." (entra con blur)
  2. delay .8s → puntos suspensivos "···" (cursiva, ver 1.3)
  3. delay 2s → pill "Responderla ↓" (apunta a la derecha, rebote horizontal) — es decir, 2 segundos después del mensaje
  4. Al hacer scroll se desbloquea el avance (antes de esto, scroll/wheel/touch/teclado hacia abajo están bloqueados — salida de seguridad automática a los 100s por si el video nunca "termina" según el temporizador).
- Clic en "Responderla" → navega a s6.

### s6 — LA PREGUNTA (ritmo cinematográfico, beats separados)
1. "Solo responde esto con absoluta honestidad..." (sans-serif, sin delay)
2. delay 1.4s → "No tomes una decisión todavía.<br><br>Ni para entrar.<br>Ni para salir." (estilo `.mc-video-subtext`)
3. delay 3.2s → **"¿Cuánto tiempo más estás dispuesta a seguir sintiéndote sola... estando en una relación?"** — dorado, 700, tamaño grande (`clamp(23px,6.2vw,29px)`), sans-serif (NO cursiva, deliberado — es la pregunta central, debe notarse más que leerse como poesía)
4. delay 4.8s → flecha abajo → s7

### s7 — SI ESA PREGUNTA TE INCOMODÓ
1. "*Sé que esa pregunta te incomodó.*" — cursiva (única línea cursiva de este slide)
2. "Y quizá ahora mismo estés pensando..." — sans-serif
3. "«Entonces... ¿qué hago?»" — sans-serif, cita entre comillas (su propio pensamiento interno)
4. "↓" — pequeña pausa visual (dorado, opacidad .6) antes de la flecha
- Flecha: la frase **"Te propongo algo"** va SOBRE la flecha (no debajo) — para que se entienda que al oprimirla está lo que él propone, no que es "seguir bajando". → s8

### s8 — LA PAUSA + AGENDA (la pantalla más compleja de la landing)

**Etapa 1 — Acumulación (las 3 líneas se apilan, ninguna borra a la anterior):**
1. "**Por un momento, deja de intentar cambiar las cosas**" (grande, `.mc-imagine-big`, Playfair 900, dorado)
2. delay 1.7s → "*en solo 90 minutos.*" (cursiva — único texto cursivo de s8)
3. delay 1.7s → "Ven a mirar tu relación desde un lugar distinto.<br>Uno donde no tengas que perseguir, convencer ni cargar con todo." (sans-serif)
4. delay 1.6s → aparece pill "**Cuéntame más**" (apunta a la derecha)

**"Cuéntame más" (pill grande, misma clase que "Responderla"):** el clic es el gesto recomendado — acelera la secuencia al instante. Si no lo toca, avanza sola a los 3.5s igual (`waitForClickOrAuto`). Nunca queda bloqueada esperando una acción obligatoria — decisión de UX deliberada: la navegación debe sentirse guiada, no retenida. El único bloqueo real de toda la landing es el video en s5 (justificación narrativa: "quiero mostrarte algo antes de que sigas").

**Al continuar (clic o automático):** las 3 líneas + el pill se van en fade hacia la izquierda (`translateX(-40px)`, opacity→0, .9s) — responde a la dirección de la flecha, que apunta a la derecha.

**Etapa 2 — Checks (900ms después del fade-out):**
- Aparece "**EN VIVO**" pulsante (verde `#6FD98C`, punto pulsante) arriba de los 3 checks
- Los 3 checks entran desde la derecha en fade, uno cada 750ms:
  1. "✓ Sábado 5 de septiembre."
  2. "✓ 🇨🇴 7:00 p.m. Colombia."
  3. "✓ 🇲🇽 6:00 p.m. México."
- 2 segundos después de que aparece el último check → aparece pill "→" (sin texto, solo flecha) bajo los checks. Misma regla: clic acelera, 3.5s avanza sola.

**Al continuar (clic o automático):** entra la hoja de agenda — **fade + blur desde la derecha** (`translateX(60px)→0`, `blur(14px)→0`, opacity, 1.6s cubic-bezier), NO desliza hacia arriba (así era antes; se cambió deliberadamente).

**Tarjeta de agenda** (fondo crema, `.mc-agenda-card`):
- Tira de días de la semana (D L M X J V S), sábado 5 resaltado en círculo dorado
- "Sábado — 5 de septiembre de 2026"
- Kicker: "Cuando termine este espacio vas a..."
- 3 notas (aparecen palabra por palabra, 150ms/palabra, 350ms extra entre notas, arrancan 900ms después de que la hoja termina de entrar):
  1. "Dejar de sentir que eres la única que sostiene la relación."
  2. "Recuperar la tranquilidad sin tener que perseguir, insistir o cargar con todo."
  3. "Volver a construir desde un lugar donde ya no tengas que perderte para amar."
- Flecha final (apunta a la derecha) → s9

### s9 — SEGUNDA TARJETA DE AGENDA (CTA con contador)
Entra con **`.reveal-side`** (fade+blur desde la derecha, no el reveal genérico hacia arriba) — se siente como "la hoja siguiente".

- "Sábado 5 de septiembre" · "🕖 7:00 p.m."
- Checks: "✔ En vivo." / "✔ Grabación incluida."
- Contador regresivo (días/hrs/min) hasta el 5 de septiembre 7:00pm COT
- **"$9 USD"** — precio en tono natural, deliberadamente pequeño y NO en la fuente dramática (Jost 600 15px, no Playfair Display) — "la idea es que no sea dramático decir el precio, que suene natural"
- Botón: **"Sí, quiero estar ahí"**
- Nota: "Tu lugar queda reservado · Pago seguro con Hotmart"
- Flecha abajo → chat de WhatsApp

---

## 3. Cola libre (después de las 9 pantallas — ya no forzada por scroll-snap)

### 3.1 Chat de WhatsApp simulado (pantalla propia, `.mc-chat-screen`, min-height:100vh)

Título: **"Antes de despedirme... quizá tengas estas preguntas."** (sans-serif, dorado — deliberadamente NO cursiva, fue corregido a pedido explícito)

**Simulación** (arranca cuando el chat entra en viewport, `IntersectionObserver` threshold .3):
- 3 bloques de pregunta+respuesta, uno tras otro:
  1. Ella escribe (letra por letra, 60–130ms/letra con variación aleatoria — ritmo humano, no metrónomo) → "Sí... pero ¿y si mi pareja nunca cambia?" → toca enviar → Josué responde con nota de voz (`respuesta1.mp4`)
  2. "Sí... pero ¿y si ya hice terapia?" → nota de voz (`respuesta2.mp4`)
  3. "Sí... pero ¿y si ese día no puedo conectarme?" → nota de voz (`respuesta3.mp4`)
- El botón de enviar solo se activa (pulsa, `pointer-events:auto`) cuando terminó de escribirse el texto — antes está deshabilitado.
- Cada respuesta de Josué: indicador "Josué está grabando..." (micrófono pulsante) por 1.5s, luego aparece la nota de voz reproducible (nunca autoplay). Al terminar de escucharla, la burbuja se tiñe de dorado (`.heard`) para diferenciarla de las pendientes, y **recién ahí** se libera el siguiente mensaje (no antes).
- El botón CTA ("Quiero estar en este espacio") está oculto (`max-height:0`) hasta que ella escucha la **primera** nota de voz completa — entonces aparece pegado al chat, no antes ni al final de los 3 intercambios.
- **Bloqueo de scroll** (`mcUnlockChatScroll`, misma técnica de congelar el `<body>` que el video, ver 1.7): mientras está posicionada dentro de la pantalla del chat, el scroll queda completamente bloqueado (ninguna dirección) hasta que termina de escuchar la primera nota de voz. Así no puede saltarse el chat entero sin escuchar nada. Salida de seguridad a los 60s. Es la única otra excepción a "el scroll nunca se bloquea" además del video — misma justificación: contenido que debe experimentarse antes de seguir.

**CTA del chat:**
- Botón: "**Quiero estar en este espacio.**"
- Debajo: "**$9 USD · En vivo + Grabación incluida**"
- Flecha abajo (margen 34px, deliberadamente distante del botón) → carta de Josué

### 3.2 Carta de Josué (`#mc-note-section`, pantalla propia, oculta hasta el clic)

**Regla de acceso:** esta sección tiene `display:none` (clase `.mc-locked`) por defecto. **Nunca aparece con scroll normal** — solo se desbloquea cuando ella hace clic en la flecha bajo "Quiero estar en este espacio". Al hacer clic: se quita `.mc-locked` y hace scroll suave hasta ahí.

Contenido (centrado, pantalla propia):
- Título: "Antes de irte... quiero decirte algo."
- "No sé qué está pasando hoy en tu relación."
- "No sé si vienes de una discusión...<br>si hace días no hablan...<br>o si simplemente estás cansada."
- "**Lo único que espero... es que el sábado salgas de este espacio sintiéndote mucho más liviana de como llegaste.**" (negrita/dorado, `.mc-note-signoff`)
- "📅 Sábado 5 de septiembre · 7:00 p.m."
- Botón: "**Reservar mi lugar para el sábado.**"
- Nota: "**Evento en vivo + Grabación • USD $9**"

### 3.3 Cierre

- `.mc-silence` — 30px de aire (deliberadamente recortado; antes eran 260px, se veía como un vacío enorme).
- Cita: **"Hay relaciones que cambian cuando una mujer deja de sobrevivir… y vuelve a vivir."** — *cursiva, entre comillas*
  - Firma: "— Josué Calderón" (Jost, dorado)
- Línea divisoria (separa la landing de los enlaces de documentación)
- "Josué Calderón © 2026"
- **"Invisible a Soberana™"** — wordmark de marca, Playfair Display 700 (misma fuente que el logo "Código Soberana" en el resto del ecosistema)
- Lema: "Porque una mujer que se encuentra... transforma todo lo que toca."
- Enlaces: Política de Privacidad · Términos · Reembolsos (`/privacidad.html`, `/terminos.html`, `/reembolso.html`)

---

## 4. Diseño sonoro

Todos los sonidos están en `/masterclass/assets/`. **Nunca suenan hasta que hay un gesto real del usuario** (política de autoplay de los navegadores).

| Sonido | Archivo | Uso | Volumen |
|---|---|---|---|
| `pop` | `reginaldoito-cell-send-plim-140592.mp3` | Al enviar un mensaje en el chat | 0.65 |
| `typing` | `dragon-studio-typing-with-keyboard-435489.mp3` | Mientras ella "escribe" (loop, se corta al terminar) | 0.24 |
| `whisper` | `koiroylers-subtle-transition-356008.mp3` | Al cambiar de pantalla (solo hacia adelante, solo desde s6 en adelante, debounce 800ms) | 0.32 |
| `notify` | `universfield-new-notification-040-493469.mp3` | Al llegar una nota de voz nueva | 0.5 |
| `click` | `universfield-new-notification-062-494544.mp3` | Al terminar de escuchar una nota de voz | 0.5 |
| `ambient` | `psyai-spa-relaxation-background-soft-ambient-instrument-484999.mp3` | Fondo continuo, loop, sube/baja de volumen por pantalla (nunca golpes) | 0.05–0.09 según pantalla |

**Desbloqueo:** el primer clic o touch en cualquier parte de la página activa los micro-sonidos (`mcSound.unlock()`). El fondo ambient solo arranca con el gesto específico de "Activa el sonido" del video (`mcSound.enable()`).

**Notas de voz del chat:** se amplifican con un `GainNode` (Web Audio API, ganancia 2.2×) porque el `<audio>` nativo no puede pasar de volumen 1.0 y los archivos venían grabados bajos.

---

## 5. Fecha flotante (`#mc-float-date`)

Recuadro fijo, esquina inferior derecha, oculto por defecto. **Se activa al llegar a s9** — por `IntersectionObserver` (basta con hacer scroll hasta ahí, sea por scroll libre o snap) o por clic en su flecha (`#mc-s9-continue`). Se necesitan ambos disparadores porque el scroll es libre en toda la landing (ver 1.7) — depender solo del clic dejaba a casi nadie viéndola. Desde que aparece queda visible el resto de la sesión (nunca se vuelve a ocultar, salvo en modo Evergreen).

Contenido:
- "● EN VIVO" (punto verde pulsante)
- "Sábado 5 septiembre"
- "🇨🇴 7:00 p.m." / "🇲🇽 6:00 p.m."
- "Quedan: **XX** días" (contador dinámico)
- Botoncito dorado pulsante: "**Reservar mi lugar**"

Fondo: degradado casi negro (`rgba(20,7,9,.97)→rgba(10,4,5,.98)`), más oscuro que el resto de la página, con borde dorado fino — deliberadamente diferenciado del resto de la UI. Clic → `goToCheckout()`.

---

## 6. Estado LIVE vs. Evergreen (derivado automáticamente por fecha)

Fuente única de verdad: dos fechas hardcodeadas en JS.
```js
EVENTO_INICIO = 2026-09-05T19:00:00-05:00   // arranca el evento
EVENTO_FIN    = 2026-09-05T20:15:00-05:00   // fin de la última sesión
```

**Mientras `Date.now() < EVENTO_FIN`:** modo LIVE. Contador visible y activo (se actualiza cada 30s), fecha flotante puede activarse, copy orientado a "reserva tu lugar".

**Cuando `Date.now() >= EVENTO_FIN`:** modo Evergreen/Replay automático:
- Se oculta el contador y la fecha flotante
- `mc-hero-note` → "Acceso inmediato · Pago seguro con Hotmart"
- `mc-guarantee-acceso` → "⚡ Acceso inmediato después del pago"
- `mc-cta-final-note` → "Acceso inmediato · $9 USD"
- Botón s9 (`mc-btn-2`) → "Sí, quiero verlo"
- Botón final (`mc-btn-3`) → "Empezar ahora"

---

## 7. Checkout y tracking

- **Link de pago (Hotmart):** `https://pay.hotmart.com/W106744574H` — se abre en pestaña nueva (`window.open`, `target="_blank"`), nunca navega fuera de la landing.
- **Meta Pixel:** ID `1209108340676480`. Eventos: `PageView` (al cargar), `InitiateCheckout` (valor $9 USD) al hacer clic en cualquier CTA de compra.
- **Google Analytics (gtag):** ID `G-60269X4BEN`. Evento `begin_checkout` (valor $9 USD, item "Masterclass Soberana - Mas Se Aleja") al hacer clic en cualquier CTA de compra.
- Los 4 botones de compra de la página (`mc-btn-2` en s9, el CTA del chat, `mc-btn-3` en la carta, y la fecha flotante) llaman a la misma función `goToCheckout()` — mismo destino, mismo tracking.

---

## 8. Resumen de precios mostrados en la página

| Ubicación | Texto exacto |
|---|---|
| s9 (segunda tarjeta de agenda) | "$9 USD" — arriba del botón, Jost 600 15px |
| CTA del chat de WhatsApp | "$9 USD · En vivo + Grabación incluida" |
| Carta de Josué (CTA final) | "Evento en vivo + Grabación • USD $9" |
| Tracking (Pixel/GA) | `value: 9.00, currency: 'USD'` |

**Nota de coherencia:** el precio es siempre $9 USD en toda la landing y coincide con el valor trackeado en Meta/GA.

---

## 9. Preguntas abiertas para el auditor

Estos son puntos que valdría la pena que el auditor revise específicamente, dado que fueron ajustados varias veces durante el desarrollo:

1. ¿El video de 112s sigue siendo la duración real? Si se reemplaza, hay que actualizar `REVEAL_EN_SEG` (hoy en 109, 3s antes del final) o el reveal post-video aparecerá en el momento equivocado.
2. ¿La fecha/hora del evento (5 de septiembre 2026, 7pm Colombia / 6pm México) sigue vigente? Está hardcodeada en 3 lugares distintos del HTML más las 2 constantes JS — si cambia, hay que actualizar todos.
3. ¿El tono "no dramático" del precio en s9 logra el efecto buscado, o se siente demasiado escondido comparado con los otros dos CTAs que sí lo acompañan de beneficios?
4. Verificar que el flujo de gates manuales en s8 (Cuéntame más → checks → flecha → agenda) no se sienta como fricción excesiva versus el resto de la página, que es mayormente pasiva (scroll).
