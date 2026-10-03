# 行远

**把想法做成结果。**

基于 MonoCode、Pi、llama.cpp 重建的本地优先桌面智能体。

## 当前阶段

这是第一版开发工程，不是正式发布。桌面 UI 直接继承 MonoCode；Pi 使用其原生 RPC；本地模型通过 llama.cpp 的标准接口接入。来源与固定版本见 [UPSTREAM.md](UPSTREAM.md)。

已加入行远独立产品身份、Pi 数据隔离和本地模型设置页。项目仍保留 MonoCode 附带的代码工作区、工作树、自动化及多提供商代码；默认新会话使用 Pi。新增本地模型页面是中文，其余界面尚未完成中文化。

## 开发运行

需要 Node.js 24、Bun 1.4.2 和稳定版 Rust。Linux 需要 Tauri 的 GTK/WebKit 开发依赖。

```sh
bun install
bun run desktop:dev
```

开发模式优先使用项目锁定的 Pi CLI，无需全局安装 Pi。

行远的数据目录使用 Tauri identifier `com.rongxin.xingyuan`。Pi 的配置、认证和原生会话保存在该目录的 `pi/agent` 下；不读取旧产品或 `~/.pi` 的数据。

## 本地模型

1. 准备本机的 GGUF 模型。按下节构建的桌面包已携带 Pi 和 llama.cpp 官方运行包；开发模式需自行从 [llama.cpp 官方发布页](https://github.com/ggml-org/llama.cpp/releases) 安装 llama-server。
2. 在行远设置中打开「本地模型」，选择模型文件，保存配置。桌面包自动选择内置运行文件；开发模式或使用其他运行包时，手动选择运行文件。
3. 启动模型，新建会话并选择本地模型。

当前设置只支持本机文件，不自动下载大模型。运行时固定监听 `127.0.0.1:8081`，默认上下文 8192。高级参数可在应用数据目录的 `local-inference.json` 中调整，修改前停止模型。端口占用会拒绝启动；行远只停止自己启动的进程。

模型使用 Pi 原生 `models.json` 注册为 `xingyuan-local/local-model`，不另建代理服务。保存后应新建会话；已有运行中的会话不会被强制切换。云模型可以在行远自己的 Pi 配置/认证目录中配置。

Pi 的默认工具使用宿主权限。第一版没有额外的工具审批或沙箱隔离层；不要将它视为完整权限产品。模型能否正确调用工具，取决于模型及其聊天模板，不能由配置成功推断。

## 构建桌面包

```sh
bun run desktop:build
```

使用本机架构构建；Windows、Linux 和 Fedora 可分别使用 `bun run build:windows`、`bun run build:linux` 和 `bun run build:fedora`。当前不支持跨架构构建。需要联网下载固定版本的官方包；版本、文件大小和 SHA-256 位于 `scripts/runtimes/manifest.ts`。缓存也会重新校验，完整配套库与许可证保留在包内。下载和生成资源位于忽略的 `build/`，不提交二进制到 Git。

Pi 固定为 1.0.0，llama.cpp 固定为 b11321。macOS 使用官方 Metal 包，Windows/Linux 默认使用官方 CPU 包；需要 GPU 支持时可手动选择适配本机的 llama-server。托管 Pi 随行远版本升级，不执行 CLI 自更新。模型文件仍由用户准备。

CI 构建三个平台的未签名调试包，用于检查打包链路；没有发布安装包。正式签名、升级与安装后的实机验收仍待完成。

## 检查

```sh
bun run check:identity
bun run lint
bun run test
bun run build
cargo test --locked
cargo clippy --locked --workspace --all-targets -- -D warnings
```

实际执行结果见 [验证记录](docs/VERIFICATION.md)，后续工作见 [开发路线](docs/ROADMAP.md)。安装包、自动更新、全界面中文化与完整旧功能对齐尚未交付。

## 约束

「如无必要，勿增实体」。不搬运旧产品的运行时 adapter、对话状态转换和主题框架；优先使用上游语义与现成组件。开发规范见 [AGENTS.md](AGENTS.md) 和 [DESIGN.md](DESIGN.md)。

## 来源

- [MonoCode](https://github.com/hardbeat920/monocode)：桌面与交互基础。
- [Pi](https://github.com/earendil-works/pi)：智能体运行时。
- [llama.cpp](https://github.com/ggml-org/llama.cpp)：本地推理。

保留原始 [MIT 许可证](LICENSE) 和 [NOTICE](NOTICE)。
