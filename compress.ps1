$coverPath = "public\workbook\assets\covers"
$cwebp = ".\cwebp.exe"
$files = Get-ChildItem -Path $coverPath -Include "*.png","*.jpg","*.jpeg" -Recurse

foreach ($file in $files) {
    $webpPath = [System.IO.Path]::ChangeExtension($file.FullName, ".webp")
    Write-Host "Comprimiendo: $($file.Name)"
    & $cwebp -q 85 $file.FullName -o $webpPath
    if (Test-Path $webpPath) {
        Remove-Item $file.FullName
        Write-Host "OK: $($file.Name) -> webp"
    }
}
Write-Host "Listo."
