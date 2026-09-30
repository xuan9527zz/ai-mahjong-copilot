Add-Type -AssemblyName System.Drawing

$assetDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) 'dist\assets'

foreach ($size in @(180, 192, 512)) {
    $bitmap = [System.Drawing.Bitmap]::new($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    $background = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#07110e'))
    $tileBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#f3ead8'))
    $linePen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#d9553f'), [float]($size * 0.066))
    $linePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $linePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    $graphics.FillRectangle($background, 0, 0, $size, $size)

    $x = [float]($size * 0.246)
    $y = [float]($size * 0.152)
    $width = [float]($size * 0.508)
    $height = [float]($size * 0.696)
    $radius = [float]($size * 0.105)
    $diameter = $radius * 2
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
    $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
    $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    $graphics.FillPath($tileBrush, $path)

    foreach ($lineY in @(0.356, 0.5, 0.644)) {
        $graphics.DrawLine($linePen, [float]($size * 0.398), [float]($size * $lineY), [float]($size * 0.602), [float]($size * $lineY))
    }

    $outputPath = Join-Path $assetDirectory "icon-$size.png"
    $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $path.Dispose()
    $linePen.Dispose()
    $tileBrush.Dispose()
    $background.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}
