#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod git_service;
mod metadata;
mod project_service;

use metadata::{AppStatus, ProjectDetail, ProjectListItem, Version};
use project_service::ProjectService;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

struct AppState {
    service: Mutex<Option<ProjectService>>,
}

fn service(app: &AppHandle, state: &State<AppState>) -> Result<ProjectService, String> {
    let mut guard = state
        .service
        .lock()
        .map_err(|_| "应用状态暂时不可用，请重试。".to_string())?;

    if let Some(service) = guard.as_ref() {
        return Ok(service.clone());
    }

    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "无法定位应用数据目录。".to_string())?;
    let service = ProjectService::new(data_dir).map_err(|error| error.to_string())?;
    *guard = Some(service.clone());
    Ok(service)
}

#[tauri::command]
fn get_app_status(app: AppHandle, state: State<AppState>) -> Result<AppStatus, String> {
    let service = service(&app, &state)?;
    Ok(service.app_status())
}

#[tauri::command]
fn list_projects(app: AppHandle, state: State<AppState>) -> Result<Vec<ProjectListItem>, String> {
    let service = service(&app, &state)?;
    service.list_projects().map_err(|error| error.to_string())
}

#[tauri::command]
fn add_project(
    app: AppHandle,
    state: State<AppState>,
    path: String,
) -> Result<ProjectDetail, String> {
    let service = service(&app, &state)?;
    service.add_project(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn get_project_detail(
    app: AppHandle,
    state: State<AppState>,
    project_id: String,
) -> Result<ProjectDetail, String> {
    let service = service(&app, &state)?;
    service
        .get_project_detail(&project_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_version(
    app: AppHandle,
    state: State<AppState>,
    project_id: String,
    note: Option<String>,
) -> Result<Version, String> {
    let service = service(&app, &state)?;
    service
        .save_version(&project_id, note)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn rollback_to_version(
    app: AppHandle,
    state: State<AppState>,
    project_id: String,
    version_id: String,
) -> Result<ProjectDetail, String> {
    let service = service(&app, &state)?;
    service
        .rollback_to_version(&project_id, &version_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn update_project_name(
    app: AppHandle,
    state: State<AppState>,
    project_id: String,
    display_name: String,
) -> Result<ProjectDetail, String> {
    let service = service(&app, &state)?;
    service
        .update_project_name(&project_id, display_name)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn relink_project_path(
    app: AppHandle,
    state: State<AppState>,
    project_id: String,
    path: String,
) -> Result<ProjectDetail, String> {
    let service = service(&app, &state)?;
    service
        .relink_project_path(&project_id, path)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn open_project_folder(
    app: AppHandle,
    state: State<AppState>,
    project_id: String,
) -> Result<(), String> {
    let service = service(&app, &state)?;
    service
        .open_project_folder(&project_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn open_data_dir(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let service = service(&app, &state)?;
    service.open_data_dir().map_err(|error| error.to_string())
}

#[tauri::command]
fn export_project_copy(
    app: AppHandle,
    state: State<AppState>,
    project_id: String,
    target_path: String,
) -> Result<(), String> {
    let service = service(&app, &state)?;
    service
        .export_project_copy(&project_id, target_path)
        .map_err(|error| error.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            service: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            get_app_status,
            list_projects,
            add_project,
            get_project_detail,
            save_version,
            rollback_to_version,
            update_project_name,
            relink_project_path,
            open_project_folder,
            open_data_dir,
            export_project_copy
        ])
        .run(tauri::generate_context!())
        .expect("failed to run app");
}
