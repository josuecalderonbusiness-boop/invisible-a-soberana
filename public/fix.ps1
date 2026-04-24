$path = "index.html"
$popup = Get-Content "popup.html" -Raw -Encoding UTF8
$content = Get-Content $path -Encoding UTF8 -Raw
$lastScript = "</script>"
$idx = $content.LastIndexOf($lastScript)
$content = $content.Substring(0, $idx + $lastScript.Length) + "`n" + $popup + "`n"
$content | Set-Content $path -Encoding UTF8