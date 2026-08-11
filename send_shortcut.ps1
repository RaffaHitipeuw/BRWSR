Add-Type -AssemblyName System.Windows.Forms
Start-Sleep 2
# Bring window to foreground first
$proc = Get-Process eduos-browser -ErrorAction SilentlyContinue
if ($proc) {
    Write-Host "Found process $($proc.Id)"
    $hwnd = $proc.MainWindowHandle
    Write-Host "Window handle: $hwnd"
    if ($hwnd -ne [IntPtr]::Zero) {
        [System.Windows.Forms.SetForegroundWindow]::Invoke($hwnd)
        Start-Sleep 0.5
        [System.Windows.Forms.SendKeys]::SendWait('^+(r)')
        Start-Sleep 1
        Write-Host "Sent Ctrl+Shift+R"
    } else {
        Write-Host "HWND is zero - trying to find child windows"
    }
} else {
    Write-Host "Process not found"
}
