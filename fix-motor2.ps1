$c = Get-Content public/workbook/index.html -Raw
$motor = "
// SISTEMA DE ESTRELLAS
const STARS_CONFIG = {
  s0: { posibles: 1, ejercicios: [{ id:'s0_e1', tipo:'textarea', minChars:80 }] },
  s1: { posibles: 1, ejercicios: [{ id:'s1_e1', tipo:'textarea', minChars:150 }] },
  s2: { posibles: 2, ejercicios: [{ id:'s2_e1', tipo:'auto' }, { id:'s2_e2', tipo:'textarea', minChars:100 }] },
  s3: { posibles: 3, ejercicios: [{ id:'s3_e1', tipo:'auto' }, { id:'s3_e2', tipo:'textarea', minChars:100 }, { id:'s3_e3', tipo:'auto' }] },
  s4: { posibles: 3, ejercicios: [{ id:'s4_e1', tipo:'auto' }, { id:'s4_e2', tipo:'auto' }, { id:'s4_e3', tipo:'textarea', minChars:100 }] },
  s5: { posibles: 2, ejercicios: [{ id:'s5_e1', tipo:'multifield', minChars:40 }, { id:'s5_e3', tipo:'textarea', minChars:150 }] },
  s6: { posibles: 2, ejercicios: [{ id:'s6_e1', tipo:'textarea', minChars:100 }, { id:'s6_e2', tipo:'auto' }] },
  s7: { posibles: 3, ejercicios: [{ id:'s7_e1', tipo:'auto' }, { id:'s7_e2', tipo:'auto' }, { id:'s7_e3', tipo:'textarea', minChars:100 }] },
  s8: { posibles: 4, ejercicios: [{ id:'s8_e1_p1', tipo:'textarea', minChars:80 }, { id:'s8_e1_p2', tipo:'textarea', minChars:80 }, { id:'s8_e1_p3', tipo:'textarea', minChars:80 }, { id:'s8_e1_p4', tipo:'textarea', minChars:80 }] },
  s9: { posibles: 6, ejercicios: [{ id:'s9_e1', tipo:'auto' }, { id:'s9_e2', tipo:'auto' }, { id:'s9_e3', tipo:'textarea', minChars:100 }, { id:'s9_e4', tipo:'textarea', minChars:80 }, { id:'s9_e5', tipo:'textarea', minChars:150 }, { id:'s9_e6', tipo:'multifield', minChars:30 }] }
};
const STARS_7D_CONFIG = {
  lun: { posibles: 1, tipo: 'auto' },
  mar: { posibles: 3, tipo: 'preguntas', minChars: 120 },
  mie: { posibles: 2, tipo: 'reto', minChars: 100 },
  jue: { posibles: 2, tipo: 'caso', minChars: 200 },
  vie: { posibles: 4, tipo: 'diario', minChars: 80 },
  sab: { posibles: 1, tipo: 'auto' },
  dom: { posibles: 1, tipo: 'auto' }
};
function calcStarsForSec(secId) {
  var config = STARS_CONFIG[secId];
  if (!config) return 0;
  var ganadas = 0;
  var answers = state.answers || {};
  for (var i = 0; i < config.ejercicios.length; i++) {
    var ej = config.ejercicios[i];
    if (ej.tipo === 'auto') {
      if (state.completedSections && state.completedSections.includes(secId)) ganadas++;
    } else if (ej.tipo === 'textarea') {
      var val = answers[ej.id];
      if (val && typeof val === 'string' && val.trim().length >= ej.minChars) ganadas++;
    } else if (ej.tipo === 'multifield') {
      var val2 = answers[ej.id];
      if (val2 && typeof val2 === 'object') {
        var allFilled = Object.values(val2).every(function(v) { return v && v.trim && v.trim().length >= ej.minChars; });
        if (allFilled) ganadas++;
      }
    }
  }
  return ganadas;
}
function calc7dStars(nodeKey) {
  var parts = nodeKey.split('_');
  var diaKey = parts[parts.length - 1];
  var config = STARS_7D_CONFIG[diaKey];
  if (!config) return { ganadas: 0, posibles: 1 };
  var isDone = state.completed7d && state.completed7d[nodeKey];
  if (!isDone) return { ganadas: 0, posibles: config.posibles };
  if (config.tipo === 'auto') return { ganadas: config.posibles, posibles: config.posibles };
  var answers = state.answers || {};
  var ganadas = 0;
  if (config.tipo === 'preguntas') {
    for (var i = 1; i <= 3; i++) { var val = answers[nodeKey + '_p' + i]; if (val && val.trim().length >= config.minChars) ganadas++; }
  } else if (config.tipo === 'diario') {
    for (var i = 1; i <= 4; i++) { var val = answers[nodeKey + '_d' + i]; if (val && val.trim().length >= config.minChars) ganadas++; }
  } else if (config.tipo === 'reto') {
    var val = answers[nodeKey + '_reflexion'];
    ganadas = 1 + ((val && val.trim().length >= config.minChars) ? 1 : 0);
  } else if (config.tipo === 'caso') {
    var val = answers[nodeKey + '_caso'];
    ganadas = (val && val.trim().length >= config.minChars) ? 2 : 0;
  }
  return { ganadas: ganadas, posibles: config.posibles };
}
function renderStarsStr(ganadas, posibles) {
  var s = '';
  for (var i = 0; i < ganadas; i++) s += String.fromCharCode(9733);
  for (var i = ganadas; i < posibles; i++) s += String.fromCharCode(9734);
  return s;
}
function getTotalStarsWorkshop() {
  return Object.keys(STARS_CONFIG).reduce(function(acc, secId) { return acc + calcStarsForSec(secId); }, 0);
}
function getTotalStars7D() {
  if (!state.completed7d) return 0;
  return Object.keys(state.completed7d).reduce(function(acc, nodeKey) { return acc + calc7dStars(nodeKey).ganadas; }, 0);
}
function getInsigniaWorkshop(total) {
  if (total >= 27) return { titulo: 'Soberana Completa', color: '#D4AF6A' };
  if (total >= 19) return { titulo: 'Codigo Activado', color: '#B8892A' };
  if (total >= 10) return { titulo: 'Arquitecta Emocional', color: '#A0748A' };
  if (total >= 1) return { titulo: 'Mente Despierta', color: 'rgba(255,255,255,0.6)' };
  return null;
}
"
$lastScript = $c.LastIndexOf("</script>")
$c = $c.Substring(0, $lastScript) + $motor + "</script>" + $c.Substring($lastScript + 9)
$c | Set-Content public/workbook/index.html -Encoding UTF8
Write-Host "Motor insertado"