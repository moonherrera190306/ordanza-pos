' Ordanza POS: arranca el lanzador sin ventana de consola.
' Sin argumentos = servidor (inicio de Windows). Con --abrir = abre la ventana del sistema.
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
arg = ""
If WScript.Arguments.Count > 0 Then arg = " " & WScript.Arguments(0)
CreateObject("WScript.Shell").Run """" & dir & "\node\node.exe"" """ & dir & "\lanzador\ordanza.mjs""" & arg, 0, False
