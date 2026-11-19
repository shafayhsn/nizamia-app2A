$ErrorActionPreference = 'Stop'
$installer = (Get-Item desktop/release/NZOS-*-Windows-x64-Setup.exe).FullName
$install = "$env:LOCALAPPDATA\Programs\NZOS"
$profile = "$env:APPDATA\NZOS"
$workspace = "$env:USERPROFILE\NZOS installer test"
New-Item -ItemType Directory -Force -Path $workspace,$profile | Out-Null
@{workspaceParent=$workspace} | ConvertTo-Json | Set-Content "$profile\local-database-settings.json" -Encoding utf8NoBOM
foreach ($attempt in 1..2) {
  $setup = Start-Process $installer -ArgumentList '/S',"/D=$install" -PassThru -Wait
  if ($setup.ExitCode -ne 0) { throw "Installer failed with exit code $($setup.ExitCode)" }
  $app = Start-Process "$install\NZOS.exe" -ArgumentList '--remote-debugging-port=9322' -PassThru
  try {
    node .github/scripts/windows-login-smoke.cjs
    if ($LASTEXITCODE) { throw 'Installed login screen failed' }
    $database = "$workspace\NZOS\Database\nizamia-app2a.sqlite"
    if (!(Test-Path $database)) { throw 'SQLite workspace missing' }
    $backup = "$workspace\NZOS\Backups\installation-test.sqlite"
    if ($attempt -eq 1) { Copy-Item $database $backup }
    if ((Get-FileHash $backup).Hash -ne (Get-FileHash $database).Hash) { throw 'Database changed across reinstall' }
  } finally {
    if (!$app.HasExited) { Stop-Process -Id $app.Id -Force; $app.WaitForExit() }
  }
}
