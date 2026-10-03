export const RuntimeId = { Pi: "pi", Llama: "llama" } as const;
export type RuntimeId = (typeof RuntimeId)[keyof typeof RuntimeId];

export const RuntimeTarget = {
  MacArm64: "darwin-arm64",
  MacX64: "darwin-x64",
  LinuxArm64: "linux-arm64",
  LinuxX64: "linux-x64",
  WindowsArm64: "win32-arm64",
  WindowsX64: "win32-x64",
} as const;
export type RuntimeTarget = (typeof RuntimeTarget)[keyof typeof RuntimeTarget];
