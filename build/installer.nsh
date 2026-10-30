; Orfeo — custom NSIS uninstaller behavior.
; Asks the user during uninstall what to do with %APPDATA%\Orfeo — saved
; preferences, the library-folder pointer, cached soundfonts, and the copied
; Demo/ files. Not just yes/no: a user who never configured a library folder
; has their edited MIDI files saved inside this same %APPDATA%\Orfeo tree
; (see electron/main.ts's getOrfeoOutputDir/ensureDemoFolder — no library
; folder means the fallback Demo/ lives here, and edits get written to
; Demo/Orfeo/ beside it), so a blanket delete would destroy real user work,
; not just disposable app state.
;
; ── The uninstaller's data choice: its own page, shown after the welcome page
; and BEFORE anything is removed, so "Keep everything" can still stop the
; uninstall. Four named choices, each saying exactly what it does underneath
; — a MessageBox can only offer Yes/No/Cancel, which people misread. The
; button below reads Uninstall, or Close for "Keep everything". The cleanup
; section further down acts on $orfeoChoice once the app files are gone:
;   1  Delete everything
;   2  Keep my edited files (moved to the Desktop), delete the rest
;   3  Remove Orfeo, keep my data   ← preselected: nothing is lost
;   4  Keep everything — the uninstall stops here, nothing touched
; A silent or auto-update uninstall shows no pages: $orfeoChoice stays empty,
; which the section treats as 3 (and it skips those runs earlier anyway).
;
; electron-builder includes this file BEFORE installer.nsi pulls in MUI2 and
; LogicLib, so the page's functions live inside customUnWelcomePage, which
; it inserts later, among the uninstaller's pages (uninstaller pass only —
; the build treats warnings as errors, and the installer pass would warn
; about un.* functions it never uses).

!ifdef BUILD_UNINSTALLER
  ; installer.nsi adds a "Choose Components" page to the uninstaller whenever
  ; customUnInstallSection exists; our sections are hidden, so all it ever
  ; shows is a greyed-out "Uninstall" tick. Skipped: this file comes before
  ; installer.nsi, so the define applies to that page, the first one inserted.
  !define MUI_PAGE_CUSTOMFUNCTION_PRE un.orfeoSkipPage
  Function un.orfeoSkipPage
    Abort
  FunctionEnd
!endif

; one choice: its name by a radio button, what it does underneath in dark
; grey (black and grey like the rest of the uninstaller; Windows' command-link
; buttons draw their text in a fixed blue). Defined out here: a macro can't be
; defined inside another one.
!macro orfeoChoiceRow N TOP NTOP TITLE NOTE
  ${NSD_CreateRadioButton} 0 ${TOP}u 100% 12u "${TITLE}"
  Pop $orfeoRadio${N}
  SendMessage $orfeoRadio${N} ${WM_SETFONT} $orfeoTitleFont 1
  ${NSD_OnClick} $orfeoRadio${N} un.orfeoChoiceClick
  ${NSD_CreateLabel} 13u ${NTOP}u -13u 22u "${NOTE}"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $orfeoNoteFont 1
  SetCtlColors $0 0x5F5F5F transparent
!macroend

!macro customUnWelcomePage
  ; no Back on the welcome page: the only page "before" it is the skipped
  ; Components page, so Back would just close the uninstaller
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW un.orfeoWelcomeShow
  !insertmacro MUI_UNPAGE_WELCOME
  UninstPage custom un.orfeoChoicePage un.orfeoChoiceLeave

  Function un.orfeoWelcomeShow
    GetDlgItem $0 $HWNDPARENT 3
    ShowWindow $0 ${SW_HIDE}
  FunctionEnd

  !include nsDialogs.nsh

  Var orfeoChoice
  Var orfeoTitleFont
  Var orfeoNoteFont
  Var orfeoRadio1
  Var orfeoRadio2
  Var orfeoRadio3
  Var orfeoRadio4

  Function un.orfeoChoicePage
    ${If} $orfeoChoice == ""
      StrCpy $orfeoChoice 3
    ${EndIf}
    !insertmacro MUI_HEADER_TEXT "What should happen to your Orfeo data?" "Your library folder and the files in it are never touched."
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    CreateFont $orfeoTitleFont "Segoe UI Semibold" 10 600
    CreateFont $orfeoNoteFont "Segoe UI" 9 400
    !insertmacro orfeoChoiceRow 1 0 13 "Delete everything" "Deletes all Orfeo data, including preferences, library folder link, downloaded soundfonts, demo files and edited MIDI files not stored in a library folder."
    !insertmacro orfeoChoiceRow 2 37 50 "Keep my edited files" "Moves edited MIDI files to the Desktop, then deletes all other Orfeo data."
    !insertmacro orfeoChoiceRow 3 65 78 "Remove Orfeo, keep my data" "Removes the app but leaves your preferences, library folder link, soundfonts, demo and edited files in place, ready for a reinstall."
    !insertmacro orfeoChoiceRow 4 102 115 "Keep everything" "Cancels the uninstall and leaves all files untouched."
    ${Select} $orfeoChoice
      ${Case} 1
        ${NSD_Check} $orfeoRadio1
      ${Case} 2
        ${NSD_Check} $orfeoRadio2
      ${Case} 4
        ${NSD_Check} $orfeoRadio4
      ${CaseElse}
        ${NSD_Check} $orfeoRadio3
    ${EndSelect}
    Call un.orfeoChoiceButton
    nsDialogs::Show
  FunctionEnd

  Function un.orfeoChoiceClick
    Pop $0
    ${If} $0 == $orfeoRadio1
      StrCpy $orfeoChoice 1
    ${ElseIf} $0 == $orfeoRadio2
      StrCpy $orfeoChoice 2
    ${ElseIf} $0 == $orfeoRadio4
      StrCpy $orfeoChoice 4
    ${Else}
      StrCpy $orfeoChoice 3
    ${EndIf}
    Call un.orfeoChoiceButton
  FunctionEnd

  ; the button says what will happen: Uninstall, or Close for "Keep everything"
  Function un.orfeoChoiceButton
    GetDlgItem $0 $HWNDPARENT 1
    ${If} $orfeoChoice == 4
      SendMessage $0 ${WM_SETTEXT} 0 "STR:$(^CloseBtn)"
    ${Else}
      SendMessage $0 ${WM_SETTEXT} 0 "STR:$(^UninstallBtn)"
    ${EndIf}
  FunctionEnd

  Function un.orfeoChoiceLeave
    ${If} $orfeoChoice == 4
      Quit
    ${EndIf}
  FunctionEnd
!macroend

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
; The leading "-" makes this a hidden section that always runs
; automatically, with no Components-page checkbox to fail to select it from.
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

    ; What the choice page asked for (see un.orfeoChoicePage above); 4 never gets
    ; here (it quits on that page), and 3 or none keeps everything
    ${If} $orfeoChoice == 1
      Goto orfeo_delete_all
    ${ElseIf} $orfeoChoice != 2
      Goto orfeo_restore_context
    ${EndIf}

    ; Keep my edited files — the fallback Demo/ (no library folder configured)
    ; is the only place inside %APPDATA%\Orfeo user edits can exist — current demo
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
