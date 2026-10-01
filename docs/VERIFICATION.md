# 起步版本验证记录

日期：2026-10-02。环境：macOS arm64、Node 24.14.1、Bun 1.4.2。

## 工程检查

- `bun run check:identity`：产品名、应用 identifier、版本与关闭的更新源一致。
- `bun run lint`：TypeScript 与 Rust 格式检查通过。
- `bun run test`：381 个文件通过，4,073 项测试通过；上游 2 个文件、13 项外部服务测试跳过。
- `bun run build`：生产前端构建通过；保留上游 Mermaid 等大块资源的体积提示。
- `cargo clippy --locked --workspace --all-targets -- -D warnings`：通过。
- `cargo test --locked -- --test-threads=1`：538 项通过、1 项上游测试忽略。

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

同一测试模型已加入本机行远独立 Pi 目录的 `models.json`，provider 为 `xingyuan-test-remote`，保留已有本地 provider。远程地址不作为仓库默认值；行远不管理该远程进程。这轮是原生运行时验证，桌面选模与交互尚未据此重新验收；未验证图片输入、大上下文和并发压力。

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

## 边界

最后一轮原生桌面操作时本机锁屏，因此桌面重开后的历史显示、原生页面浅色模式及真实端口冲突流程尚未完成实机验收。没有绕过锁屏；Pi 原生恢复与独立组件渲染分别验证，不能替代这些检查。

Windows/Linux 实机、正式安装包、签名、更新、全界面汉化、独立图标、旧产品功能对齐尚未验收。当前保留上游图标与内部 crate/协议标识，不将改名视为独立视觉设计完成。路线见 [ROADMAP.md](ROADMAP.md)。
