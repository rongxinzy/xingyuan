# 起步版本验证记录

日期：2026-10-02。环境：macOS arm64、Node 24.14.1、Bun 1.4.2。

## 工程检查

- `bun run check:identity`：产品名、应用 identifier、版本与关闭的更新源一致。
- `bun run lint`：TypeScript 与 Rust 格式检查通过。
- `bun run test`：381 个文件通过，4,073 项测试通过；上游 2 个文件、13 项外部服务测试跳过。
- `bun run build`：生产前端构建通过；保留上游 Mermaid 等大块资源的体积提示。
- `cargo clippy --locked --workspace --all-targets -- -D warnings`：通过。
- `cargo test --locked -- --test-threads=1`：541 项通过、1 项上游测试忽略，包含新增的 3 项 Pi 技能隔离回归。
- `cargo test --locked skills:: -- --test-threads=1`：22 项通过。

上游 Rust 测试含共享原生剪贴板操作；并行测试及同时操作桌面曾出现剪贴板冲突与 CLI 探测超时。独立复测和串行全量测试通过，CI 使用串行测试。没有跳过新增本地推理测试。

## 真实桌面与推理

通过 `bun run desktop:dev` 启动真实 Tauri 应用，用原生界面操作验证，没有以模拟响应代替模型输出。

- 窗口与菜单显示行远，本地模型页沿用 MonoCode 设置布局；未配置时启动与保存禁用。
- 原生文件选择器选择运行文件及模型，保存后 Pi 原生模型目录能发现本地 Qwen3。
- 启动后显示运行中，`/health` 返回正常，`/v1/models` 返回 alias `local-model`。
- 通过桌面 Pi 会话发送中文提示，模型实际回复「行远已就绪。」。
- Pi 实际执行 `read` / `write`，读取 `workspace/验证.txt` 并写入 `workspace/结果.txt`；原生会话 JSONL 包含工具调用和成功结果。最后一次 write 的参数内容与文件字节一致。
- 点击停止后端口释放，退出行远后本次启动的 llama-server PID 消失。
- Pi 原生 JSONL 位于行远独立应用目录的 `pi/agent/sessions` 下。
- 使用项目 Pi CLI 的原生 RPC 恢复同一 session，`get_state` 返回原 session ID；追加提示后实际回复此前的验证码 `XINGYUAN-20261002`。这项是 Pi 恢复验证，不是桌面重开验收。

测试模型为 0.6B，用于验证接线。复制原文任务中，它先写入了错误内容，修正时仍改写了标签并遗漏末尾换行；严格照抄验收未通过。这是保留的任务质量负例，不能将工具成功解释为完整任务质量达标。

## 远程推理复测

2026-10-02 使用用户提供的 `172.18.5.123:8000`，只调用现有推理服务。`/v1/models` 返回 HTTP 200，服务标识为 llama.cpp，模型 ID 为 `Qwen3.6-35B-A3B`，量化元数据为 Q4_K_M，接口报告上下文 262,144。这些是该次服务快照，不是产品默认配置或完整上下文容量验收。

使用项目锁定的 Pi 0.99.2 原生 RPC 和独立临时配置目录，通过 `models.json` 的 `openai-completions` 接入；没有增加转发层、协议转换、依赖或兼容补丁。所有文件操作仅针对临时验收工作区。

| 检查 | 实际结果 | 耗时 |
| --- | --- | --- |
| 中文回复 | 精确回复「行远远程已就绪。」 | 4.471 秒 |
| 逐字复制 | 原生 `read` / `write` 保留中文、金额、引号及末尾换行，文件字节完全一致 | 3.574 秒 |
| 精确编辑 | 原生 `edit` 只修改指定金额，其他字节不变 | 3.505 秒 |
| shell 执行 | 原生 `bash` 返回实际工作目录 | 1.233 秒 |
| 会话恢复 | 重启 Pi 并恢复同一 session，无工具调用答出随机验证码 | 0.978 秒 |
| 停止生成 | 收到实际文本流后发送 `abort`，Pi 返回空闲 | 1.127 秒，含开始生成 |
| 停止后续聊 | 同一 session 正确回复新的短提示 | 0.462 秒 |

复制前后 SHA-256 均为 `b66123f1f6c20a54a64725c8b548548f5c5fe5ef34ce91d192ec08a09e4f481f`；恢复 session ID 为 `01a0f8ac-0691-7740-af3a-a21fd62cc873`。RPC、会话和逐项结果保留在本机 `/tmp/xingyuan-remote-smoke/`，临时目录可能被系统清理。耗时包括完整 Pi 任务链，仅是单次检查，不是吞吐或延迟基准。

同一测试模型已加入本机行远独立 Pi 目录的 `models.json`，provider 为 `xingyuan-test-remote`，保留已有本地 provider。远程地址不作为仓库默认值；行远不管理该远程进程。下节追加了真实桌面验收；未验证图片输入、大上下文和并发压力。

## 桌面补验与技能隔离修复

2026-10-02 通过 CUA 操作真实 macOS Tauri 开发应用 `localhost:1420`，截图像素为 2560×1600，沿用当前深色界面。Browser 插件不可用；本轮使用原生应用自动化，不以浏览器夹具代替 IPC。

- 新建会话，在既有模型选择器中选中 `Qwen3.6-35B-A3B`。通过界面发起原生 `read` / `write`，复制 `workspace/远程验证.txt` 到 `workspace/远程结果.txt`；文件字节完全一致，SHA-256 与上节相同。
- 展开 `Show the work` 和具体步骤，显示实际读取、写入及思考内容；成果卡显示 1 个文件、+5/-0。没有添加新的工具包装或动效。
- 点击 Stop 中断实际文本生成，界面恢复 Send，Pi 会话记录包含 `stopReason: aborted`。
- 关闭会话标签后从历史列表重开；随后完整退出并重新启动应用，历史与模型选择恢复。继续询问验证码，实际回复 `XY-99c38993d977`，该次回复没有调用工具。原生 session 保持 `01a0fa33-cc86-7238-ba92-56dcc08f45ef`。
- 用独立测试进程占用 8081，点击启动模型后显示端口不可用错误，测试进程 PID 与 HTTP 响应保留。结束该测试进程后再次启动，观察「正在加载模型」再点击停止，界面回到「未启动」，配置控件重新可用；稍后端口仍释放，没有迟到的运行状态回弹。
- 修复设置页技能发现根目录：用户级 Pi 技能来自行远应用目录的 `pi/agent/skills`，不再扫描 `~/.pi/skills` 或 `~/.pi/agent/skills`。项目 `.pi/skills`、同名优先级及禁用后候选回退保留。3 项新增回归覆盖旧目录隔离、缺失时不回退和同名候选选择。
- 在行远独立目录创建临时技能，设置页显示正确文件路径；新会话输入框从 Pi 原生目录发现 `/skill:xingyuan-runtime-smoke`，选择并发送后模型实际回复 `OWNED-SKILL-20261002`。不额外注入技能提示。验收后清理临时技能文件。

原生截图已目视核对，页面有实际内容，无框架错误覆盖层。本轮未单独采集 WebView 控制台；不能以原生截图替代控制台健康检查。文件与会话核对结果保留在本机 `/tmp/xingyuan-stage2-native-receipt.json`；临时路径可能被系统清理。

当时上游更新面板仍给项目锁定的 Pi 提供自更新提示；Pi 官方 CLI 的实现拒绝对非全局包安装执行自更新。当轮没有点击更新或修改全局 CLI。下节记录了打包阶段对托管更新入口的处理。

## 组件渲染

浏览器插件不可用，使用本机已有 Playwright 与 Edge 的隔离无头上下文验证新增组件。使用实际 React 组件和仓库 CSS，原生 IPC 与开发 HMR 在此静态夹具中模拟；它不承担后端验收。

- light/dark，1280×800 与 800×520：长中文模型路径可换行，没有横向溢出。
- 未配置时禁用、运行时禁止改配置、启动/停止状态、hover、键盘 Tab 焦点和减少动效模式：通过。
- 夹具没有未捕获 JavaScript 异常或额外控制台错误；实际截图已目视核对。

## 运行包来源与校验

- [llama.cpp b11321](https://github.com/ggml-org/llama.cpp/releases/tag/b11321)，macOS arm64 官方包，运行版本 `0.5.0-dev`、commit `b0aca3c65`。
- 运行包 SHA-256：`5f47ffa4de936853004e7403a09d87616022e5af16651d71fc66a96b261886fb`，与 GitHub asset digest 一致。
- [Qwen/Qwen3-0.6B-GGUF](https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/tree/23749fefcc72300e3a2ad315e1317431b06b590a)，`Qwen3-0.6B-Q8_0.gguf`，639,446,688 字节。
- 模型 SHA-256：`9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031`，与固定提交的 LFS digest 一致。

模型与运行包未提交到 Git，也未设置为产品推荐模型。

## 官方运行包接入

2026-10-03，macOS arm64。本轮推进桌面打包；Pi 1.0.0 的模型任务、原生 RPC 与实机交互没有重新验收，上述 Pi 0.99.2 的记录不作为新版通过证据。

- 构建清单锁定官方 Pi 1.0.0、llama.cpp b11321，覆盖 macOS、Windows、Linux 的 arm64/x64 文件。下载与缓存检查大小和 SHA-256，保留完整运行包、配套库和原始许可证。
- 桌面包自动发现内置运行文件。内置 llama-server 路径在保存时归一为空，重启后按当前应用位置解析；手动选择的外部运行文件保持原路径。
- 托管 Pi 不再提供 CLI 自更新通知，后端拒绝对其执行自更新；外部 CLI 的既有更新逻辑保留。
- `bun run lint`、身份检查、Actionlint、Clippy：通过。
- `bun run test`：382 个文件、4,077 项通过，13 项外部服务测试跳过；包含 4 项新增下载/缓存/归档安全回归。上游 React 测试仍有 `act` 提示，不将它描述为无警告。
- `cargo test --locked local_inference:: -- --test-threads=1`：7 项通过；`cargo test --locked harness_updates:: -- --test-threads=1`：5 项通过。新增 3 项覆盖内置文件选择、应用移动后解析及托管更新保护。
- 串行 Rust 全量测试：544 项通过、1 项上游测试忽略。Bun 高危及以上依赖审计通过，仍有 3 项低于该阈值的告警；没有声称全部依赖无漏洞。
- `bun run runtimes:prepare`：macOS arm64 官方文件下载、校验和准备成功。
- `bun run tauri build --debug --bundles app --config build/tauri-runtimes.json`：生成 `target/debug/bundle/macos/行远.app`，保留上游 CSS 优化与大块资源提示。使用本机 ad-hoc 签名，未公证或发布。
- 包内 `Contents/Resources/runtimes` 的 276 个文件逐项与准备目录比较 SHA-256，字节一致；Pi 与 llama-server 保留可执行权限；`codesign --verify --deep --strict` 通过。这是打包结构证据，没有启动包内 Pi 或推理进程。

CI 增加 macOS `.app`、Linux `.deb` 与 Windows NSIS 调试包构建，结果以当前 PR 的检查为准。六种清单目标不代表六种平台已完成安装与运行验收；Windows/Linux 的 GPU 运行包、正式签名、安装升级和模型任务仍待实机验证。

## 边界

初次桌面验收受锁屏阻断的历史重开及端口冲突流程，已在本轮补验。原生页面浅色模式尚未验收；上面的浏览器组件明暗模式检查不替代原生主题切换。

Windows/Linux 实机、正式安装包、签名、更新、全界面汉化、独立图标、旧产品功能对齐尚未验收。当前保留上游图标与内部 crate/协议标识，不将改名视为独立视觉设计完成。路线见 [ROADMAP.md](ROADMAP.md)。
