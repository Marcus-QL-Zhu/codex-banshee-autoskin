# Windows desktop launch troubleshooting

## App-local path virtualization

A script written from inside the packaged Codex app may be redirected into
`%LOCALAPPDATA%\Packages\<Codex package family>\LocalCache\Local`, even when
the writing process reports a normal `%LOCALAPPDATA%` path. A desktop-launched
PowerShell process can see a different filesystem view. An in-app `Test-Path`
or successful launch is therefore not sufficient desktop acceptance evidence.

For a custom launcher, put the entry script in a stable, non-virtualized user
directory (for example Documents), point the shortcut at that actual script,
and verify all referenced runtime paths from the desktop session. Do not copy
machine-specific core paths or credentials into this repository. Use native
Windows PowerShell 5.1 for the Windows Appx/security-module workflow.

During diagnosis use `-NoProfile -NoExit -ExecutionPolicy Bypass -File "..."`
without a hidden window so errors remain visible. Back up the shortcut first.
Acceptance requires launching the actual desktop shortcut and confirming a
visible skinned window, not merely a CDP verification success in another session.

## Isolated profile

Use `start-dream-skin.ps1 -ProfilePath <directory>` to leave an existing official
Codex instance running. The launcher sets `CODEX_ELECTRON_USER_DATA_PATH` for
its child because the app bootstrap can override `--user-data-dir` alone.
The original window is not reskinned by this separate instance.

Verification diagnostics are retained in `verify-result.json` and
`verify-error.log` under the Dream Skin state directory. Empty, zero-height
home suggestion rails are optional and must not disable the whole skin.
