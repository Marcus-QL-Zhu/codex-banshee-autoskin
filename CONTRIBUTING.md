# 贡献指南 / Contributing

感谢你愿意给 Codex AutoSkin 出力。我们最欢迎三类贡献：

## 开发环境与提交前检查

- Windows 10 / 11、Windows PowerShell 5.1、Node.js 22.4 或更高（推荐当前 LTS）。运行时集成测试还需要 Microsoft Store 版 `OpenAI.Codex`；离线检查不需要启动 Codex。
- 生成 demo art 是可选开发任务，需要 Python 3.11，并用 `python -m pip install -r tools/requirements.txt` 安装固定版本的 NumPy 和 Pillow。
- 不要提交真实任务、项目、账号或本机路径截图。`docs/analysis/` 和本地 review 图片默认忽略；如果确需发布最终截图，请先做视觉检查和 OCR 脱敏，再显式 force-add。

提交前先运行不会启动或重启 Codex 的统一离线检查：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools\release-check.ps1 -SkipWorktreeClean
```

准备发布时去掉 `-SkipWorktreeClean`，确保没有未提交、未跟踪或意外生成的文件。CI 会在 Node 22.4 和当前 Node 24 上执行同一检查。修改运行时行为后，仍需按 `references/qa-inventory.md` 完成单独的真实渲染器验收。

## 1. 新主题（最容易上手）

主题是纯数据：往 `themes/` 里放一个文件夹就是一个主题，**不需要也不允许改任何引擎代码**。

**做法**：读 [THEME-SPEC.md](THEME-SPEC.md)（它本来就是写给 agent 读的——把仓库和你的图丢给你自己的 Codex / Claude，让它照规范产出，通常比手写快得多）。

**主题 PR 的验收标准 = THEME-SPEC.md §7 的验收清单**，逐项过：

1. `node scripts/injector.mjs --themes` 里出现你的主题，无 skipped/REJECTED 告警；
2. banner / fullscreen 两种版式各截一张图：原生卡片、项目选择器、输入框全部可见可用，四角与接缝**无原图文字鬼影、无原图边框线**，标题区对比度充足；
3. 聊天页背景隐约可见即可，消息文字对比度不受影响；
4. 交互回归：装饰层全部 `pointer-events: none`，`elementsFromPoint` 命中的都是控件真身；
5. `restore-dream-skin.ps1` 之后 DOM 干净，重新 start 能恢复；
6. 桌面宠物辅助窗口保持透明；
7. 配了 `cards.subtitles` / `stickers` 的主题：按 §7.7 / §7.8 验证收缩降级与版式限定。

**PR 里请附上**：两种版式的截图（截图里不要出现你自己的真实项目名/个人信息，侧栏模糊掉）。

**素材红线（不满足直接拒收）**：

- **杜绝真人肖像**——不得使用任何真实人物（明星或素人）的照片或可识别形象；
- 不得使用你没有权利再分发的素材（盗图、无授权的商业插画等）；
- `theme.json` 的 `notes` 里注明素材来源（程序生成脚本 / 自绘 / 授权说明）；
- `stickers` 保持默认关闭或只放中性文案，不放个人推广信息。

涉及肖像或私人素材的主题请留在本地的 `themes-private/`（已 gitignore），不要提交。

## 2. macOS 移植（最想要的）

引擎的注入层（`scripts/injector.mjs`、`scripts/set-theme.mjs`、`assets/renderer-inject.js`）是跨平台 Node.js，CDP 协议在 mac 上完全一致。缺的主要是：

- 启动器：等价于 `start-dream-skin.ps1` 的 mac 版（定位 Codex.app、带 `--remote-debugging-port` 启动）；
- 安装/卸载与自恢复 watcher 的 mac 适配（LaunchAgent 或等价机制）；
- 运行时状态目录（`%LOCALAPPDATA%\CodexDreamSkin` 的 mac 对应位置）。

动手前建议先开 issue 对齐方案。`references/runtime-notes.md` 里的坑（双栈回环、防抖熔断、单实例竞态）在 mac 上大多同样适用。

## 3. 引擎修复与增强

- Codex 更新后的 DOM 适配、选择器修复；
- watcher / 注入守护的健壮性改进（**必须保留防抖 + 熔断语义，绝不允许出现 kill-loop**，见 `references/runtime-notes.md`）;
- 新的可选装饰能力（照 v1.1/v1.2 的模式：theme.json 可选字段 + 缺省关闭 + 向后兼容 + 非法值只丢弃不连坐）。

引擎 PR 请说明测试方式；动了注入/恢复路径的，跑一遍 `references/qa-inventory.md` 的签核清单。

---

## English (short)

Development requires Windows PowerShell 5.1 and Node.js 22.4+ (current LTS recommended). Run the offline, non-launching checks before every PR:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools\release-check.ps1 -SkipWorktreeClean
```

Remove `-SkipWorktreeClean` for a release candidate. Never commit live screenshots containing real tasks, project names, accounts, or local paths. Demo-art regeneration is optional and uses the pinned dependencies in `tools/requirements.txt` with Python 3.11.

Three kinds of contributions are most welcome:

1. **New themes** — a theme is a data folder under `themes/` (`theme.json` + one image); never modify engine files. Author it by handing this repo + your image to your own agent with [THEME-SPEC.md](THEME-SPEC.md). Acceptance = the QA checklist in THEME-SPEC.md §7. Attach screenshots of both layouts (blur your own sidebar/project names). Hard rules: **no real-person likeness**, no assets you can't redistribute, state the art's origin in `theme.json` `notes`, keep stickers neutral or off. Personal themes belong in the git-ignored `themes-private/`.
2. **macOS port** — the injection layer is cross-platform Node.js; what's missing is a mac launcher/installer/watcher. Open an issue first; the pitfalls in `references/runtime-notes.md` mostly apply on mac too.
3. **Engine fixes** — DOM re-adaptation after Codex updates, watcher robustness (the debounce + circuit-breaker semantics are non-negotiable), new opt-in decor fields following the v1.1/v1.2 pattern (optional, off by default, backward compatible). Run the signoff list in `references/qa-inventory.md` when touching inject/restore paths.
