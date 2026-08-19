; Orfeo — custom NSIS uninstaller behavior.
; Adds an optional (unchecked by default) component on the uninstaller's
; component-selection page: "Delete my Orfeo settings and library data".
; If the user checks it, this removes %APPDATA%\Orfeo entirely — saved
; preferences, the library-folder pointer, cached soundfonts, and the
; copied Demo/ files. Left unchecked, uninstall only removes the app
; itself and this folder is untouched (so reinstalling later restores the
; user right where they left off).
;
; ${APP_FILENAME} is electron-builder's own build-time constant derived
; from productName ("Orfeo") — same folder electron-builder's built-in
; deleteAppDataOnUninstall option would target, just made opt-in here
; instead of automatic.
!macro customUnInstallSection
  Section /o "Delete my Orfeo settings and library data"
    RMDir /r "$APPDATA\${APP_FILENAME}"
  SectionEnd
!macroend
