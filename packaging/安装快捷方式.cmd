@echo off
chcp 65001 >nul
rem Installs into %LOCALAPPDATA%\Programs, no admin required.
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
if errorlevel 1 (
  echo.
  echo 安装失败，请把上面的错误信息截图发给作者。
  pause
  exit /b 1
)
echo.
echo 装好了：桌面和开始菜单里都有「狐狸书桌」。
echo 双击快捷方式就能把狐狸叫出来。
echo.
pause
