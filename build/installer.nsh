; Orfeo — custom NSIS uninstaller behavior.
; Asks the user during uninstall whether to also delete %APPDATA%\Orfeo —
; saved preferences, the library-folder pointer, cached soundfonts, and the
; copied Demo/ files. Three-way choice, not just yes/no: a user who never
; configured a library folder has their edited MIDI files saved inside this
; same %APPDATA%\Orfeo tree (see electron/main.ts's getOrfeoOutputDir/
; ensureDemoFolder — no library folder means the fallback Demo/ lives here,
; and edits get written to Demo/Orfeo/ beside it), so a blanket delete would
; destroy real user work, not just disposable app state.
;
; This is a direct MessageBox, not a Components-page checkbox — electron-
; builder's stock uninstaller.nsh never inserts an uninstall Components
; page, so a Section declared /o (optional/unchecked) has nothing to
; select it: it silently never runs. A blocking MessageBox guarantees
; every user actually sees and answers this. MessageBox can't relabel its
; own Yes/No/Cancel buttons without an extra plugin, so the choices are
; spelled out in the prompt text instead.
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
    MessageBox MB_YESNOCANCEL|MB_ICONQUESTION "Delete your Orfeo settings and data?$\r$\n$\r$\nYES — delete everything: preferences, library-folder link, downloaded soundfonts, demo files, and any edited MIDI files saved without a library folder set.$\r$\nNO — keep your edited MIDI files (moved to a folder on your Desktop), delete everything else.$\r$\nCANCEL — keep everything, delete nothing.$\r$\n$\r$\nYour library folder itself (wherever you pointed Orfeo at) is never touched either way." \
      IDYES orfeo_delete_all IDCANCEL orfeo_end

    ; NO — the fallback Demo/ (no library folder configured) is the only
    ; place inside %APPDATA%\Orfeo user edits can exist — current demo
    ; content is flat (public/demo has no subfolders), so Demo\Orfeo is the
    ; single fixed depth to check; revisit if demo content ever grows
    ; subfolders (copyDemoFilesRecursive already preserves those).
    IfFileExists "$APPDATA\${APP_FILENAME}\Demo\Orfeo\*.*" 0 orfeo_delete_all
      CreateDirectory "$DESKTOP\Orfeo Edited Files"
      CopyFiles /SILENT "$APPDATA\${APP_FILENAME}\Demo\Orfeo\*.*" "$DESKTOP\Orfeo Edited Files"

    orfeo_delete_all:
    RMDir /r "$APPDATA\${APP_FILENAME}"

    orfeo_end:
  SectionEnd
!macroend
