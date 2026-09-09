// Anvaya native core.
//
// Per the architecture, the Rust side owns the workspace filesystem: a workspace
// is a plain folder on disk (diagrams/, assets/, settings/, …) and these commands
// are the typed bridge the web frontend calls to read and write it. The CRDT and
// rendering stay in the frontend; only durable I/O lives here.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

/// Create the standard workspace folder layout at `root`.
fn scaffold(root: &Path) -> Result<(), String> {
    for sub in ["diagrams", "assets/images", "assets/attachments", "settings", "metadata"] {
        fs::create_dir_all(root.join(sub)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Ensure and return the default workspace path (~/Documents/Anvaya).
#[tauri::command]
fn default_workspace() -> Result<String, String> {
    let base: PathBuf = dirs::document_dir()
        .or_else(dirs::home_dir)
        .ok_or("could not locate a home/documents directory")?;
    let ws = base.join("Anvaya");
    scaffold(&ws)?;
    Ok(ws.to_string_lossy().into_owned())
}

/// Ensure the folder layout for a user-chosen workspace path.
#[tauri::command]
fn ensure_workspace(path: String) -> Result<String, String> {
    let root = PathBuf::from(&path);
    scaffold(&root)?;
    Ok(root.to_string_lossy().into_owned())
}

/// Read a UTF-8 text file. Returns null (None) if it does not exist.
#[tauri::command]
fn read_text(path: String) -> Result<Option<String>, String> {
    match fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Write a UTF-8 text file, creating parent directories as needed.
#[tauri::command]
fn write_text(path: String, contents: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, contents).map_err(|e| e.to_string())
}

/// Delete a file. Succeeds silently if it is already gone.
#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// List file names in `dir` ending with `ext` (e.g. ".anvaya").
#[tauri::command]
fn list_files(dir: String, ext: String) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(out),
        Err(e) => return Err(e.to_string()),
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.ends_with(&ext) {
            out.push(name);
        }
    }
    out.sort();
    Ok(out)
}

/// Provider-agnostic AI proxy: POST `body` (JSON) to `url` with `headers`, and
/// return the raw response body. Runs in the native layer so it bypasses the
/// webview's CORS and keeps API keys out of browser storage. The frontend owns
/// the per-provider request/response shapes; this stays a dumb, generic pipe.
#[tauri::command]
async fn ai_complete(
    url: String,
    headers: HashMap<String, String>,
    body: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut req = ureq::post(&url).set("content-type", "application/json");
        for (k, v) in &headers {
            req = req.set(k, v);
        }
        match req.send_string(&body) {
            Ok(resp) => resp.into_string().map_err(|e| e.to_string()),
            Err(ureq::Error::Status(code, resp)) => {
                let detail = resp.into_string().unwrap_or_default();
                Err(format!("HTTP {code}: {detail}"))
            }
            Err(e) => Err(e.to_string()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            default_workspace,
            ensure_workspace,
            read_text,
            write_text,
            delete_file,
            list_files,
            ai_complete
        ])
        .run(tauri::generate_context!())
        .expect("error while running Anvaya");
}
