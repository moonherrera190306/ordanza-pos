@echo off
chcp 65001 >nul
title Ordanza POS - Restaurar respaldo
if "%~1"=="" (
  echo.
  echo  Arrastra el archivo de respaldo ^(ordanza-AAAA-MM-DD.json.gz^) encima de este icono.
  echo  Los respaldos estan en Documentos\Ordanza Respaldos.
  echo.
  pause
  exit /b
)
echo.
echo  Se va a reemplazar TODA la informacion actual por la del respaldo:
echo  %~1
echo  Antes se guarda una copia de lo que hay ahora.
echo.
choice /c SN /m " Continuar"
if errorlevel 2 exit /b
"%~dp0node\node.exe" "%~dp0lanzador\ordanza.mjs" --restaurar "%~1"
echo.
pause
