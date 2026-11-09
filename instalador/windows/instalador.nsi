; Instalador de Ordanza POS (versión local, Windows 10/11 x64).
; Lo compila instalador/construir.sh: makensis -DVERSION=… -DORIGEN=… -DSALIDA=… instalador.nsi
Unicode true
SetCompressor /SOLID lzma
SetCompressorDictSize 64

!include "MUI2.nsh"
!include "x64.nsh"

Name "Ordanza POS"
OutFile "${SALIDA}"
InstallDir "$PROGRAMFILES64\Ordanza POS"
InstallDirRegKey HKLM "Software\Ordanza POS" "Ruta"
RequestExecutionLevel admin
BrandingText "Ordanza · Software que pone en orden"
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "Ordanza POS"
VIAddVersionKey "CompanyName" "Ordanza"
VIAddVersionKey "FileDescription" "Instalador de Ordanza POS"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "Ordanza"

; Con SetShellVarContext all, $APPDATA es C:\ProgramData
!define DATOS "$APPDATA\OrdanzaPOS"
!define MUI_ICON "${ORIGEN}\ordanza.ico"
!define MUI_UNICON "${ORIGEN}\ordanza.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Instalar Ordanza POS"
!define MUI_WELCOMEPAGE_TEXT "Inventario y punto de venta para tu negocio.$\r$\n$\r$\nSe instala en esta computadora con su propia base de datos; no necesita internet para vender. Esta computadora será la caja principal: las demás cajas y tablets se conectan a ella por la red del negocio.$\r$\n$\r$\nIncluye 15 días de prueba con todo el sistema."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Abrir Ordanza POS"
!define MUI_FINISHPAGE_RUN_FUNCTION Abrir

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SpanishInternational"

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "Ordanza POS necesita Windows de 64 bits."
    Abort
  ${EndIf}
  SetRegView 64
FunctionEnd

Function Abrir
  ExecShell "" "$WINDIR\System32\wscript.exe" '"$INSTDIR\ordanza.vbs" --abrir'
FunctionEnd

; Detiene una instalación anterior (servidor y base de datos) para poder reemplazar archivos.
!macro Detener
  IfFileExists "$INSTDIR\node\node.exe" 0 +3
    nsExec::Exec '"$INSTDIR\node\node.exe" "$INSTDIR\lanzador\ordanza.mjs" --detener'
    Pop $0
  nsExec::Exec `powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process node,postgres -ErrorAction SilentlyContinue | Where-Object { $$_.Path -like '$INSTDIR\*' } | Stop-Process -Force"`
  Pop $0
  Sleep 1500
!macroend

Section "Ordanza POS" SecMain
  SetShellVarContext all
  !insertmacro Detener

  SetOutPath "$INSTDIR"
  ; Limpia la app anterior (los datos viven aparte, en ${DATOS}).
  RMDir /r "$INSTDIR\app"
  File /r "${ORIGEN}\*.*"

  ; Carpeta de datos compartida para todos los usuarios de Windows.
  CreateDirectory "${DATOS}"
  nsExec::Exec 'icacls "${DATOS}" /grant *S-1-5-32-545:(OI)(CI)M /T /C /Q'
  Pop $0

  ; Las demás cajas y tablets entran por la red del negocio.
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Ordanza POS"'
  Pop $0
  nsExec::Exec 'netsh advfirewall firewall add rule name="Ordanza POS" dir=in action=allow protocol=TCP localport=3000 profile=private,domain'
  Pop $0

  ; Accesos directos
  CreateShortCut "$DESKTOP\Ordanza POS.lnk" "$WINDIR\System32\wscript.exe" '"$INSTDIR\ordanza.vbs" --abrir' "$INSTDIR\ordanza.ico" 0
  CreateDirectory "$SMPROGRAMS\Ordanza POS"
  CreateShortCut "$SMPROGRAMS\Ordanza POS\Ordanza POS.lnk" "$WINDIR\System32\wscript.exe" '"$INSTDIR\ordanza.vbs" --abrir' "$INSTDIR\ordanza.ico" 0
  CreateShortCut "$SMPROGRAMS\Ordanza POS\Respaldar ahora.lnk" "$INSTDIR\Respaldar ahora.cmd" "" "$INSTDIR\ordanza.ico" 0
  CreateShortCut "$SMPROGRAMS\Ordanza POS\Restaurar respaldo.lnk" "$INSTDIR\Restaurar respaldo.cmd" "" "$INSTDIR\ordanza.ico" 0
  CreateShortCut "$SMPROGRAMS\Ordanza POS\Desinstalar.lnk" "$INSTDIR\Desinstalar.exe"
  ; El servidor arranca solo al iniciar sesión en Windows.
  CreateShortCut "$SMSTARTUP\Ordanza POS (servidor).lnk" "$WINDIR\System32\wscript.exe" '"$INSTDIR\ordanza.vbs"' "$INSTDIR\ordanza.ico" 0

  WriteUninstaller "$INSTDIR\Desinstalar.exe"
  WriteRegStr HKLM "Software\Ordanza POS" "Ruta" "$INSTDIR"
  !define UNINST "Software\Microsoft\Windows\CurrentVersion\Uninstall\OrdanzaPOS"
  WriteRegStr HKLM "${UNINST}" "DisplayName" "Ordanza POS"
  WriteRegStr HKLM "${UNINST}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "${UNINST}" "Publisher" "Ordanza"
  WriteRegStr HKLM "${UNINST}" "DisplayIcon" "$INSTDIR\ordanza.ico"
  WriteRegStr HKLM "${UNINST}" "UninstallString" '"$INSTDIR\Desinstalar.exe"'
  WriteRegDWORD HKLM "${UNINST}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINST}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  SetShellVarContext all
  SetRegView 64
  !insertmacro Detener
  Delete "$DESKTOP\Ordanza POS.lnk"
  Delete "$SMSTARTUP\Ordanza POS (servidor).lnk"
  RMDir /r "$SMPROGRAMS\Ordanza POS"
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Ordanza POS"'
  Pop $0
  RMDir /r "$INSTDIR"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\OrdanzaPOS"
  DeleteRegKey HKLM "Software\Ordanza POS"
  MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "¿Borrar también la base de datos (ventas, productos, clientes)?$\r$\n$\r$\nElige No si vas a reinstalar. Los respaldos en Documentos\Ordanza Respaldos no se borran." IDNO +2
    RMDir /r "${DATOS}"
SectionEnd
