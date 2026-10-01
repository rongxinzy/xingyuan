# 上游与复用边界

| 层 | 来源 | 当前版本或基线 |
| --- | --- | --- |
| 桌面与交互 | https://github.com/hardbeat920/monocode | `1e97594ddf6f40aa24671f7fa09f2048deb1d5eb` |
| 智能体 | https://github.com/earendil-works/pi | npm `@earendil-works/pi-coding-agent` `0.99.2` |
| 本地推理 | https://github.com/ggml-org/llama.cpp | 选择用户安装的 llama-server；实机验证版本记录在验收证据中 |

保留 MonoCode 的 Git 历史、LICENSE 与 NOTICE。`upstream` remote 指向 MonoCode，`origin` 指向行远。

行远维护产品身份、独立数据目录和本地推理接入。Pi RPC、会话、模型与资源发现沿用原生实现；llama.cpp 使用原生 OpenAI 兼容接口。当前不复制知远的运行时 adapter、Redux 对话投影、任务状态系统和主题引擎。

修改上游时优先局部接线与独立功能模块，不大范围搬动文件。第一版仍保留上游多提供商、代码编辑、工作树和自动化代码，默认新会话选择 Pi；这些附带能力尚未按行远产品范围完成验收。

开发者可比较：`git diff 1e97594ddf6f40aa24671f7fa09f2048deb1d5eb -- src src-tauri scripts`。
