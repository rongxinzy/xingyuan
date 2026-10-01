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

测试模型为 0.6B，用于验证接线。复制原文任务中，它先写入了错误内容，修正时仍改写了标签并遗漏末尾换行；严格照抄验收未通过。这是保留的任务质量负例，不能将工具成功解释为完整任务质量达标。

## 运行包来源与校验

- [llama.cpp b11321](https://github.com/ggml-org/llama.cpp/releases/tag/b11321)，macOS arm64 官方包，运行版本 `0.5.0-dev`、commit `b0aca3c65`。
- 运行包 SHA-256：`5f47ffa4de936853004e7403a09d87616022e5af16651d71fc66a96b261886fb`，与 GitHub asset digest 一致。
- [Qwen/Qwen3-0.6B-GGUF](https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/tree/23749fefcc72300e3a2ad315e1317431b06b590a)，`Qwen3-0.6B-Q8_0.gguf`，639,446,688 字节。
- 模型 SHA-256：`9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031`，与固定提交的 LFS digest 一致。

模型与运行包未提交到 Git，也未设置为产品推荐模型。

## 边界

Windows/Linux 实机、正式安装包、签名、更新、全界面汉化、独立图标、旧产品功能对齐尚未验收。当前保留上游图标与内部 crate/协议标识，不将改名视为独立视觉设计完成。路线见 [ROADMAP.md](ROADMAP.md)。
