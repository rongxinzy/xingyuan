// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { open } from "@tauri-apps/plugin-dialog";
import {
  localInference,
  type LocalInferenceSnapshot,
} from "../model/localInference";
import { LocalInferencePhase } from "../model/constants";
import { refreshPiCatalog } from "../../../integrations/harness/providers/pi/piCatalog";
import { saveDefaultModel } from "../../sessions/model/models";
import { LocalInferenceSettings } from "./LocalInferenceSettings";

vi.mock("../model/localInference", () => ({
  localInference: {
    snapshot: vi.fn(),
    save: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("../../../platform/tauri/fs", () => ({ revealPath: vi.fn() }));
vi.mock("../../../integrations/harness/providers/pi/piCatalog", () => ({
  refreshPiCatalog: vi.fn(),
}));
vi.mock("../../sessions/model/models", () => ({
  saveDefaultModel: vi.fn(),
  saveLastModelChoice: vi.fn(),
}));

const stopped: LocalInferenceSnapshot = {
  config: {
    binaryPath: "/运行文件/llama-server",
    modelPath: "/模型/中文.gguf",
    port: 8081,
    contextSize: 8192,
    gpuLayers: 99,
  },
  phase: LocalInferencePhase.Stopped,
  pid: null,
  endpoint: "http://127.0.0.1:8081/v1",
  modelId: "pi:xingyuan-local/local-model",
  piAgentDir: "/xingyuan/pi/agent",
  logPath: "/xingyuan/local-inference.log",
  error: null,
};

let container: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  vi.mocked(localInference.snapshot).mockResolvedValue(stopped);
  vi.mocked(localInference.save).mockResolvedValue(stopped);
  vi.mocked(localInference.stop).mockResolvedValue(stopped);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(LocalInferenceSettings)));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function button(label: string): HTMLButtonElement {
  const result = [...container.querySelectorAll("button")].find(
    (element) => element.textContent === label,
  );
  expect(result, `Missing button: ${label}`).toBeDefined();
  return result!;
}

it("keeps the current default model when saving fails", async () => {
  vi.mocked(localInference.save).mockRejectedValue(
    new Error("Invalid configuration"),
  );
  await act(async () => button("保存配置").click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Invalid configuration",
  );
  expect(refreshPiCatalog).not.toHaveBeenCalled();
  expect(saveDefaultModel).not.toHaveBeenCalled();
  expect(button("保存配置").disabled).toBe(false);
});

it("refreshes native Pi models and selects the local model after saving", async () => {
  await act(async () => button("保存配置").click());
  expect(refreshPiCatalog).toHaveBeenCalledOnce();
  expect(saveDefaultModel).toHaveBeenCalledWith("pi", stopped.modelId);
  expect(container.textContent).toContain("配置已保存");
});

it("allows stop while loading and ignores a stale successful start response", async () => {
  let finish: ((snapshot: LocalInferenceSnapshot) => void) | undefined;
  vi.mocked(localInference.start).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () => button("启动模型").click());
  expect(container.textContent).toContain("正在加载模型");
  expect(button("停止模型").disabled).toBe(false);
  expect(button("选择模型文件").disabled).toBe(true);
  await act(async () => button("停止模型").click());
  expect(localInference.stop).toHaveBeenCalledOnce();
  await act(async () =>
    finish!({ ...stopped, phase: LocalInferencePhase.Running, pid: 123 }),
  );
  expect(container.textContent).toContain("未启动");
  expect(container.textContent).not.toContain("运行中");
  expect(button("启动模型").disabled).toBe(false);
});

it("saves a Chinese model path returned by the native file picker verbatim", async () => {
  vi.mocked(open).mockResolvedValue("/中文目录/模型; test.gguf");
  await act(async () => button("选择模型文件").click());
  await act(async () => button("保存配置").click());
  expect(localInference.save).toHaveBeenCalledWith({
    ...stopped.config,
    modelPath: "/中文目录/模型; test.gguf",
  });
  expect(open).toHaveBeenCalledWith(
    expect.objectContaining({
      filters: [{ name: "GGUF", extensions: ["gguf"] }],
    }),
  );
});
