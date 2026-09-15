param(
    [string]$Script,
    [string]$LogFile
)

$logDir = Split-Path $LogFile -Parent
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

# Start node process completely detached - no console, no job object
$pinfo = New-Object System.Diagnostics.ProcessStartInfo
$pinfo.FileName = "node.exe"
$pinfo.Arguments = "`"$Script`""
$pinfo.WorkingDirectory = "C:\Users\cash\projects\smc-icm-trading"
$pinfo.RedirectStandardOutput = $true
$pinfo.RedirectStandardError = $true
$pinfo.UseShellExecute = $false
$pinfo.CreateNoWindow = $true
$pinfo.LoadUserProfile = $true

$p = New-Object System.Diagnostics.Process
$p.StartInfo = $pinfo
$p.Start() | Out-Null

# Write PID for tracking
$pid | Out-File -FilePath "$LogFile.pid" -NoNewline

# Read stdout/stderr asynchronously
$outTask = $p.StandardOutput.ReadToEndAsync()
$errTask = $p.StandardError.ReadToEndAsync()

# Write startup confirmation
"LAUNCHED: $Script`nPID: $($p.Id)`nTime: $(Get-Date -Format 'HH:mm:ss')" | Out-File -FilePath $LogFile

# Wait and capture output
$p.WaitForExit()
$stdout = $outTask.Result
$stderr = $errTask.Result

if ($stdout) { Add-Content -Path $LogFile -Value "`n--- STDOUT ---`n$stdout" }
if ($stderr) { Add-Content -Path $LogFile -Value "`n--- STDERR ---`n$stderr" }
Add-Content -Path $LogFile -Value "`n--- EXIT CODE: $($p.ExitCode) ---"