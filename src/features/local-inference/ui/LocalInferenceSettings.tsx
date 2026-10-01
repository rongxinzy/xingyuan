import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { SecondaryButton } from "../../../shared/ui/SecondaryButton";
import { revealPath } from "../../../platform/tauri/fs";
import { refreshPiCatalog } from "../../../integrations/harness/providers/pi/piCatalog";
import {
  saveDefaultModel,
  saveLastModelChoice,
} from "../../sessions/model/models";
import { LocalInferencePhase } from "../model/constants";
import {
  localInference,
  type LocalInferenceConfig,
  type LocalInferenceSnapshot,
} from "../model/localInference";

const phaseLabels = {
  [LocalInferencePhase.Stopped]: "未启动",
  [LocalInferencePhase.Starting]: "正在加载模型",
  [LocalInferencePhase.Running]: "运行中",
  [LocalInferencePhase.Error]: "启动失败",
};

export function LocalInferenceSettings() {
  const [snapshot, setSnapshot] = useState<LocalInferenceSnapshot | null>(null);
  const [draft, setDraft] = useState<LocalInferenceConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(false);
  const revision = useRef(0);

  useEffect(() => {
    mounted.current = true;
    void localInference
      .snapshot()
      .then((next) => {
        if (!mounted.current) return;
        setSnapshot(next);
        setDraft(next.config);
      })
      .catch((reason: unknown) => {
        if (mounted.current) setError(String(reason));
      });
    return () => {
      mounted.current = false;
    };
  }, []);

  const active =
    snapshot?.phase === LocalInferencePhase.Running ||
    snapshot?.phase === LocalInferencePhase.Starting;

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      const current = revision.current;
      void localInference
        .snapshot()
        .then((next) => {
          if (mounted.current && current === revision.current)
            setSnapshot(next);
        })
        .catch((reason: unknown) => {
          if (mounted.current && current === revision.current)
            setError(String(reason));
        });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  const action = async (
    run: (current: number) => Promise<LocalInferenceSnapshot>,
  ) => {
    const current = ++revision.current;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await run(current);
      if (!mounted.current || current !== revision.current) return;
      setSnapshot(next);
      setDraft(next.config);
    } catch (reason: unknown) {
      if (mounted.current && current === revision.current)
        setError(String(reason));
      const next = await localInference.snapshot().catch(() => null);
      if (next && mounted.current && current === revision.current)
        setSnapshot(next);
    } finally {
      if (mounted.current && current === revision.current) setBusy(false);
    }
  };

  const start = () => {
    if (!draft) return;
    void action(async (current) => {
      const next = await localInference.save(draft);
      if (current !== revision.current) throw new Error("启动已取消。");
      if (mounted.current)
        setSnapshot({ ...next, phase: LocalInferencePhase.Starting });
      return localInference.start();
    });
  };

  const save = () => {
    if (!draft) return;
    void action(async (current) => {
      const next = await localInference.save(draft);
      await refreshPiCatalog();
      if (!mounted.current || current !== revision.current) return next;
      saveDefaultModel("pi", next.modelId);
      saveLastModelChoice("pi", next.modelId);
      if (mounted.current)
        setNotice("配置已保存。启动模型后，新建会话即可使用。");
      return next;
    });
  };

  const pick = async (model: boolean) => {
    setError(null);
    try {
      const selected = await open({
        title: model ? "选择 GGUF 模型" : "选择 llama-server",
        multiple: false,
        directory: false,
        ...(model ? { filters: [{ name: "GGUF", extensions: ["gguf"] }] } : {}),
      });
      if (typeof selected === "string") {
        setDraft((current) =>
          current
            ? {
                ...current,
                [model ? "modelPath" : "binaryPath"]: selected,
              }
            : current,
        );
      }
    } catch (reason: unknown) {
      setError(String(reason));
    }
  };

  if (!draft || !snapshot)
    return <p role="status">{error ?? "正在读取本地模型配置…"}</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3" aria-live="polite">
        <span className="text-[13px] text-content">
          {phaseLabels[snapshot.phase]}
        </span>
        <span className="text-[12px] text-content/45">{snapshot.endpoint}</span>
        {active ? (
          <SecondaryButton
            onClick={() => {
              void action(localInference.stop);
            }}
          >
            停止模型
          </SecondaryButton>
        ) : (
          <SecondaryButton
            disabled={busy || !draft.binaryPath || !draft.modelPath}
            onClick={start}
          >
            启动模型
          </SecondaryButton>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-content/10 bg-content/3">
        <div className="settings-row flex flex-wrap items-center gap-3 border-b border-content/5 px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium">运行文件</div>
            <p className="mt-1 break-all text-[12px] text-content/45">
              {draft.binaryPath || "选择已安装的 llama-server 文件"}
            </p>
          </div>
          <SecondaryButton
            disabled={busy || active}
            onClick={() => {
              void pick(false);
            }}
          >
            选择运行文件
          </SecondaryButton>
        </div>
        <div className="settings-row flex flex-wrap items-center gap-3 border-b border-content/5 px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium">模型文件</div>
            <p className="mt-1 break-all text-[12px] text-content/45">
              {draft.modelPath || "选择本机的 GGUF 模型"}
            </p>
          </div>
          <SecondaryButton
            disabled={busy || active}
            onClick={() => {
              void pick(true);
            }}
          >
            选择模型文件
          </SecondaryButton>
        </div>
        <p className="px-4 py-3.5 text-[12px] text-content/45">
          模型只监听本机地址。上下文 {draft.contextSize}，端口 {draft.port}
          。修改配置前请先停止模型。
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <SecondaryButton
          disabled={busy || active || !draft.binaryPath || !draft.modelPath}
          onClick={save}
        >
          保存配置
        </SecondaryButton>
        <SecondaryButton
          onClick={() => {
            void revealPath(snapshot.piAgentDir).catch((reason: unknown) =>
              setError(String(reason)),
            );
          }}
        >
          打开配置目录
        </SecondaryButton>
        <SecondaryButton
          onClick={() => {
            void revealPath(snapshot.logPath).catch((reason: unknown) =>
              setError(String(reason)),
            );
          }}
        >
          查看运行日志
        </SecondaryButton>
      </div>
      {error || snapshot.error ? (
        <p role="alert" className="break-words text-[13px] text-red-400">
          {error || snapshot.error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-[13px] text-content/70">
          {notice}
        </p>
      ) : null}
      <p className="text-[12px] leading-relaxed text-content/45">
        只加载你选择的模型文件。退出行远后，本次启动的模型进程也会停止。
      </p>
    </div>
  );
}
