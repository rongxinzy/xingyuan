# 上游与复用边界

| 层 | 来源 | 当前版本或基线 |
| --- | --- | --- |
| 桌面与交互 | https://github.com/hardbeat920/monocode | `1e97594ddf6f40aa24671f7fa09f2048deb1d5eb` |
| 智能体 | https://github.com/earendil-works/pi | npm `@earendil-works/pi-coding-agent` `1.0.0` |
| 本地推理 | https://github.com/ggml-org/llama.cpp | 内置官方 `b11321`；也可手动选择用户安装的 llama-server |

保留 MonoCode 的 Git 历史、LICENSE 与 NOTICE。`upstream` remote 指向 MonoCode，`origin` 指向行远。

行远维护产品身份、独立数据目录和本地推理接入。Pi RPC、会话、模型与资源发现沿用原生实现；llama.cpp 使用原生 OpenAI 兼容接口。当前不复制知远的运行时 adapter、Redux 对话投影、任务状态系统和主题引擎。

桌面构建下载 Pi 1.0.0 和 llama.cpp b11321 的官方发布文件，不自行重编译运行时。`scripts/runtimes/manifest.ts` 记录 macOS、Windows、Linux 的 arm64/x64 文件、大小和 SHA-256，以及原始许可证来源；完整配套文件保留。版本随应用维护，Pi 自更新入口不适用于托管运行包。六种清单目标不代表六种平台已完成实机验收。

修改上游时优先局部接线与独立功能模块，不大范围搬动文件。第一版仍保留上游多提供商、代码编辑、工作树和自动化代码，默认新会话选择 Pi；这些附带能力尚未按行远产品范围完成验收。

开发者可比较：`git diff 1e97594ddf6f40aa24671f7fa09f2048deb1d5eb -- src src-tauri scripts`。
