@echo off
chcp 65001 >nul
title Ordanza POS - Respaldo
"%~dp0node\node.exe" "%~dp0lanzador\ordanza.mjs" --respaldar
echo.
pause
