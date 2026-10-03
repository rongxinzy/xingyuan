import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  chmod,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  writeFile,
  open,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { RuntimeId, RuntimeTarget } from "./constants";
import {
  ARCHIVES,
  LLAMA_LICENSE,
  LLAMA_VERSION,
  PI_LICENSE,
  PI_VERSION,
  type Download,
} from "./manifest";

const execute = promisify(execFile);
const MAX_ARCHIVE_LIST_BYTES = 4 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const EXTRACTION_TIMEOUT_MS = 60_000;

export function runtimeTarget(
  platform: string,
  architecture: string,
): RuntimeTarget {
  const target = `${platform}-${architecture}`;
  if (!Object.values(RuntimeTarget).includes(target as RuntimeTarget))
    throw new Error(`Unsupported runtime target: ${target}`);
  return target as RuntimeTarget;
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function verifyDownload(
  path: string,
  asset: Download,
): Promise<boolean> {
  if (!(await exists(path))) return false;
  const stat = await lstat(path);
  if (!stat.isFile() || stat.size !== asset.bytes) return false;
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex") === asset.sha256;
}

export async function downloadVerified(
  asset: Download,
  cache: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  await mkdir(cache, { recursive: true });
  const destination = join(
    cache,
    `${asset.sha256}-${basename(new URL(asset.url).pathname)}`,
  );
  if (await verifyDownload(destination, asset)) return destination;
  const temporary = `${destination}.${process.pid}.tmp`;
  try {
    const response = await fetcher(asset.url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!response.ok || !response.body)
      throw new Error(
        `Runtime download failed: HTTP ${response.status} (${asset.url})`,
      );
    let received = 0;
    const hash = createHash("sha256");
    const verifier = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length;
        if (received > asset.bytes) {
          callback(new Error("Runtime download exceeded its pinned size."));
          return;
        }
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    await pipeline(
      Readable.from(response.body),
      verifier,
      createWriteStream(temporary, { flags: "wx" }),
    );
    if (received !== asset.bytes || hash.digest("hex") !== asset.sha256)
      throw new Error(`Runtime checksum or size mismatch: ${asset.url}`);
    await rename(temporary, destination);
    return destination;
  } finally {
    await rm(temporary, { force: true });
  }
}

export function validateArchiveEntries(list: string): void {
  for (const entry of list.split(/\r?\n/).filter(Boolean)) {
    const normalized = entry.replaceAll("\\", "/");
    if (
      normalized.startsWith("/") ||
      /^[a-z]:/i.test(normalized) ||
      normalized.split("/").includes("..")
    )
      throw new Error(`Unsafe archive entry: ${entry}`);
  }
}

async function validateTree(
  root: string,
  directory = root,
  depth = 0,
): Promise<void> {
  if (depth > 20) throw new Error("Runtime archive directory depth exceeded.");
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      const target = await readlink(path);
      const inside = relative(root, resolve(dirname(path), target));
      if (
        isAbsolute(target) ||
        inside === ".." ||
        inside.startsWith(`..${sep}`)
      )
        throw new Error(`Runtime symlink escapes its archive: ${path}`);
    } else if (entry.isDirectory()) await validateTree(root, path, depth + 1);
    else if (!entry.isFile())
      throw new Error(`Unsupported runtime archive entry: ${path}`);
  }
}

export async function prepareRuntimes(
  project: string,
  target: RuntimeTarget,
): Promise<string> {
  const build = join(project, "build");
  await mkdir(build, { recursive: true });
  const lockPath = join(build, ".runtimes.lock");
  const lock = await open(lockPath, "wx").catch(() => {
    throw new Error(
      "Runtime preparation is already running; inspect build/.runtimes.lock if a previous run was interrupted.",
    );
  });
  let temporary: string | undefined;
  try {
    temporary = await mkdtemp(join(build, ".runtimes-"));
    const prepared = join(temporary, "runtimes");
    const cache = join(build, "runtime-cache");
    const pkg = JSON.parse(
      await readFile(join(project, "package.json"), "utf8"),
    ) as { devDependencies: Record<string, string> };
    if (pkg.devDependencies["@earendil-works/pi-coding-agent"] !== PI_VERSION)
      throw new Error(
        "Pi dependency and official runtime manifest versions disagree.",
      );
    for (const id of Object.values(RuntimeId)) {
      const archive = ARCHIVES[target][id];
      const path = await downloadVerified(archive, cache);
      const extract = join(temporary, id);
      await mkdir(extract);
      const listing = await execute("tar", ["-tf", path], {
        maxBuffer: MAX_ARCHIVE_LIST_BYTES,
        timeout: EXTRACTION_TIMEOUT_MS,
      });
      validateArchiveEntries(listing.stdout);
      // Only extract the exact, checksum-verified upstream archive.
      await execute("tar", ["-xf", path, "-C", extract], {
        timeout: EXTRACTION_TIMEOUT_MS,
      });
      await validateTree(extract);
      const source = join(extract, archive.root);
      if (!(await lstat(join(source, archive.binary))).isFile())
        throw new Error(`Official ${id} archive is missing ${archive.binary}.`);
      const destination = join(prepared, id);
      await cp(source, destination, {
        recursive: true,
        verbatimSymlinks: true,
      });
      const license = id === RuntimeId.Pi ? PI_LICENSE : LLAMA_LICENSE;
      await cp(
        await downloadVerified(license, cache),
        join(destination, "LICENSE"),
      );
      if (process.platform !== "win32")
        await chmod(join(destination, archive.binary), 0o755);
    }
    await writeFile(
      join(prepared, "manifest.json"),
      JSON.stringify(
        {
          target,
          pi: PI_VERSION,
          llama: LLAMA_VERSION,
          archives: ARCHIVES[target],
        },
        null,
        2,
      ) + "\n",
    );
    const config = join(build, "tauri-runtimes.json");
    const stagedConfig = join(temporary, "tauri-runtimes.json");
    await writeFile(
      stagedConfig,
      JSON.stringify(
        { bundle: { resources: { "../build/runtimes/": "runtimes/" } } },
        null,
        2,
      ) + "\n",
    );
    const destination = join(build, "runtimes");
    const backup = join(temporary, "previous");
    const hadPrevious = await exists(destination);
    if (hadPrevious) await rename(destination, backup);
    try {
      await rename(prepared, destination);
      await rename(stagedConfig, config);
    } catch (error) {
      await rm(destination, { recursive: true, force: true });
      if (hadPrevious) await rename(backup, destination);
      throw error;
    }
    return config;
  } finally {
    try {
      if (temporary) await rm(temporary, { recursive: true, force: true });
    } finally {
      await lock.close();
      await rm(lockPath, { force: true });
    }
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const project = fileURLToPath(new URL("../../", import.meta.url));
  const target = runtimeTarget(process.platform, process.arch);
  const config = await prepareRuntimes(project, target);
  console.log(
    `[Runtimes] Prepared official Pi ${PI_VERSION} and llama.cpp ${LLAMA_VERSION} for ${target}; Tauri configuration: ${config}`,
  );
}
