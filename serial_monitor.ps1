param([string]$OutFile = "D:\dev\serial_capture.txt", [int]$DurationSec = 80)
try {
  $port = New-Object System.IO.Ports.SerialPort COM4,115200,None,8,One
  $port.ReadTimeout = 1000
  $port.Open()
  $output = ""
  $end = (Get-Date).AddSeconds($DurationSec)
  while ((Get-Date) -lt $end) {
    Start-Sleep -Milliseconds 400
    if ($port.BytesToRead -gt 0) {
      $chunk = $port.ReadExisting()
      $output += $chunk
    }
  }
  $port.Close()
  $output | Out-File -FilePath $OutFile -Encoding utf8 -NoNewline
  Write-Output "DONE bytes=$($output.Length)"
} catch {
  Write-Output "ERROR: $($_.Exception.Message)"
  if ($port -and $port.IsOpen) { $port.Close() }
}
