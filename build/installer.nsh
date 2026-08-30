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
; This is a direct MessageBox, not a Components-page checkbox — a Section
; declared /o (optional/unchecked) would need the user to actively tick it
; on the uninstall Components page (which electron-builder only inserts
; *because* this macro exists — see installer.nsi's
; `!ifmacrodef customUnInstallSection` check — and which most users click
; past without reading). A blocking MessageBox guarantees every user
; actually sees and answers this. MessageBox can't relabel its own
; Yes/No/Cancel buttons without an extra plugin, so the choices are spelled
; out in the prompt text instead.
;
; The section name below MUST keep the "un." prefix ("-un.Orfeo Data
; Cleanup"), even though it's hidden from the Components page by the
; leading "-". NSIS decides install-vs-uninstall purely by that "un."
; prefix on the section's name — independent of the BUILD_UNINSTALLER
; define electron-builder uses to pick which pass compiles this file.
; Without it, the section silently gets compiled into the *installer*
; side instead and never ships in uninstall.exe at all (verified directly
; with makensis: dropping "un." moves the section out of the "Uninstall:"
; count in the compiler's own summary, with no error or warning) — this is
; exactly how a previous build lost this feature without any visible sign.
;
; ${APP_FILENAME} is electron-builder's own build-time constant derived
; from productName ("Orfeo") — same folder electron-builder's built-in
; deleteAppDataOnUninstall option would target, just asked interactively
; here instead of being an all-or-nothing build-time flag.
; MessageBox (like RMDir) is only valid inside a Section or Function — the
; leading "-" makes this a hidden section that always runs automatically,
; with no Components-page checkbox to fail to select it from (see above).
!macro customUnInstallSection
  Section "-un.Orfeo Data Cleanup"
    ; ── Auto-update path: electron-updater runs uninstall.exe with --updated
    ; (and silently). An update must NEVER prompt or delete user data — the
    ; library-folder link and edited files have to survive it. Same intent as
    ; electron-builder's own `${ifNot} ${isUpdated}` guard; checked here via
    ; the raw flag (${GetParameters}/${GetOptions} are already used a few
    ; lines up in uninstaller.nsh, so they're guaranteed available). A plain
    ; `/S` uninstall is treated the same — keep everything. ────────────────
    ClearErrors
    ${GetParameters} $R0
    ${GetOptions} $R0 "--updated" $R1
    ${IfNot} ${Errors}
      Goto orfeo_end
    ${EndIf}
    IfSilent orfeo_end

    ; ── Electron user data is ALWAYS per-user: %APPDATA%\Orfeo, i.e.
    ; C:\Users\<name>\AppData\Roaming\Orfeo (electron/main.ts's app.setName).
    ; Orfeo installs per-user (nsis.perMachine:false), so this uninstaller
    ; runs unelevated as the right user and $APPDATA is already correct — the
    ; explicit `current` here is belt-and-braces (it also keeps this working
    ; if perMachine is ever turned back on, where the elevated context would
    ; otherwise default to "all" → $APPDATA = C:\ProgramData → RMDir misses
    ; the real folder, which is the bug this whole block once had). ────────
    SetShellVarContext current
    StrCpy $R2 "$APPDATA\${APP_FILENAME}"

    MessageBox MB_YESNOCANCEL|MB_ICONQUESTION "Delete your Orfeo settings and data?$\r$\n$\r$\nYES — delete everything: preferences, library-folder link, downloaded soundfonts, demo files, and any edited MIDI files saved without a library folder set.$\r$\n$\r$\nNO — keep your edited MIDI files (moved to a folder on your Desktop), delete everything else.$\r$\n$\r$\nCANCEL — keep everything, delete nothing.$\r$\n$\r$\nYour library folder itself (wherever you pointed Orfeo at) is never touched either way." \
      IDYES orfeo_delete_all IDCANCEL orfeo_restore_context

    ; NO — the fallback Demo/ (no library folder configured) is the only
    ; place inside %APPDATA%\Orfeo user edits can exist — current demo
    ; content is flat (public/demo has no subfolders), so Demo\Orfeo is the
    ; single fixed depth to check; revisit if demo content ever grows
    ; subfolders (copyDemoFilesRecursive already preserves those).
    IfFileExists "$R2\Demo\Orfeo\*.*" 0 orfeo_delete_all
      CreateDirectory "$DESKTOP\Orfeo Edited Files"
      CopyFiles /SILENT "$R2\Demo\Orfeo\*.*" "$DESKTOP\Orfeo Edited Files"

    orfeo_delete_all:
    ; Loose prefs/log files first and by name — even if a locked cache
    ; subdirectory (Local Storage LOCK, GPUCache) makes the recursive RMDir
    ; below skip files and leave the folder behind, the library link is
    ; still gone and the next launch is a clean first run.
    Delete "$R2\orfeo-prefs.json"
    Delete "$R2\orfeo-file-log.json"
    RMDir /r "$R2"

    ; Never a silent failure again — if the prefs file is somehow still
    ; there, say so, with the exact path, so it can be removed by hand.
    IfFileExists "$R2\orfeo-prefs.json" 0 orfeo_restore_context
      MessageBox MB_OK|MB_ICONEXCLAMATION "Orfeo could not delete its settings file:$\r$\n$R2\orfeo-prefs.json$\r$\n$\r$\nSomething still has it locked (antivirus, or a background process). Delete that folder by hand and Orfeo will start fresh next time."

    orfeo_restore_context:
    ${If} $installMode == "all"
      SetShellVarContext all
    ${EndIf}

    orfeo_end:
  SectionEnd

  ; ── Verify $INSTDIR actually got removed — electron-builder's own uninstall
  ; section already kills every Orfeo.exe process by image name (main window,
  ; GPU/renderer/utility helpers — see app-builder-lib's _CHECK_APP_RUNNING)
  ; before running RMDir /r $INSTDIR, but that RMDir has no error checking of
  ; its own: if anything still had a file open at that exact instant — a
  ; helper process whose handle hadn't released yet, a real-time antivirus
  ; scan touching the folder — NSIS silently skips the locked file(s) and
  ; reports uninstall success anyway, leaving a non-empty $INSTDIR behind
  ; with zero indication of why. This runs after that section (it's declared
  ; later in the same compiled script — see the "un." section-ordering note
  ; above), retries a couple of times (a just-released process handle is the
  ; single most common transient cause), then tells the user exactly what's
  ; left instead of staying silent about it. ─────────────────────────────────
  Section "-un.Orfeo Verify Install Dir Removed"
    IfFileExists "$INSTDIR\*.*" 0 orfeo_instdir_gone
      Sleep 500
      RMDir /r "$INSTDIR"
    IfFileExists "$INSTDIR\*.*" 0 orfeo_instdir_gone
      Sleep 1000
      RMDir /r "$INSTDIR"
    IfFileExists "$INSTDIR\*.*" 0 orfeo_instdir_gone
      MessageBox MB_OK|MB_ICONEXCLAMATION "Some files in:$\r$\n$INSTDIR$\r$\n$\r$\ncould not be removed — likely still in use by another process (or an antivirus scan). You can safely delete this folder manually once nothing has it open."
    orfeo_instdir_gone:
  SectionEnd
!macroend
