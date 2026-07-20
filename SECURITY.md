# Security policy

## Supported versions

| Version | Security updates |
|---|---|
| 2.3.x | Supported |
| 2.0.x and earlier | Upgrade recommended |

## Reporting a vulnerability

Please use the repository's **Security** tab and choose **Report a vulnerability** so the report stays private. Include the affected version, Windows and Codex package versions, a minimal reproduction, and the expected impact. Do not include authentication data, private task content, unredacted logs, or live screenshots. If private reporting is unavailable, contact the maintainer through GitHub with only a request for a private channel; do not publish exploit details in an issue.

## Security model

Codex AutoSkin is a per-user customization layer. It does not require administrator privileges and does not modify `WindowsApps`, `app.asar`, or the Microsoft Store package. It verifies the Store package identity, copies the application payload to a per-user runtime, verifies critical files including the bundled Node executable by hash, launches that copy with a persisted random DevTools port, and injects the selected local theme into the main renderer. End users do not need to install or trust a separate Node executable from `PATH`.

The DevTools endpoint is powerful: any process that can control it can execute code in the renderer context. AutoSkin therefore accepts only IPv4 or IPv6 loopback endpoints and must never be configured to listen on a LAN or public interface. Only run a trusted checkout or release, and review third-party themes before installing them. A theme can influence CSS and displayed text even though network imports and unscoped theme CSS are rejected.

AutoSkin does not intentionally send telemetry or repository data over the network. Runtime communication is limited to the local DevTools endpoint. The normal Codex application continues to handle its own authentication and network traffic under OpenAI's policies.

The trust boundary does not include another process already running as the same Windows user. Such a process can generally read or modify the user's repository, local runtime state, browser data, and logs. Protect the Windows account and do not install AutoSkin from an untrusted archive.

## Safe operation

- Keep Codex updated to a supported Store version. Contributors who run JavaScript source tools directly should use a supported Node.js release.
- Do not expose the persisted CDP port through port forwarding, firewall rules, containers, or remote-access tools.
- Save work before installation or recovery because the watcher may need to close and reopen Codex once.
- Treat `%LOCALAPPDATA%\CodexDreamSkin` logs and state as private; they may contain local paths and process metadata.
- Before publishing screenshots, remove real task names, project names, account details, notifications, and local paths. Perform both visual inspection and OCR where possible.
- Uninstall with `scripts\restore-dream-skin.ps1 -Uninstall -RestoreBaseTheme` rather than deleting individual state files.

## Release integrity

Maintainers should run `tools\release-check.ps1` from a clean checkout, review the resulting Git diff, and publish only from a signed-in maintainer account with two-factor authentication. Never reuse or move an existing version tag.
