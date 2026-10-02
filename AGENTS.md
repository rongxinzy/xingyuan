# 行远开发约束

行远是基于 MonoCode、Pi、llama.cpp 的本地优先桌面智能体。遵守「如无必要，勿增实体」。

- 产品名为行远；英文工程名 Xingyuan。LICENSE 和 NOTICE 保留上游作者与来源。
- UI 先读 DESIGN.md，沿用 MonoCode 组件、尺寸和交互；禁止再造基础组件或装饰性包装。
- Pi 的 RPC、会话、模型、Skills 和扩展契约是事实来源；不建立第二套执行内核、消息协议或任务状态系统。
- llama.cpp 由桌面宿主监督，只监听回环地址；不得占用、终止或接管用户其他推理服务。
- 行远使用独立应用与 Pi 数据目录，不读取或迁移知远、MonoCode 或用户 ~/.pi 的历史与凭据。
- 安装使用 `bun install`，锁文件为 bun.lock。新增直接依赖锁定精确版本，先检查已有能力。
- 查看上游实际源码、类型和参数后使用 API；不猜测。异步 I/O 与进程工作离开 UI/主事件线程。
- 新模块按职责组织，文件不超过 800 行；对上游超长文件只做必要导入与接线。
- TypeScript 不使用 any。共享状态、命令名和判别值使用模块 constants.ts。
- 提交使用英文 Conventional Commits；只暂存明确路径，不覆盖其他会话改动。
- 运行 `bun run lint`、`bun run test`、`bun run build` 和适用 Rust 测试。真实运行验证独立于单元测试。
- 新增功能明确区分实现、测试、实机验证、打包验收与发布；不将待办写成已经交付。
- GitHub 操作使用宿主 gh。未经用户明确指令，不发送消息、不迁移旧数据、不发布安装包。

## 开发

```sh
bun install
bun run desktop:dev
bun run build
bun run lint
bun run test
cargo test --locked
cargo clippy --locked --workspace --all-targets -- -D warnings
```

## CI 与合并

- PR 必须通过 macOS、Linux、Windows 的身份检查、类型/格式检查、前端和 Rust 测试、Clippy、前端构建及桌面可执行文件链接构建。
- CodeQL 检查 TypeScript/JavaScript、Rust 和 Actions；Bun 全锁文件审计与 PR 依赖审查阻止高危及以上漏洞。扫描完成不等于没有告警，须同时检查代码扫描合并规则。
- Actions 固定完整提交 SHA，更新由 Dependabot 提 PR；禁止使用 `pull_request_target` 执行外部 PR 代码。
- main 通过 PR 修改，检查须基于最新 main；禁止强推、删分支或绕过质量门禁。
- CI 不连接开发者内网模型，不读取宿主凭据，不发布安装包。原生交互、模型任务质量和正式安装包仍需独立验收。

## 上游

上游地址与基线提交见 UPSTREAM.md。保持原生能力与增量改动可区分；不要把旧产品整个复制进来。
