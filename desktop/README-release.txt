Sprite Check 1.6.1 - Windows x64 portable

1. Extract the complete ZIP to a writable folder.
2. Open Sprite Check.exe. No Node.js or local server is needed.
3. File menu at the top provides Open PNG, Open/Save DAT and Reset Scene.
   Open/Save DAT also have quick buttons in the top bar. Reset asks before
   clearing the current scene; it keeps your pane sizes and source files.
   New scenes hide Compare Log; use SHOW/HIDE COMPARE LOG or its close button.
   Startup is empty. OPEN SPRITE SHEET imports PNG; GRID sets cell dimensions.
   Double-click an animation row to play. New PNG rows default to Loop.
   COMPARE is available before Merge; right side then shows Edited Preview.
   Compare Animation/Sheet, zoom/pan/Fit/1:1, Sync, split slider, Hide/Show Log.
   Log shows actual resolution, PNG+JSON bytes, stored images and timing.
4. DETECT > edit timing/keys > CONFIRM > MERGE > COMPARE > EXPORT.
5. SAVE .DAT stores the project, including the original PNG and edited timelines.
6. OPEN .DAT or drop a .dat into the viewport to resume editing.
7. UI text is at least 12px. Drag pane dividers to resize the workspace,
   Live Preview width/height and Timeline height. Sizes are remembered locally.
   Double-click a divider to reset one pane; RESET LAYOUT resets all panes.
   Tab + arrows adjusts 10px, Shift+arrows 40px. Home/End sets bounds.
   At widths up to 980px the panels stack vertically instead.
8. File > Update checks public GitHub Releases. UPDATE & RESTART saves a recovery
   DAT, downloads and verifies SHA-256, backs up program files, installs and
   reopens the project. UserData and saved projects are preserved.
   Backups/recovery DAT/logs remain in Updates/<job-id> beside the EXE.
   If installation fails, program files are restored where possible.
   Internet is required only for Update. No GitHub login is needed.
   Older releases without this menu need this version installed once first.

Requirements: Windows x64, .NET Framework 4.8+, Microsoft Edge WebView2 Runtime.
WebView2: https://developer.microsoft.com/microsoft-edge/webview2/consumer/
Tested on this machine with WebView2 155.0.4283.62.
Keep app/, DLLs and EXE together. UserData/ is created beside the EXE.
The program does not install itself, change registry entries, or upload artwork.

Save As is used for .dat / PNG / JSON. For Unity, export PNG + JSON together.
The .dat file is a Sprite Check project; it is not a Unity import format.
Save .dat before closing. Undo history starts fresh after reopening a project.
Original source files are not changed. Overwriting a saved file requires choosing
its destination and accepting the standard Windows Save As overwrite dialog.

Full Thai guide: GUIDE.md. Optional standalone Unity reader: Unity/SpriteCheckPlayer.cs.
Unity runtime/Atlas gameplay integration and other computers are not tested here.
New generated pixel icon: app/assets/sprite-check-icon.png, sprite-check.ico.
WebView2 SDK license and notices are in licenses/.

Shortcuts: Spacebar Play/Pause; Ctrl+Z Undo; Ctrl+Y or Ctrl+Shift+Z Redo.
History holds the latest 50 edits per session. New edit clears the redo branch.
UX 1.3: NEXT guides the workflow; previous/next duplicate-group buttons browse
detected repeats. Arrow Left/Right step ticks outside form fields. Hold edits
retain the selected preview; unchanged inputs preserve Redo and merged results.
The compact layout keeps the timeline visible on ordinary laptop windows.
