# 运行 Desktop 应用

[English](running-the-desktop-app.md) | 中文

如何在本 fork 的检出上于 Linux 工作站部署 Electron Desktop 应用（`apps/desktop`），以及过程中观察到的失败模式。上游发布模型（签名的 macOS/Windows 安装包、自动更新）不发布 Linux 产物，因此 Linux 部署经由开发启动器从源码运行。shell 与 host 的设计理由见 [apps/desktop/README.md](../../apps/desktop/README.zh.md)。

## 步骤

1. 先构建一次：`pnpm run build`（Host 面）与 `pnpm --filter @deepseek-ai/dsh-desktop run build`（Electron shell）。启动器 `pnpm run dev:desktop` 会串联两者；`pnpm run start:desktop` 跳过构建，若缺少 `apps/desktop/lib/main.js`、`apps/desktop-host/lib/index.js` 或 `apps/web/dist/index.html` 会失败。
2. 选择 Harness 主目录。未打包的 Electron 默认把 `DSH_HOME` 设为 `apps/desktop/.desktop-build/development/home`，从而与会话、设置、凭据和 CLI、Web 应用隔离。启动前导出 `DSH_HOME=$HOME/.dsh` 可与它们共享状态。
3. 启动：`pnpm run start:desktop`。Electron 主进程在调用方 Node 下派生私有的 `dsh-desktop-host` 子进程；没有监听端口——渲染进程加载 `dsh-app://app/index.html`，API 流量经由带帧字节管道传输。
4. 若要加入应用程序菜单，使用 fork 启动器 `~/.local/bin/dsh-desktop` 配合 desktop 文件 `~/.local/share/applications/deepseek-harness-desktop.desktop`（`Icon=deepseek-harness-desktop`、`StartupWMClass=deepseek-harness-desktop`）。当构建产物落后于 `HEAD` 加工作树改动时，启动器会重新构建。

## Fork 本地补丁

`apps/desktop/src/main.ts` 携带两处标记为 `Fork-local` 的仅开发用区块：`app.setName`/`app.setDesktopName('deepseek-harness-desktop')` 与 `BrowserWindow` 的 `icon` 选项。打包构建不受影响（由 `app.isPackaged` 守卫）。合并上游后保留这些区块（见[合并仪式](../../scripts/fork-merge-ritual.sh)）。

## 失败模式

- **每个 SDK 快照测试都报 `cannot create effect on inactive context`。** desktop host 与快照测试框架启动的是已构建的 `lib/` 产物。被编译错误中断的构建会留下过期的 `lib/` 树，启动时表现为看似无关的运行时失败。任何合并或插件 API 修复之后，先跑完整的 `pnpm run build` 再信任 `pnpm run test:snapshot`；同样的过期产物陷阱也适用于 Desktop 启动器，这正是它记录构建 revision 的原因。
- **任务栏显示占位图标。** 未打包的 Electron 把 npm 包名上报为应用标识，窗口管理器因此无法匹配 desktop 文件。修复即 `Fork-local` 区块：`app.setDesktopName` 提供 Wayland `app_id`，`icon` 选项提供 X11 窗口图标，desktop 文件里的 `StartupWMClass` 完成匹配。
- **每次启动都打开 DevTools 窗口。** 除非设置 `DSH_DESKTOP_OPEN_DEVTOOLS=0`，`apps/desktop/src/main.ts` 都会打开它。fork 启动器已导出该变量。
- **`pnpm install` 期间出现 `Failed to create bin ... @deepseek-ai/dsh/lib/bin.js` 警告。** 首次构建前无害：`dsh` bin 目标是构建产物。`pnpm run build` 之后即消失。
- **工具链在 Wayland 上截图/捕获失败。** Chromium ozone 警告（`zcr_alpha_compositing`、portal 注册）只是表象，应用正常渲染。截图捕获可能需要合成器特性（PipeWire portal）——改为通过无障碍树验证窗口状态。
- **没有任何端口在监听。** Desktop 有意不启 HTTP 服务；调试后端意味着附加到 host 子进程（`DSH_DESKTOP_HOST_INSPECT_PORT`，默认 9230），而不是 curl localhost。

## 验证

部署正确当且仅当：窗口标题正常渲染，侧栏列出的工作区与会话与共享同一 `DSH_HOME` 的 `dsh web` 一致，且右侧栏能从会话头部的角落按钮（`data-sidebar-right-expand`；该面板在 Web 与 Desktop 中都以折叠状态启动）打开。
