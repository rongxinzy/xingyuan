use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde_json::Value;

use crate::harness::{exec_output, is_resolved_harness_binary};

const REGISTRY_URL: &str = "https://registry.npmjs.org";
const USER_AGENT: &str = "Xingyuan";
const HTTP_TIMEOUT: Duration = Duration::from_secs(10);
const PI_PROVIDER: &str = "pi";

/// Only harnesses whose releases are published to npm. The rest ship through
/// their own installers with no public version feed to compare against.
fn npm_package(provider: &str) -> Option<&'static str> {
    match provider {
        "claude" => Some("@anthropic-ai/claude-code"),
        "codex" => Some("@openai/codex"),
        "opencode" => Some("opencode-ai"),
        PI_PROVIDER => Some("@earendil-works/pi-coding-agent"),
        _ => None,
    }
}

/// Each CLI's own updater, which knows how it was installed (native, npm,
/// Homebrew) better than 行远 could guess from the binary path.
fn update_args(provider: &str) -> Option<&'static [&'static str]> {
    match provider {
        "claude" => Some(&["update"]),
        "codex" => Some(&["update"]),
        "opencode" => Some(&["upgrade"]),
        PI_PROVIDER => Some(&["update", "--self"]),
        _ => None,
    }
}

/// A download plus, for npm installs, a full dependency install.
const UPDATE_TIMEOUT: Duration = Duration::from_secs(300);

static LAUNCH_CHECK_CLAIMED: AtomicBool = AtomicBool::new(false);

/// True for the first caller per app process, so a window opened later in the
/// same run does not repeat the launch check.
#[tauri::command]
pub fn harness_update_check_claim() -> bool {
    !LAUNCH_CHECK_CLAIMED.swap(true, Ordering::SeqCst)
}

#[tauri::command]
pub async fn harness_latest_version(provider: String) -> Result<String, String> {
    if provider == PI_PROVIDER && crate::local_inference::managed_pi_binary().is_some() {
        // The caller treats unavailable feeds as absent notices. Managed Pi
        // follows the reviewed application version, never a CLI self-update.
        return Err("Managed Pi updates are delivered with Xingyuan.".into());
    }
    let package =
        npm_package(&provider).ok_or_else(|| format!("No update feed for harness: {provider}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        let agent = ureq::AgentBuilder::new().timeout(HTTP_TIMEOUT).build();
        let text = agent
            .get(&format!("{REGISTRY_URL}/{package}/latest"))
            .set("User-Agent", USER_AGENT)
            .set("Accept", "application/json")
            .call()
            .map_err(|error| format!("npm registry request failed: {error}"))?
            .into_string()
            .map_err(|error| format!("npm registry response unreadable: {error}"))?;
        let body: Value = serde_json::from_str(&text)
            .map_err(|error| format!("npm registry returned invalid JSON: {error}"))?;
        latest_version(&body).ok_or_else(|| "npm registry returned no version".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Runs the harness's self-update against the binary 行远 resolved for
/// it. stdin is closed, so an updater that stops to ask fails instead of
/// hanging.
#[tauri::command]
pub async fn harness_update(
    command: String,
    binary_provider: String,
    binary_path: Option<String>,
) -> Result<(), String> {
    let args: Vec<String> = update_args(&binary_provider)
        .ok_or_else(|| format!("No updater for harness: {binary_provider}"))?
        .iter()
        .map(|arg| arg.to_string())
        .collect();
    tauri::async_runtime::spawn_blocking(move || {
        if is_managed_pi(
            &command,
            crate::local_inference::managed_pi_binary().as_deref(),
        ) {
            return Err("Managed Pi updates are delivered with Xingyuan.".into());
        }
        if !is_resolved_harness_binary(&command, Some(&binary_provider), binary_path.as_deref()) {
            return Err("harness_update: not a resolved harness CLI".to_string());
        }
        let output = exec_output(&command, &args, None, UPDATE_TIMEOUT)?;
        if output.status.success() {
            return Ok(());
        }
        Err(update_failure(&output.stdout, &output.stderr))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn is_managed_pi(command: &str, managed: Option<&Path>) -> bool {
    let Some(managed) = managed else {
        return false;
    };
    match (Path::new(command).canonicalize(), managed.canonicalize()) {
        (Ok(command), Ok(managed)) => command == managed,
        _ => false,
    }
}

/// Updaters print their reason to either stream; the last line is the one
/// that says what went wrong.
fn update_failure(stdout: &[u8], stderr: &[u8]) -> String {
    [stderr, stdout]
        .iter()
        .filter_map(|bytes| {
            String::from_utf8_lossy(bytes)
                .lines()
                .map(str::trim)
                .rfind(|line| !line.is_empty())
                .map(str::to_string)
        })
        .next()
        .unwrap_or_else(|| "Update failed".to_string())
}

fn latest_version(body: &Value) -> Option<String> {
    let version = body.get("version")?.as_str()?.trim();
    (!version.is_empty()).then(|| version.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn maps_only_npm_published_harnesses() {
        assert_eq!(npm_package("claude"), Some("@anthropic-ai/claude-code"));
        assert_eq!(
            npm_package(PI_PROVIDER),
            Some("@earendil-works/pi-coding-agent")
        );
        assert_eq!(npm_package("cursor"), None);
        assert_eq!(npm_package("../../evil"), None);
    }

    #[test]
    fn updates_only_through_each_cli_own_updater() {
        assert_eq!(update_args(PI_PROVIDER), Some(&["update", "--self"][..]));
        assert_eq!(update_args("opencode"), Some(&["upgrade"][..]));
        assert_eq!(update_args("cursor"), None);
    }

    #[test]
    fn reports_the_last_line_an_updater_printed() {
        assert_eq!(
            update_failure(
                b"checking\n",
                b"npm ERR! code EACCES\nnpm ERR! permission denied\n\n"
            ),
            "npm ERR! permission denied"
        );
        assert_eq!(update_failure(b"no write access\n", b""), "no write access");
        assert_eq!(update_failure(b"", b""), "Update failed");
    }

    #[test]
    fn reads_version_from_registry_payload() {
        assert_eq!(
            latest_version(&json!({ "name": "opencode-ai", "version": "1.18.33" })),
            Some("1.18.33".to_string())
        );
        assert_eq!(latest_version(&json!({ "version": " " })), None);
        assert_eq!(latest_version(&json!({})), None);
    }

    #[test]
    fn managed_pi_is_protected_while_external_clis_remain_updatable() {
        let root = std::env::temp_dir().join(format!("xingyuan-update-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let managed = root.join("pi");
        let other = root.join("external-pi");
        std::fs::write(&managed, b"managed fixture").unwrap();
        std::fs::write(&other, b"external fixture").unwrap();
        assert!(is_managed_pi(&managed.to_string_lossy(), Some(&managed)));
        assert!(!is_managed_pi(&other.to_string_lossy(), Some(&managed)));
        assert!(!is_managed_pi(&managed.to_string_lossy(), None));
        #[cfg(unix)]
        {
            let alias = root.join("alias");
            std::os::unix::fs::symlink(&managed, &alias).unwrap();
            assert!(is_managed_pi(&alias.to_string_lossy(), Some(&managed)));
        }
        std::fs::remove_dir_all(root).unwrap();
    }
}
