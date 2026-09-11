$text = [System.IO.File]::ReadAllText('D:\main\Projects\BRWSR\apps\browser\src-tauri\src\forensic.rs', [System.Text.Encoding]::UTF8)
$lines = $text.Split("`n")
$opens = 0
$closes = 0
for ($i = 0; $i -lt $lines.Length; $i++) {
    $line = $lines[$i]
    $open_count = ($line.ToCharArray() | Where-Object { $_ -eq '{' }).Count
    $close_count = ($line.ToCharArray() | Where-Object { $_ -eq '}' }).Count
    $opens += $open_count
    $closes += $close_count
    if ($open_count -ne $close_count) {
        Write-Host ("L{0,4}: opens=$open_count closes=$close_count diff={1,2} | $line" -f ($i+1, $open_count - $close_count))
    }
}
Write-Host ""
Write-Host "Total opens: $opens, closes: $closes, diff: $($opens - $closes)"
