; Orfeo — custom NSIS uninstaller behavior.
; Asks the user during uninstall whether to also delete %APPDATA%\Orfeo —
; saved preferences, the library-folder pointer, cached soundfonts, and the
; copied Demo/ files. Answering No leaves this folder untouched (so
; reinstalling later restores the user right where they left off).
;
; This is a direct MessageBox, not a Components-page checkbox — electron-
; builder's stock uninstaller.nsh never inserts an uninstall Components
; page, so a Section declared /o (optional/unchecked) has nothing to
; select it: it silently never runs. A blocking MessageBox guarantees
; every user actually sees and answers this.
;
; ${APP_FILENAME} is electron-builder's own build-time constant derived
; from productName ("Orfeo") — same folder electron-builder's built-in
; deleteAppDataOnUninstall option would target, just asked interactively
; here instead of being an all-or-nothing build-time flag.
; MessageBox (like RMDir) is only valid inside a Section or Function — the
; leading "-" makes this a hidden section that always runs automatically,
; with no Components-page checkbox to fail to select it from (see above).
!macro customUnInstallSection
  Section "-Orfeo Data Cleanup"
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "Also delete your Orfeo settings and library data?$\r$\n$\r$\nThis removes saved preferences, your library-folder link, downloaded soundfonts, and demo files. Your own MIDI files are never touched." \
      IDNO orfeo_keep_data
    RMDir /r "$APPDATA\${APP_FILENAME}"
    orfeo_keep_data:
  SectionEnd
!macroend
