# Install "Fox Desk / 狐狸书桌": copy to %LOCALAPPDATA%\Programs and create
# Desktop + Start Menu shortcuts. No admin rights needed.
# Called by 安装快捷方式.cmd / install.cmd.
$ErrorActionPreference = 'Stop'

$src = Split-Path -Parent $MyInvocation.MyCommand.Path
$man = Join-Path $src 'resources\app\package.json'
$appName = 'Fox Desk'
$appLang = 'en'
if (Test-Path $man) {
  $meta = Get-Content $man -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($meta.productName) { $appName = $meta.productName }
  if ($meta.defaultLang) { $appLang = $meta.defaultLang }
}

$dest = Join-Path $env:LOCALAPPDATA ("Programs\" + $appName)
$exe = Join-Path $dest 'electron.exe'
$icon = Join-Path $dest 'resources\app\assets\icon.ico'

if (-not (Test-Path (Join-Path $src 'electron.exe'))) {
  throw "electron.exe not found. Unzip the whole archive first. / 没有找到 electron.exe，请先完整解压压缩包。"
}

Write-Host ""
Write-Host "Installing to / 正在安装到: $dest"
Write-Host ""

if (Test-Path $dest) {
  # Program files only; user settings stay in %APPDATA%\mc-fox-pet
  Remove-Item $dest -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $dest | Out-Null

& robocopy $src $dest /E /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "copy failed / 复制文件失败 (robocopy $LASTEXITCODE)" }

foreach ($f in @('安装快捷方式.cmd', 'install.cmd', 'install.ps1', '使用说明.txt', 'README.txt')) {
  Remove-Item (Join-Path $dest $f) -Force -ErrorAction SilentlyContinue
}

if (-not (Test-Path $exe)) { throw "electron.exe missing after copy / 安装后缺少 electron.exe。" }

$shell = New-Object -ComObject WScript.Shell
$targets = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) ($appName + '.lnk')),
  (Join-Path $env:APPDATA ('Microsoft\Windows\Start Menu\Programs\' + $appName + '.lnk'))
)
foreach ($lnkPath in $targets) {
  $dir = Split-Path -Parent $lnkPath
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $lnk = $shell.CreateShortcut($lnkPath)
  $lnk.TargetPath = $exe
  $lnk.WorkingDirectory = $dest
  $lnk.IconLocation = "$icon,0"
  $lnk.Description = 'Minecraft fox desktop pet / Minecraft 狐狸桌面宠物'
  $lnk.Save()
  Write-Host "Shortcut created / 已创建快捷方式: $lnkPath"
}

$uninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\FoxDesk-' + $appLang
New-Item -Path $uninstallKey -Force | Out-Null
Set-ItemProperty -Path $uninstallKey -Name 'DisplayName' -Value $appName
Set-ItemProperty -Path $uninstallKey -Name 'DisplayIcon' -Value "$icon,0"
Set-ItemProperty -Path $uninstallKey -Name 'DisplayVersion' -Value '1.0.0'
Set-ItemProperty -Path $uninstallKey -Name 'Publisher' -Value 'Fox Desk'
Set-ItemProperty -Path $uninstallKey -Name 'InstallLocation' -Value $dest
Set-ItemProperty -Path $uninstallKey -Name 'NoModify' -Value 1 -Type DWord
Set-ItemProperty -Path $uninstallKey -Name 'NoRepair' -Value 1 -Type DWord
Set-ItemProperty -Path $uninstallKey -Name 'UninstallString' -Value "`"$dest\卸载.cmd`""

Write-Host ""
Write-Host "Done / 安装完成。"
