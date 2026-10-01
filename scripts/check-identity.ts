import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const config = JSON.parse(
  readFileSync(
    new URL("../src-tauri/tauri.conf.json", import.meta.url),
    "utf8",
  ),
);
const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const cargo = readFileSync(new URL("../Cargo.toml", import.meta.url), "utf8");
const macos = readFileSync(
  new URL("../src-tauri/src/macos.rs", import.meta.url),
  "utf8",
);
assert.equal(config.productName, "行远");
assert.equal(config.identifier, "com.rongxin.xingyuan");
assert.equal(pkg.name, "xingyuan-desktop");
assert.equal(config.version, pkg.version);
assert.ok(cargo.includes(`version = "${pkg.version}"`));
assert.ok(macos.includes('const DEV_BUNDLE_ID: &str = "com.rongxin.xingyuan"'));
assert.equal(config.bundle.createUpdaterArtifacts, false);
assert.deepEqual(config.plugins.updater.endpoints, []);
for (const platform of ["windows", "linux"]) {
  const platformConfig = JSON.parse(
    readFileSync(
      new URL(`../src-tauri/tauri.${platform}.conf.json`, import.meta.url),
      "utf8",
    ),
  );
  assert.equal(platformConfig.app.windows[0].title, "行远");
}
console.log(
  "Xingyuan identity, versions, and isolated update configuration are consistent.",
);
