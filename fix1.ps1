$content = Get-Content "public\index.html" -Raw -Encoding UTF8

$newPick = @"
function pick(i) {
  document.querySelectorAll('.opt').forEach(o=>o.classList.remove('on'));
  document.querySelectorAll('.opt')[i].classList.add('on');
  ans[curQ] = i;
  setTimeout(() => showBridge(curQ, i), 480);
}
"@

$content = $content -replace "function pick\(i\) \{[\s\S]*?setTimeout\(\(\) => nextQ\(\), 480\);\s*\}", $newPick
$content | Set-Content "public\index.html" -Encoding UTF8
Write-Host "LISTO"
