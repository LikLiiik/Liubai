Add-Type -AssemblyName System.Drawing
$assetDirectory = Join-Path $PSScriptRoot '..\assets'
$brandBitmap = [System.Drawing.Bitmap]::new(1024, 1024)
$brandGraphics = [System.Drawing.Graphics]::FromImage($brandBitmap)
$brandGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$brandGraphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#7963C9'))
$brandPen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, 50)
$brandPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$brandPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$brandPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$outerPath = [System.Drawing.Drawing2D.GraphicsPath]::new()
$outerPath.AddLines([System.Drawing.PointF[]]@([System.Drawing.PointF]::new(300, 270), [System.Drawing.PointF]::new(300, 750), [System.Drawing.PointF]::new(740, 750)))
$brandGraphics.DrawPath($brandPen, $outerPath)
$innerPath = [System.Drawing.Drawing2D.GraphicsPath]::new()
$innerPath.AddLines([System.Drawing.PointF[]]@([System.Drawing.PointF]::new(460, 360), [System.Drawing.PointF]::new(460, 570), [System.Drawing.PointF]::new(650, 570)))
$brandGraphics.DrawPath($brandPen, $innerPath)
$accentBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#D5C8F8'))
$brandGraphics.FillEllipse($accentBrush, 665, 267, 95, 95)
$brandBitmap.Save((Join-Path $assetDirectory 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$faviconBitmap = [System.Drawing.Bitmap]::new($brandBitmap, 128, 128)
$faviconBitmap.Save((Join-Path $assetDirectory 'favicon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$faviconBitmap.Dispose()
$accentBrush.Dispose()
$outerPath.Dispose()
$innerPath.Dispose()
$brandPen.Dispose()
$brandGraphics.Dispose()
$brandBitmap.Dispose()
