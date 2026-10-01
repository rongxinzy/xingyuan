export const LocalInferenceCommand = {
  Snapshot: "local_inference_snapshot",
  Save: "local_inference_save",
  Start: "local_inference_start",
  Stop: "local_inference_stop",
} as const;

export const LocalInferencePhase = {
  Stopped: "stopped",
  Starting: "starting",
  Running: "running",
  Error: "error",
} as const;

export type LocalInferencePhase =
  (typeof LocalInferencePhase)[keyof typeof LocalInferencePhase];
