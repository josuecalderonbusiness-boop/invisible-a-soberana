$carpeta = "C:\Users\Usuario\invisible-a-soberana\public\workbook\assets\covers"

Add-Type -AssemblyName System.Drawing

$archivos = @("sit 1.jpg", "sit 2.jpg", "sit 3.jpg")
$nombres  = @("leccion8_sit_1.webp", "leccion8_sit_2.webp", "leccion8_sit_3.webp")

for ($i = 0; $i -lt $archivos.Count; $i++) {
    $entrada = Join-Path $carpeta $archivos[$i]
    $salida  = Join-Path $carpeta $nombres[$i]
    $img = [System.Drawing.Image]::FromFile($entrada)
    $img.Save($salida, [System.Drawing.Imaging.ImageFormat]::Png)
    $img.Dispose()
    Rename-Item $salida ($salida -replace "\.webp$", ".webp")
    Write-Host "Convertido: $($nombres[$i])"
}