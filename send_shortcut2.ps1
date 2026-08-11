Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")]
    public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int vKey);
    [DllImport("user32.dll")]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
}
"@
Start-Sleep 3
$WM_KEYDOWN = 0x0100
$WM_KEYUP = 0x0101
$VK_CONTROL = 0x11
$VK_SHIFT = 0x10
$VK_R = 0x52

# Find the window
$hwnd = [Win32]::FindWindow($null, "EduOS Browser")
if ($hwnd -ne [IntPtr]::Zero) {
    Write-Host "Found window: $hwnd"

    # Send Ctrl+Shift+R
    # Ctrl down
    [Win32]::PostMessage($hwnd, $WM_KEYDOWN, [IntPtr]::new($VK_CONTROL), [IntPtr]::Zero)
    Start-Sleep 10
    # Shift down
    [Win32]::PostMessage($hwnd, $WM_KEYDOWN, [IntPtr]::new($VK_SHIFT), [IntPtr]::Zero)
    Start-Sleep 10
    # R down
    [Win32]::PostMessage($hwnd, $WM_KEYDOWN, [IntPtr]::new($VK_R), [IntPtr]::Zero)
    Start-Sleep 10
    # R up
    [Win32]::PostMessage($hwnd, $WM_KEYUP, [IntPtr]::new($VK_R), [IntPtr]::Zero)
    Start-Sleep 10
    # Shift up
    [Win32]::PostMessage($hwnd, $WM_KEYUP, [IntPtr]::new($VK_SHIFT), [IntPtr]::Zero)
    Start-Sleep 10
    # Ctrl up
    [Win32]::PostMessage($hwnd, $WM_KEYUP, [IntPtr]::new($VK_CONTROL), [IntPtr]::Zero)

    Write-Host "Sent Ctrl+Shift+R via PostMessage"
} else {
    Write-Host "Window not found"
}
