param([string]$OutFile = "D:\dev\serial_2hour.txt", [int]$DurationSec = 7200)
try {
  $port = New-Object System.IO.Ports.SerialPort COM4,115200,None,8,One
  $port.ReadTimeout = 1000
  $port.Open()
  $output = ""
  $lastFlush = ""
  $end = (Get-Date).AddSeconds($DurationSec)
  $flushCounter = 0
  while ((Get-Date) -lt $end) {
    Start-Sleep -Milliseconds 400
    if ($port.BytesToRead -gt 0) {
      $chunk = $port.ReadExisting()
      $output += $chunk
    }
    $flushCounter++
    if ($flushCounter -ge 150) {
      $flushCounter = 0
      $output | Out-File -FilePath $OutFile -Encoding utf8 -NoNewline
      $stamp = Get-Date -Format "HH:mm:ss"
      $output += "`n# flush $stamp`n"
    }
  }
  $port.Close()
  $output | Out-File -FilePath $OutFile -Encoding utf8 -NoNewline
  Write-Output "DONE bytes=$($output.Length)"
} catch {
  Write-Output "ERROR: $($_.Exception.Message)"
  if ($port -and $port.IsOpen) { $port.Close() }
}
