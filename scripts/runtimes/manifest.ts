import { RuntimeId, RuntimeTarget } from "./constants";

export interface Download {
  url: string;
  sha256: string;
  bytes: number;
}

export interface RuntimeArchive extends Download {
  root: string;
  binary: string;
}

export const PI_VERSION = "1.0.0";
export const LLAMA_VERSION = "b11321";

function pi(platform: string, sha256: string, bytes: number): RuntimeArchive {
  const windows = platform.startsWith("windows-");
  return {
    url: `https://github.com/earendil-works/pi/releases/download/v${PI_VERSION}/pi-${platform}.${windows ? "zip" : "tar.gz"}`,
    root: windows ? "." : "pi",
    binary: windows ? "pi.exe" : "pi",
    sha256,
    bytes,
  };
}

function llama(
  platform: string,
  sha256: string,
  bytes: number,
): RuntimeArchive {
  const windows = platform.startsWith("win-");
  return {
    url: `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_VERSION}/llama-${LLAMA_VERSION}-bin-${platform}.${windows ? "zip" : "tar.gz"}`,
    root: windows ? "." : `llama-${LLAMA_VERSION}`,
    binary: windows ? "llama-server.exe" : "llama-server",
    sha256,
    bytes,
  };
}

export const ARCHIVES: Record<
  RuntimeTarget,
  Record<RuntimeId, RuntimeArchive>
> = {
  [RuntimeTarget.MacArm64]: {
    [RuntimeId.Pi]: pi(
      "darwin-arm64",
      "97291e7d2eb2d7d95ab1f67d26de7902302201bc8786c132bbbc9e53fa8526cc",
      31004152,
    ),
    [RuntimeId.Llama]: llama(
      "macos-arm64",
      "5f47ffa4de936853004e7403a09d87616022e5af16651d71fc66a96b261886fb",
      11827849,
    ),
  },
  [RuntimeTarget.MacX64]: {
    [RuntimeId.Pi]: pi(
      "darwin-x64",
      "62fb78fcdbc7c0dbd21044dd44bfb3af20df447285bb55e9debf86ff4838776d",
      33464767,
    ),
    [RuntimeId.Llama]: llama(
      "macos-x64",
      "1e6e53f2a3dc3a412df69dd0f4495571ea1fece32397362eebc02ac89bc8a0ec",
      11384272,
    ),
  },
  [RuntimeTarget.LinuxArm64]: {
    [RuntimeId.Pi]: pi(
      "linux-arm64",
      "b60b3fda830a43c1dc3f5edb5fc7b681f22a0a930b48cdac13b97570c6045819",
      42646353,
    ),
    [RuntimeId.Llama]: llama(
      "ubuntu-arm64",
      "965f548c3a2fe48df35e6a5dd3f81a0ecc1bc6b2b980bd02f7a61138a7c26a3e",
      13591262,
    ),
  },
  [RuntimeTarget.LinuxX64]: {
    [RuntimeId.Pi]: pi(
      "linux-x64",
      "8fd5543a52a889d60ad57ccbf6c969e73c75c5240aae18ac40b506947a63dc38",
      42549511,
    ),
    [RuntimeId.Llama]: llama(
      "ubuntu-x64",
      "b53d1a8fc0e31752d0309172e711c7bc8c0c11f9f1d6607766a6ac880da6badc",
      17546545,
    ),
  },
  [RuntimeTarget.WindowsArm64]: {
    [RuntimeId.Pi]: pi(
      "windows-arm64",
      "122d3a1825eac4aa17081c769188c1d058febf579a9407091ae829626997ea96",
      43674914,
    ),
    [RuntimeId.Llama]: llama(
      "win-cpu-arm64",
      "214c5cca6e500e5f4e4b4ce0986d4154f5ba2ef2dc5b615e666ee17885ab8f97",
      12117823,
    ),
  },
  [RuntimeTarget.WindowsX64]: {
    [RuntimeId.Pi]: pi(
      "windows-x64",
      "f7dbd39814bf6763f01e7f688ad089615de1d0eb55fc8915a49acdc2088f4404",
      45041072,
    ),
    [RuntimeId.Llama]: llama(
      "win-cpu-x64",
      "8f8c0c6501b075f52deff59537c05acd57d8621a0a7935f29b7d7c4812892569",
      19275154,
    ),
  },
};

export const PI_LICENSE: Download = {
  url: "https://raw.githubusercontent.com/earendil-works/pi/a13d35a742c6ef8462812a28fbe1d8c8b7431c32/LICENSE",
  sha256: "0457f5bcec3b3b211605dfb5d1a49042fd638f3686a410fe099c24a25af13c48",
  bytes: 1069,
};

export const LLAMA_LICENSE: Download = {
  url: "https://raw.githubusercontent.com/ggml-org/llama.cpp/b11321/LICENSE",
  sha256: "94f29bbed6a22c35b992c5c6ebf0e7c92f13b836b90f36f461c9cf2f0f1d010d",
  bytes: 1078,
};
