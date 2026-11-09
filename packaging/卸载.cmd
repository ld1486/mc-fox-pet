@echo off
chcp 65001 >nul
rem 卸载「狐狸书桌」：删除快捷方式、注册表项和程序目录（保留配置）。
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1"
