Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Start-Sleep 3

# Find the EduOS Browser window
$root = [System.Windows.Automation.AutomationElement]::RootElement
$condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, "EduOS Browser")
$window = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $condition)

if ($window -eq $null) {
    Write-Host "Window not found"
    exit 1
}

Write-Host "Found window"

# Send Ctrl+Shift+R to toggle R1 panel
$ctrlShiftR = New-Object System.Windows.Input.KeyEventArgs([System.Windows.Input.Keyboard]::Device, 0, [System.Windows.Input.Key]::LeftCtrl, [System.Windows.Input.Key]::LeftShift, [System.Windows.Input.Key]::R)
# Use SendKeys instead
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("^+(r)")
Start-Sleep 2

Write-Host "Sent Ctrl+Shift+R"
