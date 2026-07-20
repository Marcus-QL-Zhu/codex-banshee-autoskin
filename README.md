# Codex AutoSkin · Banshee Armored Shell

## Codex 自动换肤 · 报丧女妖装甲外壳

**A reversible, native-preserving armored theme engine for the Windows Codex desktop app.**

**一个安全可逆、完整保留原生功能的 Windows Codex 装甲主题引擎。**

Codex AutoSkin applies an independent Banshee-inspired visual system to the official Codex renderer through a local Chrome DevTools Protocol connection. It does not modify `ChatGPT.exe`, `app.asar`, or files inside `WindowsApps`; native controls, account data, accessibility behavior, and Codex features remain owned by the original application. The included armored shell combines blue-black plates, chamfered seams, recessed cavities, synchronized energy pulses, and a Fast-mode awakening palette—without using character, mobile-suit, insignia, or official franchise artwork.

Codex AutoSkin 通过本地 Chrome DevTools Protocol 连接，为官方 Codex 渲染器加载一套独立的“报丧女妖”设计语言外壳。它不会修改 `ChatGPT.exe`、`app.asar` 或 `WindowsApps` 中的官方文件，并保留原生控件、账号数据、无障碍行为及全部 Codex 功能。内置装甲主题由深蓝黑装甲面、斜切接缝、镂空结构、同步能量脉冲和 Fast 觉醒配色组成，同时不使用角色、机体、徽章或官方作品素材。

## Preview / 效果预览

| Awakened Fast Mode / Fast 觉醒模式 | Sealed Normal Mode / 常规封闭模式 |
|---|---|
| ![Banshee awakened Fast mode](docs/banshee-awakened-fast.png) | ![Banshee sealed normal mode](docs/banshee-sealed-normal.png) |

## Core features / 主要特性

- **One-click Windows installation / Windows 一键安装** — extract the repository and run `Install.cmd`; no separate Node.js installation is required. / 解压仓库后运行 `Install.cmd` 即可，无需另外安装 Node.js。
- **Native feature preservation / 保留原生功能** — microphone, Fast mode, model and reasoning selectors, attachments, approvals, send/stop controls, menus, dialogs, and keyboard navigation remain native. / 麦克风、Fast、模型与推理选择、附件、审批、发送与停止、菜单、弹窗和键盘导航均保持原生。
- **Safe and reversible / 安全可逆** — no official Codex files are patched; live restore and complete uninstall shortcuts are included. / 不修改任何 Codex 官方文件，并提供即时恢复与完整卸载入口。
- **Armored visual language / 装甲化视觉语言** — blue-black armor planes, mechanical chamfers, panel seams, recessed cavities, and restrained amber energy. / 深蓝黑装甲面、机械斜切、装甲接缝、镂空结构与克制的琥珀能量光效。
- **Fast awakening mode / Fast 觉醒模式** — enabling native Fast mode switches owned energy surfaces, task markers, file references, and web links to a cyan-green psychoframe palette. / 开启原生 Fast 模式后，能量结构、任务标记、文件引用和网页链接会联动切换为青绿色精神骨架配色。
- **Synchronized motion / 同步动态光效** — top, side, and composer pulses share one global clock for a coherent, quiet energy rhythm. / 顶部、侧面与输入框光带共享全局时钟，形成统一而安静的能量脉动。
- **Automatic recovery / 自动恢复** — a guarded watcher restores the selected skin after normal Codex restarts or updates. / Codex 正常重启或更新后，受保护的 watcher 会自动恢复已保存主题。
- **Fail-closed compatibility / 失败安全兼容** — unknown renderer structures fall back to palette-only styling instead of force-modifying unverified controls. / 无法可靠识别新版界面结构时，仅应用基础配色，不强行修改未知控件。

## Install and launch / 安装与启动（重要）

1. Download and fully extract the repository ZIP, close Codex after saving any unfinished work, then double-click **`Install.cmd`**. A fresh installation selects the fullscreen `banshee-armor` theme automatically. No separate Node.js installation or administrator terminal is required.
2. For everyday use, **launch Codex from the desktop shortcut named `Codex Dream Skin`**. This is the recommended entry point: it starts the themed Codex runtime directly, without waiting for background recovery.
3. The original Codex icon remains usable as a fallback. When launched this way, the official unthemed window may appear first; the watcher normally detects it after roughly one minute, closes it, and reopens Codex with the Banshee theme. This delay and one automatic restart are expected behavior, so save ongoing input before testing this path.
4. You do **not** need to run `Install.cmd` before every launch. Run it again only when reinstalling, repairing the runtime, or updating this project.

1. 下载并**完整解压**仓库 ZIP，保存工作并关闭 Codex，然后双击 **`Install.cmd`**。全新安装会自动选择全屏 `banshee-armor` 主题；无需另外安装 Node.js，也无需管理员终端。
2. 日常使用时，**推荐双击桌面的 `Codex Dream Skin` 快捷方式启动**。这个入口会直接启动已经配置好主题的 Codex，不需要等待后台恢复。
3. 原生 Codex 图标仍可作为备用入口。通过原生图标启动时，通常会先出现未注入完整主题的官方界面；后台 watcher 大约需要一分钟识别，随后会自动关闭 Codex，并重新打开报丧女妖主题界面。这段等待和一次自动重启属于预期行为，测试前请先保存正在输入的内容。
4. 平时启动不需要重复运行 `Install.cmd`；只有重新安装、修复运行副本或更新本项目时才需要再次运行。

### Restore and uninstall / 恢复与卸载

- `Codex Dream Skin - Restore`: remove the current injection and return the open renderer to its native appearance. / 移除当前注入，让界面恢复原生外观。
- `Codex Dream Skin - Uninstall`: remove the runtime, watcher, shortcuts, and restore the pre-install base theme. / 完整移除运行副本、watcher 和快捷方式，并恢复安装前的基础配色。

## Banshee pack details / 报丧女妖主题说明

This fork adds an artless dark structural pack while preserving the official Codex renderer and native controls. It uses abstract blue-black armor planes, cut panel seams, recessed structures, and one synchronized 20-second gold energy cycle. It contains no character, machine, emblem, or official franchise artwork. The engine-extension requirements and acceptance gates are documented in [BANSHEE-SPEC.md](BANSHEE-SPEC.md).

本分支在完整保留官方 Codex 渲染器和原生控件的基础上，增加一套不依赖角色素材的深色装甲结构主题。视觉系统由深蓝黑装甲面、斜切接缝、镂空结构和统一的 20 秒能量循环构成，不包含角色、机体、徽章或官方作品素材。引擎扩展要求与验收门槛详见 [BANSHEE-SPEC.md](BANSHEE-SPEC.md)。

To switch back to this pack explicitly / 如需显式切回本主题：

```powershell
.\scripts\set-theme.ps1 banshee-armor fullscreen
```

Developer verification / 开发者验证：

```powershell
node tests\banshee-static.test.mjs
node scripts\injector.mjs --themes
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools\release-check.ps1 -SkipWorktreeClean
```

> Community project, not affiliated with OpenAI, Bandai Namco, or the Gundam franchise.
>
> 本项目为社区创作，与 OpenAI、Bandai Namco 或 Gundam 系列权利方无关。

---

# Upstream AutoSkin documentation / 原始 AutoSkin 项目说明

The sections below retain the upstream engine documentation for users who want to understand AutoSkin itself, create other themes, or contribute to the underlying runtime. The Banshee-specific installation and launch instructions above take precedence for this repository.

以下内容保留原 AutoSkin 引擎说明，供希望了解底层机制、制作其他主题或参与引擎开发的用户阅读。在本仓库中，安装与启动请优先遵循上方的报丧女妖项目说明。

这是 Windows Codex 桌面端的换肤引擎 2.3.0：不改任何官方文件，通过 Chromium DevTools Protocol（CDP）把皮肤“注入”到官方渲染器里，随时一键还原。主题是纯数据（一个文件夹：`theme.json` + 一张图），而配套的 [THEME-SPEC.md](THEME-SPEC.md) 是一份**写给 AI agent 读的定制规范**——把这个仓库和一张图丢给你的 Codex / Claude，它就能照着规范自己产出一套完整主题、自己截图调参、自己交付。你的 Codex，自己给自己换肤。

## Additional bundled themes / 其他内置主题

| Aurora Veil（内置 demo） | Ember Bloom（内置 demo） |
|---|---|
| ![aurora fullscreen](docs/screenshot-aurora-veil-fullscreen.png) | ![ember fullscreen](docs/screenshot-ember-bloom-fullscreen.png) |
| ![aurora banner](docs/screenshot-aurora-veil-banner.png) | ![ember banner](docs/screenshot-ember-bloom-banner.png) |

> 两个内置主题的视觉图都是 `tools/generate-demo-art.py` 程序化生成的原创图片（固定种子，可复现），仓库不含任何真人照片。截图中的侧栏做了模糊处理、项目名为演示用示例。

## 关于这个项目

用 CDP 注入给 Codex 换肤这个思路的初版（当时叫 **Dream Skin**）出自我之手。后来很高兴看到这个玩法在社区里传开，出现了各种分支和衍生版本，加了新平台、新主题——这正是开源该有的样子。

**AutoSkin 是我对这个想法的全面重写**：v1 回答的是"能不能给 Codex 换肤"，AutoSkin 回答的是"怎么让**任何人发一张图**就得到一套自己的皮肤"——重点从"肤"挪到了"Auto"。

## 2.3.0 新在哪

1. **Manifest 驱动引擎**——主题与引擎彻底解耦。加一个主题 = 往 `themes/` 放一个文件夹，零改码；注入器启动时自动扫描、校验、打包。删掉文件夹主题就消失，引擎代码里没有任何主题名。
2. **THEME-SPEC.md：规范即生成器**（全项目最大卖点）——这不是给人读的开发文档，而是给 agent 读的作业指导书：28 个取色 token 的逐个取法、四种画面角色的裁剪调参流程、"干净图 vs 带字截图"决策树、逐项验收清单。用户只要把一张图和这个仓库丢给自己的 Codex / Claude，agent 读完 spec 就能独立产出主题并自测交付。**不用等作者更新主题包，你的 agent 就是主题生成器。**
3. **一句话切换**——`.\scripts\set-theme.ps1 <theme> [layout]` 使用经校验的随包 Node 程序化切主题/版式，选择自动持久化。界面上刻意不放切换控件：跟你的 agent 说"换成极光"就行。
4. **风格包 v1.2 视觉**——花饰边框卡片、渐变圆徽章 + 可配置定制图标、建议卡副标题、可配置装饰贴纸（气泡/推广牌/角饰，默认关闭）、输入框占位文案，全部是主题里的可选声明字段，向后兼容。
5. **久经实战的健壮性**——这些坑都替你踩完了：CDP 回环双栈探测（Chromium 重启后可能只绑 `[::1]`）、watcher 防抖 + 频率熔断（绝不把 Codex 打进重启死循环）、换图 blob 指纹修复（换图重注入不再吃旧缓存）、`elementsFromPoint` 命中测试 QA（装饰层永远不吃掉真实控件的点击）。细节见 `references/runtime-notes.md`。

**目前的边界（诚实版）**：仅支持 Windows 上的 Store 版 Codex 桌面端。macOS 在路线图上——引擎的注入/manifest 层是跨平台的 Node.js，主要缺一个 mac 的启动与守护适配，**欢迎 PR**（见 [CONTRIBUTING.md](CONTRIBUTING.md)）。

## 快速开始

**一句话版**：把整个仓库（或 zip）给你自己的 Codex / Claude agent，说：**"安装这个皮肤"**。

### 支持范围与前置条件

| 项目 | 支持范围 |
|---|---|
| 操作系统 | Windows 10 / 11（当前用户安装，无需管理员权限） |
| Codex | Microsoft Store 版，包名 `OpenAI.Codex` |
| PowerShell | Windows PowerShell 5.1 |
| Node.js | 普通安装和运行**无需另装**；使用经校验的 Store Codex 随包 Node。只有直接运行源码 JS 工具的开发者才需要 Node.js 22.4+ |
| 磁盘 | 首次安装约需一个 Store `app` 负载；建议至少预留 4 GiB 供安装与更新暂存 |

目前不支持 macOS、非 Store 版 Codex 或远程 CDP。安装会创建一个仅绑定本机回环地址的随机端口并持久化使用。为了避免未保存内容受到影响，建议先保存工作并关闭 Codex，再安装。

### 一键安装

完整解压 GitHub ZIP 后，双击仓库根目录的 **`Install.cmd`**。它只负责调用正式 PowerShell installer，不包含另一套安装逻辑。关于本分支的默认主题、推荐启动入口，以及使用原生 Codex 图标时约一分钟的 watcher 恢复与自动重启行为，请以 README 顶部的“安装与启动（重要）”为准。

如果更习惯终端，可运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-dream-skin.ps1
```

需要立即显式启动和验证时，再运行：

```powershell
.\scripts\start-dream-skin.ps1          # 使用持久化端口启动并注入皮肤
.\scripts\verify-dream-skin.ps1 -ScreenshotPath shot.png
```

installer 会写入配套的官方**暗色**基础配色、创建快捷方式和登录自恢复 watcher，并使用可信 Store Codex payload 内随包、复制后再次哈希验证的 Node，不依赖用户的系统 `PATH`。安装日志与状态位于 `%LOCALAPPDATA%\CodexDreamSkin`；遇到问题先查看该目录内的日志。完整安全边界见 [SECURITY.md](SECURITY.md)。

> 脚本名和内部标识沿用 `dream` 前缀——那是默认风格包的名字，也算对 v1 的致敬。

## 换主题

```powershell
.\scripts\set-theme.ps1 --list                 # 看有哪些主题
.\scripts\set-theme.ps1 aurora-veil fullscreen # 切主题 + 版式（banner / fullscreen），自动持久化
```

`set-theme.ps1` 会定位已验证 runtime 内的随包 Node；只有开发者直接运行 `set-theme.mjs` 时才需要系统 Node.js 22.4+。

或者更简单——跟你的 Codex 说："**切到花瓣主题**"。

## 做自己的主题

1. 挑一张图（自己的插画、生成图、壁纸——注意版权与肖像权，见免责声明）；
2. 把图 + 这个仓库给你的 agent，说"**照着 THEME-SPEC.md 做一个主题**"；
3. agent 会产出 `themes/<名字>/theme.json + art.png`（必要时带作用域受限的 `extra.css`），自己截图迭代 crop 参数，然后 `node scripts/set-theme.mjs <名字>` 给你看效果。

内置的 [aurora-veil](themes/aurora-veil/theme.json)（暗图路线）和 [ember-bloom](themes/ember-bloom/theme.json)（亮图路线）就是两份对照样例，覆盖了明暗两种取色模板。

## 工作原理与安全

- **CDP 注入**：先校验当前 Store 包的身份与关键文件，再把官方 `app` 负载复制到用户目录，以 `--remote-debugging-port=<persisted-loopback-port>` 启动这个只读来源的独立运行副本，随后通过 DevTools 协议往主渲染器注入 CSS + JS。installer 会分配并保存一个可用端口；端口只绑定**本机回环**，不要暴露到局域网。
- **不改任何官方文件**：不写入 `WindowsApps`、不修改 `app.asar`、不替换 Store 安装；独立副本位于 `%LOCALAPPDATA%\CodexDreamSkin\runtime`，约占用与 Store `app` 负载相同的磁盘空间（当前版本约 1.8 GiB），更新暂存期间会短暂需要额外空间。
- **随时还原**：`scripts\restore-dream-skin.ps1` 现场移除所有注入内容，DOM 恢复得干干净净；加 `-Uninstall -RestoreBaseTheme` 连快捷方式和安装前的配色备份一起还原。所有运行时状态都在 `%LOCALAPPDATA%\CodexDreamSkin`，删掉即无痕。
- **Codex 更新后**：watcher 会先验证新 Store 包，在临时目录构建新的版本化运行副本并校验关键文件哈希；只有全部通过后才允许恢复主题。复制或校验失败时保留当前 Codex 进程，仅退回基础配色，不会把应用打进重启循环。也可以手动重跑 `install` + `start`。
- **自恢复**：一个隐藏 watcher 在正常重启 Codex 后自动补皮肤（防抖、频率熔断、失败冷却，不会跟应用打架）。
- **辅助窗口保护**：桌面宠物等 `initialRoute` 辅助渲染器永远不注入、保持透明。

## 卸载

双击安装时创建的桌面快捷方式 **`Codex Dream Skin - Restore`** 可临时移除当前注入；双击 **`Codex Dream Skin - Uninstall`** 会完整卸载、移除自恢复并还原安装前的基础配色。命令行等价操作为：

```powershell
scripts\restore-dream-skin.ps1 -Uninstall -RestoreBaseTheme
```

之后正常启动 Codex 即为纯官方状态。

## 免责声明

- 本项目是装饰性的社区项目，**与 OpenAI 无关，非官方项目**；Codex 及相关商标归其权利人所有。
- Codex 桌面端更新可能改变内部 DOM 结构，届时需要重新适配（引擎按语义选择器定位，小更新通常无感）。
- 内置 demo 主题的视觉素材为程序化生成的原创图片（`tools/generate-demo-art.py`，可复现）。
- **用户自制主题的素材版权与肖像权责任自负**。不得使用他人（尤其是真人明星）的肖像制作并公开传播主题；`themes-private/` 目录（已 gitignore）就是为把私人主题留在本地而设的。

## License

[MIT](LICENSE) © Vikicc　·　当前版本 **v2.3.0**

---

## English (short version)

**Send one image to your Codex, and it reskins itself.**

Codex AutoSkin — a manifest-driven skin engine for the Windows Codex desktop app, a full rewrite by the author of the original CDP-injection skin known as Dream Skin (glad to see the idea spread through community forks and derivatives — that's open source working as intended).

It injects CSS/JS into the official renderer over the Chrome DevTools Protocol — no app files are modified, fully reversible, login/session untouched, CDP bound to loopback only.

What's new in 2.3.0:

- **Manifest-driven engine** — adding a theme = dropping a folder into `themes/` (`theme.json` + one image). Zero engine changes.
- **[THEME-SPEC.md](THEME-SPEC.md) is the generator** — an agent-readable spec (28 color tokens, crop workflow, decision tree, QA checklist). Hand this repo plus one picture to your Codex/Claude agent and it authors, tunes, and ships a complete theme on its own.
- **One-liner switching** — `.\scripts\set-theme.ps1 <theme> [banner|fullscreen]` uses the verified bundled Node (or just tell your agent). No on-screen switcher by design.
- **Style-pack visuals** — ornamented cards, custom badge icons, card subtitles, opt-in stickers, composer placeholder — all optional per-theme declarations.
- **Battle-tested robustness** — dual-stack loopback CDP probing, watcher debounce + circuit breaker (never kill-loops Codex), art-blob fingerprinting for image swaps, hit-testing QA so decorations never steal clicks.

Currently **Windows 10/11 with the Microsoft Store `OpenAI.Codex` package only** — macOS is on the roadmap and PRs are very welcome ([CONTRIBUTING.md](CONTRIBUTING.md)). Windows PowerShell 5.1 is required. End users do not need a separate Node.js installation: AutoSkin uses the bundled Node from the trusted Store Codex payload and verifies it again after copying. Node.js 22.4+ is needed only by contributors who run the JavaScript source tools directly. Installation is per-user and does not require an administrator shell. Reserve roughly 4 GiB for the verified runtime and update staging.

Quick start: hand this repo to your agent and ask it to install the skin, or extract the GitHub ZIP and double-click the root-level `Install.cmd`. It delegates to the PowerShell installer. For this fork's default theme, recommended `Codex Dream Skin` launch shortcut, and the roughly one-minute watcher recovery behavior of the original Codex icon, follow the “Install and launch” section at the top of this README.

Bundled demo art is 100% procedurally generated (`tools/generate-demo-art.py`); no photos of real people in this repo. Do not publish themes using a real person's likeness — keep private themes in the git-ignored `themes-private/`. Decorative community project, not affiliated with OpenAI; Codex and related marks belong to their respective owners.

[MIT](LICENSE) © Vikicc · **v2.3.0**
