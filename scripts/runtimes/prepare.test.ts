import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { RuntimeId, RuntimeTarget } from "./constants";
import { ARCHIVES, PI_VERSION, type Download } from "./manifest";
import {
  downloadVerified,
  runtimeTarget,
  validateArchiveEntries,
  verifyDownload,
} from "./prepare";

const directories: string[] = [];
async function temporary() {
  const path = await mkdtemp(join(tmpdir(), "xingyuan-runtime-test-"));
  directories.push(path);
  return path;
}
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

function asset(text: string): Download {
  return {
    url: "https://example.test/official.tar.gz",
    sha256: createHash("sha256").update(text).digest("hex"),
    bytes: Buffer.byteLength(text),
  };
}

it("supports only declared host architectures and pins both official archives", () => {
  for (const target of Object.values(RuntimeTarget)) {
    const [platform, architecture] = target.split("-");
    expect(runtimeTarget(platform, architecture)).toBe(target);
    for (const id of Object.values(RuntimeId)) {
      expect(ARCHIVES[target][id].url).toMatch(/^https:\/\/github.com\//);
      expect(ARCHIVES[target][id].sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(ARCHIVES[target][id].bytes).toBeGreaterThan(0);
    }
    expect(ARCHIVES[target][RuntimeId.Pi].url).toContain(`/v${PI_VERSION}/`);
  }
  expect(() => runtimeTarget("linux", "ia32")).toThrow(
    "Unsupported runtime target",
  );
});

it("rejects archive traversal on both Windows and Unix paths", () => {
  validateArchiveEntries("pi/\npi/pi\nllama-b11321/libllama.dylib\n");
  for (const path of [
    "../../escape",
    "/absolute",
    "C:\\escape",
    "pi\\..\\escape",
  ])
    expect(() => validateArchiveEntries(path)).toThrow("Unsafe archive entry");
});

it("checks cached bytes instead of trusting the archive filename", async () => {
  const directory = await temporary();
  const expected = asset("pinned runtime");
  const fetcher = vi.fn<typeof fetch>(
    async () => new Response("pinned runtime"),
  );
  const path = await downloadVerified(expected, directory, fetcher);
  expect(await verifyDownload(path, expected)).toBe(true);
  expect(await downloadVerified(expected, directory, fetcher)).toBe(path);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await writeFile(path, "tampered!!!!!");
  expect(await verifyDownload(path, expected)).toBe(false);
  await downloadVerified(expected, directory, fetcher);
  expect(await readFile(path, "utf8")).toBe("pinned runtime");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("does not publish a download whose hash, size or HTTP status is wrong", async () => {
  const directory = await temporary();
  const expected = asset("good");
  for (const response of [
    new Response("evil"),
    new Response("larger"),
    new Response("", { status: 503 }),
  ]) {
    const fetcher: typeof fetch = async () => response;
    await expect(
      downloadVerified(expected, directory, fetcher),
    ).rejects.toThrow();
  }
  const fetcher: typeof fetch = async () => new Response("good");
  const path = await downloadVerified(expected, directory, fetcher);
  expect(await verifyDownload(path, expected)).toBe(true);
});
