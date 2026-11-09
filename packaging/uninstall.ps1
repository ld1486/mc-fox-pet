# Uninstall "Fox Desk / 狐狸书桌": remove shortcuts, the uninstall entry and the
# program folder. Chat / writing settings stay in %APPDATA%\mc-fox-pet.
$ErrorActionPreference = 'SilentlyContinue'

$dest = Split-Path -Parent $MyInvocation.MyCommand.Path
$man = Join-Path $dest 'resources\app\package.json'
$appName = 'Fox Desk'
$appLang = 'en'
if (Test-Path $man) {
  $meta = Get-Content $man -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($meta.productName) { $appName = $meta.productName }
  if ($meta.defaultLang) { $appLang = $meta.defaultLang }
}

Remove-Item (Join-Path ([Environment]::GetFolderPath('Desktop')) ($appName + '.lnk')) -Force
Remove-Item (Join-Path $env:APPDATA ('Microsoft\Windows\Start Menu\Programs\' + $appName + '.lnk')) -Force
Remove-Item ('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\FoxDesk-' + $appLang) -Recurse -Force

Write-Host "Shortcuts and the uninstall entry are gone. / 已删除快捷方式和注册表项。"

if (Get-Process -Name electron -ErrorAction SilentlyContinue) {
  Write-Host "The app still seems to be running - close it first. / 提示：程序似乎还在运行，先关掉它再删除目录。"
  pause
}

# The folder can only be removed after this script exits.
Start-Process -FilePath "$env:comspec" `
  -ArgumentList '/c', "timeout /t 2 >nul & rmdir /s /q `"$dest`"" `
  -WindowStyle Hidden

Write-Host "Program folder goes away in two seconds. Settings kept in %APPDATA%\mc-fox-pet. / 程序目录会在两秒后删除，配置保留。"
