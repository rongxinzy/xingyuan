import { invoke } from "@tauri-apps/api/core";
import { LocalInferenceCommand, type LocalInferencePhase } from "./constants";

export interface LocalInferenceConfig {
  binaryPath: string;
  modelPath: string;
  port: number;
  contextSize: number;
  gpuLayers: number;
}

export interface LocalInferenceSnapshot {
  config: LocalInferenceConfig;
  phase: LocalInferencePhase;
  pid: number | null;
  endpoint: string;
  modelId: string;
  piAgentDir: string;
  logPath: string;
  error: string | null;
}

export const localInference = {
  snapshot: () =>
    invoke<LocalInferenceSnapshot>(LocalInferenceCommand.Snapshot),
  save: (config: LocalInferenceConfig) =>
    invoke<LocalInferenceSnapshot>(LocalInferenceCommand.Save, { config }),
  start: () => invoke<LocalInferenceSnapshot>(LocalInferenceCommand.Start),
  stop: () => invoke<LocalInferenceSnapshot>(LocalInferenceCommand.Stop),
};
