//! Xingyuan owns one loopback llama.cpp process. Pi owns the agent protocol.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State};

const LOCAL_PROVIDER: &str = "xingyuan-local";
const MODEL_ALIAS: &str = "local-model";
const MAX_CONFIG_BYTES: u64 = 1024 * 1024;
const START_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LocalInferenceConfig {
    pub binary_path: String,
    pub model_path: String,
    pub port: u16,
    pub context_size: u32,
    pub gpu_layers: i32,
}

impl Default for LocalInferenceConfig {
    fn default() -> Self {
        Self {
            binary_path: String::new(),
            model_path: String::new(),
            port: 8081,
            context_size: 8192,
            gpu_layers: 99,
        }
    }
}

#[derive(Default)]
struct Runtime {
    child: Option<Child>,
    ready: bool,
    error: Option<String>,
}

#[derive(Default)]
pub struct LocalInferenceHost(Mutex<Runtime>);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalInferenceSnapshot {
    config: LocalInferenceConfig,
    phase: &'static str,
    pid: Option<u32>,
    endpoint: String,
    model_id: &'static str,
    pi_agent_dir: String,
    log_path: String,
    error: Option<String>,
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

pub fn initialize(app: &AppHandle) -> Result<(), String> {
    let root = data_dir(app)?;
    let agent_dir = root.join("pi/agent");
    fs::create_dir_all(&agent_dir).map_err(|e| e.to_string())?;
    // Keep Pi's native configuration and sessions isolated from ~/.pi and old products.
    std::env::set_var("PI_CODING_AGENT_DIR", &agent_dir);
    let resource_binary =
        app.path()
            .resource_dir()
            .map_err(|e| e.to_string())?
            .join(if cfg!(windows) {
                "runtimes/pi/pi.exe"
            } else {
                "runtimes/pi/pi"
            });
    if resource_binary.is_file() && std::env::var_os("XINGYUAN_PI_BINARY").is_none() {
        std::env::set_var("XINGYUAN_PI_BINARY", resource_binary);
    }
    Ok(())
}

pub fn managed_pi_binary() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("XINGYUAN_PI_BINARY") {
        let path = PathBuf::from(path);
        if path.is_file() {
            return Some(path);
        }
    }
    #[cfg(debug_assertions)]
    {
        let directory = Path::new(env!("CARGO_MANIFEST_DIR")).join("../node_modules/.bin");
        let names: &[&str] = if cfg!(windows) {
            &["pi.exe", "pi.cmd"]
        } else {
            &["pi"]
        };
        if let Some(path) = names
            .iter()
            .map(|name| directory.join(name))
            .find(|path| path.is_file())
        {
            return Some(path);
        }
    }
    None
}

fn read_json(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(json!({}));
    }
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut bytes = Vec::new();
    file.take(MAX_CONFIG_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_CONFIG_BYTES {
        return Err("Configuration exceeds the 1 MiB limit.".into());
    }
    serde_json::from_slice(&bytes).map_err(|e| format!("Invalid configuration: {e}"))
}

fn atomic_json(path: &Path, value: &Value) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or("Configuration has no parent directory.")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temporary = parent.join(format!(".{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temporary).map_err(|e| e.to_string())?;
        file.write_all(&serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        file.write_all(b"\n").map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        fs::rename(&temporary, path).map_err(|e| e.to_string())
    })();
    if result.is_err() {
        let _ = fs::remove_file(temporary);
    }
    result
}

fn load_config(root: &Path) -> Result<LocalInferenceConfig, String> {
    let path = root.join("local-inference.json");
    if !path.exists() {
        return Ok(LocalInferenceConfig::default());
    }
    serde_json::from_value(read_json(&path)?).map_err(|e| e.to_string())
}

fn validate_config(config: &LocalInferenceConfig) -> Result<(), String> {
    if config.port < 1024 {
        return Err("Use a local port between 1024 and 65535.".into());
    }
    if !(512..=131_072).contains(&config.context_size) {
        return Err("Context size must be between 512 and 131072.".into());
    }
    if !(-1..=999).contains(&config.gpu_layers) {
        return Err("GPU layers must be between -1 and 999.".into());
    }
    if config.binary_path.len() > 4096 || config.model_path.len() > 4096 {
        return Err("A selected path is too long.".into());
    }
    Ok(())
}

fn endpoint(config: &LocalInferenceConfig) -> String {
    format!("http://127.0.0.1:{}/v1", config.port)
}

fn update_pi_models(root: &Path, config: &LocalInferenceConfig) -> Result<(), String> {
    let path = root.join("pi/agent/models.json");
    let mut models = read_json(&path)?;
    let document = models
        .as_object_mut()
        .ok_or("Pi models must be a JSON object.")?;
    let providers = document.entry("providers").or_insert_with(|| json!({}));
    let providers = providers
        .as_object_mut()
        .ok_or("Pi providers must be a JSON object.")?;
    if config.model_path.is_empty() {
        providers.remove(LOCAL_PROVIDER);
    } else {
        let name = Path::new(&config.model_path)
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("Local model");
        providers.insert(
            LOCAL_PROVIDER.into(),
            json!({
                "baseUrl": endpoint(config),
                "api": "openai-completions",
                "apiKey": "xingyuan-local",
                "models": [{
                    "id": MODEL_ALIAS,
                    "name": name,
                    "reasoning": false,
                    "input": ["text"],
                    "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
                    "contextWindow": config.context_size,
                    "maxTokens": (config.context_size / 2).min(4096),
                    "compat": {"supportsDeveloperRole": false, "supportsStore": false}
                }]
            }),
        );
    }
    atomic_json(&path, &models)
}

fn reap_finished(runtime: &mut Runtime) -> Result<(), String> {
    if let Some(child) = runtime.child.as_mut() {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            runtime.child = None;
            runtime.ready = false;
            runtime.error = Some(format!("Local inference exited: {status}"));
        }
    }
    Ok(())
}

fn snapshot(app: &AppHandle, runtime: &mut Runtime) -> Result<LocalInferenceSnapshot, String> {
    reap_finished(runtime)?;
    let root = data_dir(app)?;
    let config = load_config(&root)?;
    let phase = if runtime.child.is_some() {
        if runtime.ready {
            "running"
        } else {
            "starting"
        }
    } else if runtime.error.is_some() {
        "error"
    } else {
        "stopped"
    };
    Ok(LocalInferenceSnapshot {
        endpoint: endpoint(&config),
        config,
        phase,
        pid: runtime.child.as_ref().map(Child::id),
        model_id: "pi:xingyuan-local/local-model",
        pi_agent_dir: root.join("pi/agent").to_string_lossy().into_owned(),
        log_path: root
            .join("local-inference.log")
            .to_string_lossy()
            .into_owned(),
        error: runtime.error.clone(),
    })
}

#[tauri::command(async)]
pub fn local_inference_snapshot(
    app: AppHandle,
    host: State<'_, LocalInferenceHost>,
) -> Result<LocalInferenceSnapshot, String> {
    let mut runtime = host.0.lock().map_err(|e| e.to_string())?;
    snapshot(&app, &mut runtime)
}

#[tauri::command(async)]
pub fn local_inference_save(
    app: AppHandle,
    host: State<'_, LocalInferenceHost>,
    config: LocalInferenceConfig,
) -> Result<LocalInferenceSnapshot, String> {
    validate_config(&config)?;
    let mut runtime = host.0.lock().map_err(|e| e.to_string())?;
    reap_finished(&mut runtime)?;
    if runtime.child.is_some() {
        return Err("Stop local inference before changing its configuration.".into());
    }
    let root = data_dir(&app)?;
    update_pi_models(&root, &config)?;
    atomic_json(
        &root.join("local-inference.json"),
        &serde_json::to_value(&config).map_err(|e| e.to_string())?,
    )?;
    runtime.error = None;
    snapshot(&app, &mut runtime)
}

fn validate_files(config: &LocalInferenceConfig) -> Result<(), String> {
    if !Path::new(&config.binary_path).is_file() {
        return Err("Select an installed llama-server executable.".into());
    }
    let mut model = File::open(&config.model_path)
        .map_err(|e| format!("Cannot open the selected GGUF model: {e}"))?;
    let mut magic = [0; 4];
    model
        .read_exact(&mut magic)
        .map_err(|e| format!("Cannot read the selected GGUF model: {e}"))?;
    if &magic != b"GGUF" {
        return Err("The selected file is not a GGUF model.".into());
    }
    Ok(())
}

fn server_args(config: &LocalInferenceConfig) -> Vec<String> {
    vec![
        "--model".into(),
        config.model_path.clone(),
        "--alias".into(),
        MODEL_ALIAS.into(),
        "--host".into(),
        "127.0.0.1".into(),
        "--port".into(),
        config.port.to_string(),
        "--ctx-size".into(),
        config.context_size.to_string(),
        "--n-gpu-layers".into(),
        config.gpu_layers.to_string(),
        "--jinja".into(),
        "--no-webui".into(),
    ]
}

fn terminate(runtime: &mut Runtime) -> Result<(), String> {
    if let Some(child) = runtime.child.as_mut() {
        if child.try_wait().map_err(|e| e.to_string())?.is_none() {
            child.kill().map_err(|e| e.to_string())?;
        }
        child.wait().map_err(|e| e.to_string())?;
    }
    runtime.child = None;
    runtime.ready = false;
    Ok(())
}

#[tauri::command(async)]
pub fn local_inference_start(
    app: AppHandle,
    host: State<'_, LocalInferenceHost>,
) -> Result<LocalInferenceSnapshot, String> {
    let root = data_dir(&app)?;
    let (config, pid) = {
        let mut runtime = host.0.lock().map_err(|e| e.to_string())?;
        reap_finished(&mut runtime)?;
        if runtime.child.is_some() {
            return Err("Local inference is already running or starting.".into());
        }
        // Serialize configuration selection with save and process publication.
        let config = load_config(&root)?;
        validate_config(&config)?;
        validate_files(&config)?;
        // Refuse to attach to or terminate another application's server.
        let reservation = TcpListener::bind(("127.0.0.1", config.port))
            .map_err(|e| format!("The selected local port is unavailable: {e}"))?;
        update_pi_models(&root, &config)?;
        fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        let log = File::create(root.join("local-inference.log")).map_err(|e| e.to_string())?;
        let error_log = log.try_clone().map_err(|e| e.to_string())?;
        let mut command = Command::new(&config.binary_path);
        command
            .args(server_args(&config))
            .stdin(Stdio::null())
            .stdout(Stdio::from(log))
            .stderr(Stdio::from(error_log));
        crate::hide_window_console(&mut command);
        drop(reservation);
        let child = command
            .spawn()
            .map_err(|e| format!("Cannot start local inference: {e}"))?;
        let pid = child.id();
        runtime.child = Some(child);
        runtime.ready = false;
        runtime.error = None;
        (config, pid)
    };
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(1))
        .timeout_read(Duration::from_secs(2))
        .redirects(0)
        .build();
    let started = Instant::now();
    loop {
        {
            let mut runtime = host.0.lock().map_err(|e| e.to_string())?;
            reap_finished(&mut runtime)?;
            if runtime.child.as_ref().map(Child::id) != Some(pid) {
                return Err(runtime
                    .error
                    .clone()
                    .unwrap_or_else(|| "Local inference startup was stopped.".into()));
            }
        }
        if agent
            .get(&format!("http://127.0.0.1:{}/health", config.port))
            .call()
            .is_ok()
        {
            let mut runtime = host.0.lock().map_err(|e| e.to_string())?;
            reap_finished(&mut runtime)?;
            if runtime.child.as_ref().map(Child::id) == Some(pid) {
                runtime.ready = true;
                return snapshot(&app, &mut runtime);
            }
            return Err("Local inference startup was stopped.".into());
        }
        if started.elapsed() >= START_TIMEOUT {
            let mut runtime = host.0.lock().map_err(|e| e.to_string())?;
            if runtime.child.as_ref().map(Child::id) == Some(pid) {
                terminate(&mut runtime)?;
                runtime.error = Some(
                    "Local model did not become ready within 120 seconds. Check the runtime log."
                        .into(),
                );
            }
            return Err("Local inference startup timed out.".into());
        }
        std::thread::sleep(Duration::from_millis(250));
    }
}

#[tauri::command(async)]
pub fn local_inference_stop(
    app: AppHandle,
    host: State<'_, LocalInferenceHost>,
) -> Result<LocalInferenceSnapshot, String> {
    let mut runtime = host.0.lock().map_err(|e| e.to_string())?;
    terminate(&mut runtime)?;
    runtime.error = None;
    snapshot(&app, &mut runtime)
}

impl LocalInferenceHost {
    pub fn shutdown(&self) {
        if let Ok(mut runtime) = self.0.lock() {
            let _ = terminate(&mut runtime);
        }
    }
}

impl Drop for LocalInferenceHost {
    fn drop(&mut self) {
        self.shutdown();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temporary() -> PathBuf {
        let root = std::env::temp_dir().join(format!("xingyuan-local-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn local_model_preserves_other_pi_providers() {
        let root = temporary();
        let path = root.join("pi/agent/models.json");
        atomic_json(
            &path,
            &json!({"providers": {"custom-cloud": {"baseUrl": "https://example.test/v1"}}}),
        )
        .unwrap();
        let config = LocalInferenceConfig {
            model_path: "/tmp/中文模型.gguf".into(),
            ..Default::default()
        };
        update_pi_models(&root, &config).unwrap();
        let models = read_json(&path).unwrap();
        assert_eq!(
            models["providers"]["custom-cloud"]["baseUrl"],
            "https://example.test/v1"
        );
        assert_eq!(
            models["providers"][LOCAL_PROVIDER]["models"][0]["name"],
            "中文模型.gguf"
        );
        assert_eq!(
            models["providers"][LOCAL_PROVIDER]["api"],
            "openai-completions"
        );
        assert_eq!(
            models["providers"][LOCAL_PROVIDER]["models"][0]["id"],
            MODEL_ALIAS
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn clearing_local_model_removes_only_managed_provider() {
        let root = temporary();
        let path = root.join("pi/agent/models.json");
        atomic_json(
            &path,
            &json!({"providers": {LOCAL_PROVIDER: {}, "other": {}}}),
        )
        .unwrap();
        update_pi_models(&root, &LocalInferenceConfig::default()).unwrap();
        let models = read_json(&path).unwrap();
        assert!(models["providers"].get(LOCAL_PROVIDER).is_none());
        assert!(models["providers"].get("other").is_some());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn malformed_pi_models_are_not_overwritten() {
        let root = temporary();
        let path = root.join("pi/agent/models.json");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, b"not json").unwrap();
        assert!(update_pi_models(&root, &LocalInferenceConfig::default()).is_err());
        assert_eq!(fs::read_to_string(path).unwrap(), "not json");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn server_arguments_keep_paths_literal_and_bind_loopback() {
        let config = LocalInferenceConfig {
            model_path: "/tmp/中文 model; echo secret.gguf".into(),
            ..Default::default()
        };
        let args = server_args(&config);
        assert_eq!(args[1], config.model_path);
        assert!(args.windows(2).any(|args| args == ["--host", "127.0.0.1"]));
        assert!(args.windows(2).any(|args| args == ["--alias", MODEL_ALIAS]));
    }

    #[test]
    fn validates_model_header_and_parameter_limits() {
        let root = temporary();
        let model = root.join("model.gguf");
        fs::write(&model, b"invalid").unwrap();
        let config = LocalInferenceConfig {
            binary_path: model.to_string_lossy().into_owned(),
            model_path: model.to_string_lossy().into_owned(),
            ..Default::default()
        };
        assert!(validate_files(&config).is_err());
        fs::write(model, b"GGUFtest").unwrap();
        assert!(validate_files(&config).is_ok());
        assert!(validate_config(&LocalInferenceConfig {
            port: 80,
            ..config.clone()
        })
        .is_err());
        assert!(validate_config(&LocalInferenceConfig {
            context_size: 0,
            ..config
        })
        .is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
