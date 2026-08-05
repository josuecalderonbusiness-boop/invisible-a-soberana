# Masterclass "Más Se Aleja" — Página de Gracias — Spec de Copy, Diseño y Comportamiento

**Archivo fuente:** `public/masterclass/mas-se-aleja/gracias/index.html`
**URL en vivo:** `he-intentado-todo-porque-nada-cambia.josuecalderon.lat/gracias` (subdominio propio; la ruta anterior `josuecalderon.lat/masterclass/mas-se-aleja/gracias` fue dada de baja y redirige a home)
**Última actualización de este documento:** 2026-07-25 (copy EVERGREEN reescrito según el patrón LIVE → EVERGREEN de `entry-product-system/SKILL.md`)
**Estado:** APROBADA Y PUBLICADA (push a `main` el 2026-07-25)

Este documento describe la página de gracias tal como existe hoy en producción: cada texto, color, fuente, tiempo de animación y regla de comportamiento. Es el equivalente de `../COPY-SPEC.md` (el de la landing) pero para esta página. Pensado para que un auditor (humano o IA) revise coherencia de copy, diseño y UX sin leer el HTML/CSS/JS directamente.

---

## 0. Rol de esta página en el funnel

Es la página a la que Hotmart redirige después de una compra exitosa de la Masterclass ($9 USD). Su única función es entregar el acceso por WhatsApp lo más rápido posible — **no es una landing narrativa** (a diferencia de `index.html`, que sí lo es). Regla de diseño explícita del dueño del producto: *"no queremos una experiencia narrativa como la landing. Queremos que sea instantánea, clara y tranquilizadora. Ella ya tomó la decisión. Ahora no la hagamos trabajar para recibir lo que compró."*

Consecuencia de esa regla: todo el layout está optimizado para caber **en una sola pantalla sin scroll en desktop** (verificado en 1920×1080 y en viewport móvil 375×812). Si un cambio futuro de copy no cabe sin achicar la letra por debajo de los tamaños de este spec, se prefiere un poco de scroll — nunca sacrificar legibilidad.

---

## 1. Identidad de marca y sistema de diseño

### 1.1 Paleta de colores (variables CSS `:root`)

Mismas variables que la landing (`index.html`), subconjunto reducido:

| Variable | Hex | Uso en esta página |
|---|---|---|
| `--gold-primary` | `#B8892A` | Eyebrow, bordes de la píldora de fecha, check del intro, firma de Josué |
| `--gold-medium` | `#D4A843` | — (heredada, no usada directamente aquí) |
| `--gold-light` | `#E8C870` | Icono del check pequeño, énfasis `<strong>` en título/pasos |
| `--charcoal-deep` | `#1E1218` | Fondo del body y del overlay de intro |
| `--text-light` | `#F0E6EA` | Texto principal |
| `--text-muted` | `#C4A8B0` | Heredada, no usada directamente (los grises de esta página se resuelven con `rgba(240,230,234,X)` inline) |

Colores fuera de la paleta de marca, usados con función específica:
- **Verde WhatsApp** `linear-gradient(135deg, #25D366, #1FAE54)` — botón principal. Deliberadamente NO es dorado: el botón de WhatsApp debe leerse como "acción de mensajería", no como CTA de compra (ese ya se completó).
- **Verde "en vivo"** `#6FD98C` — mismo verde que usa el badge flotante y el badge de checks de la landing (`.mc-float-live`, `.mc-imagine-live`) para el indicador "EN VIVO" con punto pulsante. Reutilizado aquí a propósito para que el usuario reconozca la señal.

### 1.2 Fuentes

Mismo sistema tipográfico que la landing:
```
--font-display: 'Playfair Display', Georgia, serif   → título "Ya estás dentro."
--font-body:    'Inter', sans-serif                    → todo el copy de lectura (quote, pasos, nota)
'Jost', sans-serif                                     → eyebrow, firma, fecha, badge "EN VIVO", labels, botón
```

**`--font-elegant` (Cormorant Garamond) está declarada en `:root` pero NO se usa en ningún selector de esta página.** Decisión deliberada: la cursiva/script queda reservada para titulares grandes de la landing (ver regla de marca en `../COPY-SPEC.md` §1.3); en esta página, incluso la firma "— Josué Calderón" usa Jost (sans-serif), no cursiva, para que sea perfectamente legible a 12px.

### 1.3 Botones

**Botón WhatsApp** (`.gc-btn`) — único CTA de la página:
```css
background: linear-gradient(135deg, #25D366, #1FAE54);
color: #fff; border-radius: 12px; width: 100%;
font: Inter 15px/700, letter-spacing .3px
box-shadow: 0 8px 28px rgba(37,211,102,.35)
animación: gcBtnPulse (pulso de sombra, 2.4s, infinito) — mismo patrón que el pulso del CTA dorado de la landing, adaptado a verde
hover: translateY(-2px)
```
Ícono de WhatsApp inline (SVG, relleno blanco) a la izquierda del texto.

---

## 2. Estructura y copy — estado por defecto (evento aún no pasa)

Este es el copy que ve el 100% de las visitantes hasta el **22 de agosto de 2026, 8:15 p.m. hora Colombia** (`EVENTO_FIN`, ver §5).

| Elemento | Copy exacto |
|---|---|
| Check pequeño | Ícono check dorado en círculo, 48×48px, aparece con `gcPop` (scale 0→1, bounce, .6s) |
| Eyebrow | "Compra confirmada" |
| Título (`<h1>`) | "Ya estás dentro." — o **"Ya estás dentro, {Nombre}."** si Hotmart pasó un nombre (ver §4) |
| Quote | "Tu lugar está reservado. Ahora sí. Nos vemos el sábado." |
| Firma | "— Josué Calderón" |
| Píldora de fecha | Calculada en JS, auto-ajustada al huso del visitante (ver §6) — texto base: "Sábado 22 de agosto · 7:00 p.m. (tu hora)" para quien esté en huso Colombia |
| Badge en vivo | "● EN VIVO" (punto verde `#6FD98C` pulsante) |
| Label de pasos | "Para recibir tu acceso, solo haz esto:" |
| Paso 1 | **Toca el botón** / "Se abrirá WhatsApp con un mensaje ya escrito." |
| Paso 2 | **Envíalo** / "No tienes que escribir nada más." |
| Paso 3 | **Recibe tu acceso** / "Te enviaremos por WhatsApp el enlace y toda la información que necesitas para el sábado." |
| Botón | "Recibir mi acceso por WhatsApp" (ícono WhatsApp + texto) |
| Microtexto | "WhatsApp se abre automáticamente · Solo toca Enviar." |

**Mensaje pre-escrito del botón** (`wa.me/573189045623`):
> "Hola Josué, acabo de comprar la Masterclass Soberana. Quiero recibir mi acceso 🙌"

---

## 3. Copy — estado EVERGREEN (después de `EVENTO_FIN`)

**Reescrito el 2026-07-25** para implementar el patrón LIVE → EVERGREEN de `entry-product-system/SKILL.md` (ver §5.1) con copy propio, no solo "Replay" del evento en vivo — el acceso ya es inmediato, sin fecha, sin urgencia de evento.

Se activa solo con JS, sobrescribiendo textos por `id` (nunca recarga la página, nunca cambia el HTML servido — es el mismo archivo para ambos estados, ver §5):

| Elemento | Cambia a |
|---|---|
| `<title>` | "Ya puedes empezar — Masterclass Soberana" |
| Título (`<h1>`) | "Ya puedes empezar." — o **"Ya puedes empezar, {Nombre}."** si había personalización activa (el bloque Evergreen lee `dataset.nombre`, guardado por el bloque de personalización de §4, para no perderla al cambiar de estado) |
| Quote (frase de Josué) | "Hoy no compraste otro curso. Compraste un momento para dejar de intentar más... y empezar a entender diferente." (reemplaza "Tu lugar está reservado...") |
| Firma | Sin cambio: "— Josué Calderón" |
| Píldora de fecha | Oculta (`display:none`) — Evergreen nunca menciona fechas (regla `entry-product-system`: "Evergreen: atemporal por completo") |
| Badge en vivo | Oculto (`display:none`) |
| Label de pasos | Deja de ser una etiqueta corta en mayúsculas y pasa a ser la frase completa: "Tu acceso ya está disponible. Solo necesitamos enviártelo por WhatsApp para que puedas empezar cuando quieras." — gana la clase `.gc-steps-label--sentence` (quita `uppercase`/`letter-spacing`, sube el tamaño a 13.5px) porque una oración larga en mayúsculas de etiqueta se leía como si estuviera gritando |
| Paso 1 | **Toca el botón verde.** (sin descripción secundaria — ya no hace falta explicar que "se abre WhatsApp", el tono es más directo) |
| Paso 2 | **Envía el mensaje.** / "(No escribas nada más.)" |
| Paso 3 | **Recibe inmediatamente:** / "✔ La clase completa." / "✔ El material." / "✔ Las instrucciones." (3 líneas apiladas con la clase `.gc-check-line`, en vez de una sola oración) |
| Botón | "Recibir mi acceso ahora" (antes: "Recibir mi acceso por WhatsApp") |
| Microtexto | "En menos de un minuto tendrás todo en WhatsApp." (antes: "WhatsApp se abre automáticamente · Solo toca Enviar.") |

**Mensaje pre-escrito del botón de WhatsApp: sin cambios entre LIVE y Evergreen** (`"Hola Josué, acabo de comprar la Masterclass Soberana. Quiero recibir mi acceso 🙌"`) — es intencional: es un mensaje transaccional, y `entry-product-system/SKILL.md` (§"Mensajes transaccionales — atemporales por regla") exige que no dependa de fecha ni de si el evento ya pasó.

Lo único que **no** cambia entre LIVE y Evergreen: el ícono del check, el eyebrow "Compra confirmada", la firma "— Josué Calderón", el efecto de intro (§7), y el mensaje pre-escrito de WhatsApp (regla de mensajes transaccionales atemporales, arriba). Todo lo demás sí cambia — a diferencia de la primera versión de esta página (que solo cambiaba 3 líneas para un "Replay" del evento en vivo), esta reescritura del 2026-07-25 trata Evergreen como su propio estado con voz propia, no como una variante menor de LIVE.

---

## 4. Personalización por nombre (Hotmart → URL → título)

La página lee el nombre de la compradora desde los parámetros de la URL con la que Hotmart redirige tras el pago (la misma persona/nombre que `api/hotmart-webhook.js` ya guarda como `FIRSTNAME` en Brevo y usa para la plantilla de bienvenida de WhatsApp — no hay dos fuentes de verdad, es el mismo dato).

**Claves de URL que se prueban, en este orden** (se usa la primera que venga con valor): `nome`, `name`, `buyer_name`, `primeiro_nome`, `first_name`, `contact_name`.

**Procesamiento:** se toma solo la primera palabra (primer nombre), se normaliza a "Primera mayúscula, resto minúscula" (evita que un nombre en mayúsculas de Hotmart tipo "MARIA FERNANDA" se vea gritado), y se inyecta con `textContent` (no `innerHTML`) para que un nombre con caracteres especiales nunca pueda inyectar HTML.

**Fallback:** si ninguna clave trae valor, el título se queda en el genérico "Ya estás dentro." — nunca se muestra una coma vacía ni "undefined".

⚠️ **Punto abierto para el auditor:** no está confirmado cuál es el nombre exacto del parámetro que usa la cuenta de Hotmart de Josué en su "URL de agradecimiento" configurada en el producto — se cubrieron las variantes más comunes, pero se recomienda hacer una compra de prueba real (o revisar la config del producto en Hotmart) para verificar que alguna de las 6 claves coincide. Si no coincide ninguna, es un cambio de una línea agregar la clave correcta.

---

## 5. Estado LIVE vs. Evergreen — derivado automáticamente por fecha

Misma filosofía que la landing (`../COPY-SPEC.md` §6), una sola fuente de verdad en JS:

```js
EVENTO_FIN = 2026-08-22T20:15:00-05:00   // fin de la última sesión (Zoom Básico, 2 sesiones)
```

A diferencia de la landing (que tiene `EVENTO_INICIO` y `EVENTO_FIN` como dos constantes separadas para dos propósitos distintos — contador y estado), esta página usa:
- `EVENTO_FIN` para decidir LIVE vs. Evergreen (§3), exactamente el mecanismo genérico que documenta `entry-product-system/SKILL.md` → "Mecanismo de derivación automática por fecha": `hoy < fin del evento → Estado = En Vivo`, `hoy >= fin del evento → Estado = Replay/Evergreen`.
- Una constante separada `EVENTO_INICIO = 2026-08-22T19:00:00-05:00` solo para calcular la hora mostrada en la píldora de fecha (§6) — mismo valor que usa la landing internamente, no debería divergir nunca.

### 5.1 Esta página es la referencia de implementación del patrón LIVE → EVERGREEN para páginas de Gracias

`entry-product-system/SKILL.md` ya documenta el mecanismo de forma genérica (Estados del producto, "Mecanismo de derivación automática por fecha", "Live y Evergreen NUNCA comparten la misma plantilla"). Esta página es, a partir del 2026-07-25, el **primer caso real construido** de ese patrón aplicado específicamente a una Página de Gracias estática (sin build system, un solo archivo HTML para los dos estados) — igual que `LANDING-TIPO-1-TEMPLATE.md` es la referencia real para landings. Cualquier producto de entrada futuro que necesite una Página de Gracias con estado LIVE/Evergreen debería copiar esta implementación (estructura de ids + bloque IIFE que sobrescribe por `id`, nunca una segunda página) en vez de rediseñarla desde cero — ver la nota correspondiente añadida en `entry-product-system/SKILL.md`.

**Mientras `Date.now() < EVENTO_FIN`:** copy por defecto (§2), el que sirve el HTML tal cual.
**Cuando `Date.now() >= EVENTO_FIN`:** el bloque JS correspondiente sobrescribe los textos (§3). No hay countdown ni fecha flotante en esta página (a diferencia de la landing) — aquí no aplica, es una página de una sola pantalla sin necesidad de urgencia adicional.

---

## 6. Hora auto-ajustada al huso horario del visitante (sin listar países)

**Decisión de diseño (2026-07-25):** en vez de listar "🇨🇴 7pm Colombia / 🇲🇽 6pm México / hora USA..." como hace la landing en s8 (ver `../COPY-SPEC.md` §2, s8 Etapa 2), esta página calcula y muestra la hora **ya convertida al huso horario de quien la está viendo**, sin necesidad de listar ningún país.

**Cómo funciona técnicamente:** se crea el objeto `Date` del inicio del evento en hora Colombia (`new Date('2026-08-22T19:00:00-05:00')`). Los métodos nativos `.getDay()`, `.getDate()`, `.getMonth()`, `.getHours()`, `.getMinutes()` de JavaScript **siempre devuelven el valor en la zona horaria local del dispositivo/navegador que ejecuta el código**, sin importar en qué huso se construyó el `Date` — el objeto internamente es un instante absoluto (timestamp UTC), y esos métodos son los que hacen la conversión. Por eso no hace falta detectar el país ni usar `Intl`/geolocalización: el propio navegador de la visitante ya sabe en qué huso horario está configurado su sistema, y estos métodos heredan esa configuración automáticamente.

**Formato de salida:** `{Día de la semana} {día} de {mes} · {hora}:{minutos} {a.m./p.m.} (tu hora)` — ejemplo real verificado en huso `America/Bogota`: *"Sábado 22 de agosto · 7:00 p.m. (tu hora)"*. Los nombres de día/mes están en arrays hardcodeados en español (no dependen de `Intl.DateTimeFormat`, que podía devolver formatos con comas/mayúsculas inconsistentes entre navegadores).

**Caso límite a vigilar:** si el huso horario de la visitante hace que el evento caiga en un día de calendario distinto (ej. husos muy adelantados de Colombia, como Europa o Asia, donde localmente ya sería domingo de madrugada), el nombre del día **sí cambia correctamente** porque `getDay()` se recalcula en la zona local — el auditor debería probar con `Intl.DateTimeFormat().resolvedOptions().timeZone` forzado a un huso como `Europe/Madrid` para confirmar que el texto sigue leyéndose natural (ej. "Domingo 23 de agosto · 2:00 a.m. (tu hora)" en vez de romperse).

---

## 7. Efecto de apertura — check que se dibuja + sonido (copiado de `public/bienvenida/index.html`)

Antes de mostrar cualquier contenido, la página reproduce una secuencia de ~2 segundos, **copiada 1:1 en timing y estructura** del efecto de intro que ya existía en la página de bienvenida de Código Soberana (`public/bienvenida/index.html`), adaptada a la paleta de esta página.

**Estructura:** overlay `#gc-intro` a pantalla completa (`position:fixed; inset:0; z-index:500`), fondo `--charcoal-deep` sólido, oculta el `.gc-wrap` (que empieza en `opacity:0`) hasta que termina.

**Secuencia exacta (timers en `setTimeout`, todos programados desde el load):**

| Tiempo | Qué pasa |
|---|---|
| 0ms | Label "Compra confirmada" aparece con pulso infinito (`gcIntroPulse`: opacity 1↔.6, letter-spacing 3px↔4px, 1.5s) |
| 200ms | El check grande (SVG 100×100, círculo + polyline) aparece (fade in, opacity 0→1) |
| 400ms | El círculo se dibuja: `stroke-dashoffset` 283→0 en 0.5s (`stroke-dasharray:283` = circunferencia de `r=45`) |
| 900ms | El check (palomita) se dibuja: `stroke-dashoffset` 80→0 en 0.35s. **Simultáneo:** vibración (`navigator.vibrate([60,30,100])` si el dispositivo soporta), sonido sintetizado (ver abajo), y destello dorado intenso que se atenúa a los 150ms |
| 1500ms | El check completo se encoge a 18% de su tamaño (`transform: scale(.18)`, transición 1.2s `cubic-bezier(.34,1.2,.64,1)` — el mismo "rebote" elástico que usa el CTA dorado de la landing) |
| 2000ms | El overlay hace fade-out (1s, `gcIntroFadeOut`) y se oculta (`display:none` a los 700ms); simultáneamente `.gc-wrap` gana la clase `.reveal` y sube su opacidad a 1 (transición .5s) |

**Sonido (Web Audio API, sin archivo de audio — sintetizado en el momento):** dos tonos seno superpuestos, igual que el original de `bienvenida`:
- Tono 1: 600Hz, arranca en t=0 del evento, gain sube a 0.3 en 10ms y decae exponencialmente a casi 0 en 180ms.
- Tono 2: 900Hz, arranca 100ms después del tono 1, gain sube a 0.28 y decae en 400ms.
- Envuelto en `try/catch` — si el navegador bloquea `AudioContext` (política de autoplay sin gesto previo del usuario, común en algunos navegadores/iOS), la animación visual sigue funcionando igual, solo sin sonido. No hay archivo `.mp3` involucrado, a diferencia del diseño sonoro de la landing (`../COPY-SPEC.md` §4).

**Nota de coherencia con la landing:** esta página reutiliza el mismo verde `EN VIVO` (§1.1) y el mismo timing/easing de "encogerse con rebote" que usa el badge y los botones de la landing — es intencional, para que se sienta como la misma marca aunque el propósito de la página sea distinto (entrega de acceso, no narrativa de venta).

---

## 8. Layout — "una sola pantalla, sin scroll" (regla de producto)

`.gc-wrap`: `min-height:100vh` (y `100dvh` para iOS Safari), `max-width:440px`, centrado vertical y horizontal con flexbox, `padding:28px 24px`. Todo el contenido (check, eyebrow, título, quote, firma, píldora de fecha, badge en vivo, label de pasos, 3 pasos, botón, microtexto) cabe dentro de ese contenedor sin overflow en:
- **Desktop 1920×1080:** verificado por captura — el contenido ocupa aproximadamente la mitad vertical de la pantalla, centrado, con margen de sobra arriba y abajo.
- **Móvil 375×812:** verificado — `scrollHeight` del body es exactamente igual a `innerHeight` (812px), es decir, cero scroll necesario incluso en el viewport más ajustado probado.

Tamaños de fuente deliberadamente compactos vs. el resto del ecosistema (título `clamp(24px,6vw,30px)`, pasos 13.5px, nota 11px) — **límite explícito:** si un cambio de copy futuro obliga a bajar estos tamaños más, se prefiere permitir scroll en vez de encoger más la letra (regla dada por el dueño del producto).

---

## 9. Tracking y conversión

- **Meta Pixel:** ID `1209108340676480`. Eventos: `PageView` (al cargar) y **`Purchase`** (`value:9.00, currency:'USD'`) — este último protegido con `sessionStorage.mc_purchase_fired` para no duplicarse si la visitante recarga la página. `transaction_id` generado como `'mc-mas-se-aleja-' + Date.now()` (no es el ID real de transacción de Hotmart — ver punto abierto abajo).
- **Google Analytics (gtag):** ID `G-60269X4BEN`. Evento `purchase` equivalente, mismos valores.
- **Clic en el botón de WhatsApp:** dispara `fbq('trackCustom','wa_click_masterclass')` y `gtag('event','wa_click_masterclass')` — permite medir cuántas compradoras efectivamente llegan a WhatsApp después de pagar (métrica de "abandono post-pago").

⚠️ **Punto abierto para el auditor:** el `transaction_id` usado en el evento `Purchase` es un ID sintético (`Date.now()`), no el ID real de la transacción de Hotmart. Si en algún momento se necesita conciliar compras entre Meta/GA y Hotmart/Brevo, este ID no sirve para el cruce — habría que pasar el ID real de Hotmart como parámetro de URL (mismo mecanismo que el nombre, §4) y usarlo aquí.

---

## 10. Resumen de dependencias externas

| Dependencia | Uso |
|---|---|
| Google Fonts (Playfair Display, Cormorant Garamond*, Jost, Inter) | Tipografía. *Cormorant Garamond se carga pero no se usa (ver §1.2) — candidato a quitar del `<link>` si se quiere aligerar la carga. |
| Meta Pixel / Google gtag | Tracking de conversión (§9) |
| `wa.me/573189045623` | Deep link de WhatsApp — número de Josué, mensaje pre-escrito codificado en la URL |
| `api/hotmart-webhook.js` (no vive en esta página, pero es la fuente del nombre — ver §4) | Guarda `FIRSTNAME`/teléfono en Brevo y dispara la plantilla de bienvenida de WhatsApp de forma independiente a que la compradora llegue o no a esta página |

---

## 11. Preguntas abiertas para el auditor

1. **Nombre del parámetro de Hotmart (§4):** confirmar con una compra de prueba real cuál de las 6 claves probadas (`nome`, `name`, `buyer_name`, `primeiro_nome`, `first_name`, `contact_name`) es la que efectivamente usa la "URL de agradecimiento" configurada en el producto de Hotmart de Josué.
2. **`transaction_id` sintético (§9):** ¿vale la pena pasar el ID real de transacción de Hotmart por URL para poder conciliar Meta/GA con Hotmart/Brevo?
3. **Fuente sin usar (§10):** ¿se quita `Cormorant Garamond` del `<link>` de Google Fonts ya que ningún selector la usa en esta página, para aligerar la carga?
4. **Hora auto-ajustada en husos "raros" (§6):** validar visualmente el caso límite en el que el evento cae en otro día de calendario para la visitante (ej. Europa), confirmar que el texto se sigue leyendo natural.
5. **Sonido sin gesto previo (§7):** en navegadores que bloquean `AudioContext` sin interacción previa del usuario, la visitante llega desde un clic en Hotmart (fuera del dominio) — confirmar en dispositivos reales (especialmente iOS Safari) si el sonido efectivamente suena o si sistemáticamente se bloquea silenciosamente, para decidir si vale la pena invertir en un fallback.
