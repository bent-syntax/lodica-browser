; Clean up older Lodica installs, then make sure the Start menu entry exists so Windows search finds the app.

!macro customInit
  StrCpy $0 0
  lodicaEnum:
    EnumRegKey $1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall" $0
    StrCmp $1 "" lodicaEnumDone
    IntOp $0 $0 + 1
    StrCmp $1 "${UNINSTALL_APP_KEY}" lodicaEnum
    ReadRegStr $2 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$1" "DisplayName"
    StrCpy $3 $2 6
    StrCmp $3 "Lodica" 0 lodicaEnum
    ReadRegStr $4 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$1" "QuietUninstallString"
    StrCmp $4 "" lodicaEnum
    ExecWait '$4'
    StrCpy $0 0
    Goto lodicaEnum
  lodicaEnumDone:
!macroend

!macro customInstall
  ; stale shortcuts from older builds
  Delete "$DESKTOP\Lodica Browser.lnk"
  Delete "$SMPROGRAMS\Lodica Browser.lnk"
  Delete "$SMPROGRAMS\Lodica Browser\Lodica Browser.lnk"
  RMDir "$SMPROGRAMS\Lodica Browser"
  ; make sure the Start menu entry exists and carries the app id (Windows search indexes it)
  IfFileExists "$SMPROGRAMS\Lodica.lnk" +2 0
    CreateShortCut "$SMPROGRAMS\Lodica.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
  WinShell::SetLnkAUMI "$SMPROGRAMS\Lodica.lnk" "${APP_ID}"
!macroend
