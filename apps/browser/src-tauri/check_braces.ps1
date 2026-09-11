$text = [System.IO.File]::ReadAllText('D:\main\Projects\BRWSR\apps\browser\src-tauri\src\forensic.rs', [System.Text.Encoding]::UTF8)
$lines = $text.Split("`n")
$opens = 0
$closes = 0
for ($i = 0; $i -lt $lines.Length; $i++) {
    $line = $lines[$i]
    $j = 0
    $in_string = $false
    while ($j -lt $line.Length) {
        $c = $line[$j]
        if ($c -eq '"' -and ($j -eq 0 -or $line[$j-1] -ne '\')) {
            $in_string = -not $in_string
            $j++
        } elseif (-not $in_string) {
            if ($c -eq '{') { $opens++; Write-Host ("OPEN   {0,4}: $line" -f ($i+1)); $j++ }
            elseif ($c -eq '}') { $closes++; Write-Host ("CLOSE  {0,4}: $line" -f ($i+1)); $j++ }
            else { $j++ }
        } else { $j++ }
    }
}
Write-Host ""
Write-Host "Opens: $opens, Closes: $closes, Diff: $($opens - $closes)"
