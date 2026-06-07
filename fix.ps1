$path = "public\workbook\index.html"
$content = Get-Content $path -Encoding UTF8 -Raw

# CAMBIO 1: Ocultar boton continuar global en slide tipo 'situaciones'
$content = $content.Replace(
    '    // Ocultar boton continuar en slide de Pausa Workbook
    const curSlide = _slides[current];
    if (curSlide && curSlide.type === ''exercise'' && curSlide.ex && curSlide.ex.label && curSlide.ex.label.includes(''Pausa Workbook'')) {
      btn.style.display = ''none'';
    }',
    '    // Ocultar boton continuar en slide de Pausa Workbook y situaciones
    const curSlide = _slides[current];
    if (curSlide && curSlide.type === ''exercise'' && curSlide.ex && curSlide.ex.label && curSlide.ex.label.includes(''Pausa Workbook'')) {
      btn.style.display = ''none'';
    }
    if (curSlide && curSlide.type === ''situaciones'') {
      btn.style.display = ''none'';
    }'
)

# CAMBIO 2: Subir el texto del header del slide situaciones (menos padding superior)
$content = $content.Replace(
    '      <div style="padding:20px 18px 10px;border-bottom:1px solid rgba(184,137,42,0.12)">',
    '      <div style="padding:6px 18px 8px;border-bottom:1px solid rgba(184,137,42,0.12)">'
)

# CAMBIO 3: Reemplazar el bloque de ejercicio dentro de cada situacion por un acordeon dorado
$old = '          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(184,137,42,0.15);border-radius:14px;padding:18px;margin-top:14px">
            <div style="font-family:''Cormorant Garamond'',serif;font-size:26px;color:#EDE3CE;line-height:1.35;margin-bottom:10px">${ex.q || ''''}</div>
            <div style="font-size:16px;color:rgba(237,227,206,0.5);line-height:1.65;margin-bottom:14px">${ex.body || ''''}</div>
            <div id="sitops_${sec.id}_${idx}">
              ${(ex.opciones || []).map(op => `<button onclick="sitResponder(''${sec.id}'',${idx},this,${op.ok},''sithint_${sec.id}_${idx}'',''sitfbk_${sec.id}_${idx}'')" style="display:block;width:100%;padding:16px;border-radius:12px;border:1px solid rgba(237,227,206,0.12);background:transparent;font-family:''Jost'',sans-serif;font-size:17px;color:rgba(237,227,206,0.7);text-align:left;cursor:pointer;line-height:1.5;margin-bottom:9px;transition:all .2s">${op.txt}</button>`).join('''')}
            </div>
            <div id="sithint_${sec.id}_${idx}" style="display:none;padding:14px 16px;border-radius:11px;background:rgba(180,60,60,0.06);border-left:3px solid rgba(180,60,60,0.5);font-size:15px;color:rgba(237,200,200,0.75);line-height:1.7;margin-top:4px">${ex.hint || ''''}</div>
            <div id="sitfbk_${sec.id}_${idx}" style="display:none;padding:14px 16px;border-radius:11px;background:rgba(184,137,42,0.07);border-left:3px solid rgba(184,137,42,0.5);font-size:15px;color:rgba(237,227,206,0.75);line-height:1.7;margin-top:4px">${ex.feedback || ''''}</div>
          </div>'

$new = '          <button id="sitexbtn_${sec.id}_${idx}" onclick="sitToggleEx(''${sec.id}'',${idx})" style="width:100%;margin-top:14px;padding:15px 20px;border-radius:13px;border:1px solid rgba(184,137,42,0.45);background:linear-gradient(135deg,rgba(184,137,42,0.18),rgba(212,175,106,0.10));font-family:''Jost'',sans-serif;font-size:13px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#D4AF6A;cursor:pointer;display:flex;align-items:center;justify-content:space-between;transition:all .25s">
            <span>Ejercicio — Responder</span>
            <svg id="sitexarrow_${sec.id}_${idx}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4AF6A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition:transform .3s"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div id="sitexbox_${sec.id}_${idx}" style="display:none;overflow:hidden">
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(184,137,42,0.15);border-radius:0 0 14px 14px;border-top:none;padding:18px;margin-top:0">
              <div style="font-family:''Cormorant Garamond'',serif;font-size:24px;color:#EDE3CE;line-height:1.35;margin-bottom:10px">${ex.q || ''''}</div>
              <div style="font-size:15px;color:rgba(237,227,206,0.5);line-height:1.65;margin-bottom:14px">${ex.body || ''''}</div>
              <div id="sitops_${sec.id}_${idx}">
                ${(ex.opciones || []).map(op => `<button onclick="sitResponder(''${sec.id}'',${idx},this,${op.ok},''sithint_${sec.id}_${idx}'',''sitfbk_${sec.id}_${idx}'')" style="display:block;width:100%;padding:14px 18px;border-radius:12px;border:1px solid rgba(237,227,206,0.12);background:transparent;font-family:''Jost'',sans-serif;font-size:16px;color:rgba(237,227,206,0.7);text-align:left;cursor:pointer;line-height:1.5;margin-bottom:9px;transition:all .2s;box-sizing:border-box">${op.txt}</button>`).join('''')}
              </div>
              <div id="sithint_${sec.id}_${idx}" style="display:none;padding:14px 16px;border-radius:11px;background:rgba(180,60,60,0.06);border-left:3px solid rgba(180,60,60,0.5);font-size:14px;color:rgba(237,200,200,0.75);line-height:1.7;margin-top:4px">${ex.hint || ''''}</div>
              <div id="sitfbk_${sec.id}_${idx}" style="display:none;padding:14px 16px;border-radius:11px;background:rgba(184,137,42,0.07);border-left:3px solid rgba(184,137,42,0.5);font-size:14px;color:rgba(237,227,206,0.75);line-height:1.7;margin-top:4px">${ex.feedback || ''''}</div>
            </div>
          </div>'

$content = $content.Replace($old, $new)

$content | Set-Content $path -Encoding UTF8
Write-Host "Fix aplicado."