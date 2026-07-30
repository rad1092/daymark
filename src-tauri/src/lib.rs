mod storage;

use serde::Serialize;
use storage::{BackupRecord, DaymarkDatabase};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
};
#[cfg(desktop)]
use tauri_plugin_autostart::ManagerExt as _;
#[cfg(desktop)]
use tauri_plugin_global_shortcut::{Code, Modifiers, ShortcutState};
#[cfg(desktop)]
use tauri_plugin_updater::UpdaterExt as _;

fn show_window(window: &WebviewWindow) -> Result<(), String> {
    window.show().map_err(|error| error.to_string())?;
    if window.is_minimized().map_err(|error| error.to_string())? {
        window.unminimize().map_err(|error| error.to_string())?;
    }
    window.set_focus().map_err(|error| error.to_string())
}

fn show_main(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Daymark 주 창을 찾지 못했습니다.".to_string())?;
    show_window(&window)
}

#[tauri::command]
fn show_main_window(app: AppHandle) -> Result<(), String> {
    show_main(&app)
}

#[tauri::command]
fn hide_main_window(app: AppHandle) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or_else(|| "Daymark 주 창을 찾지 못했습니다.".to_string())?
        .hide()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_main_window_always_on_top(app: AppHandle, enabled: bool) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or_else(|| "Daymark 주 창을 찾지 못했습니다.".to_string())?
        .set_always_on_top(enabled)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn load_daymark_data(database: State<'_, DaymarkDatabase>) -> Result<Option<String>, String> {
    database.load().map_err(|error| error.to_string())
}

#[tauri::command]
fn save_daymark_data(
    database: State<'_, DaymarkDatabase>,
    data_json: String,
    expected_revision: Option<i64>,
) -> Result<(), String> {
    database
        .save(&data_json, expected_revision)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn create_daymark_backup(
    database: State<'_, DaymarkDatabase>,
    data_json: String,
    label: String,
) -> Result<(), String> {
    database
        .create_backup(&data_json, &label)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn list_daymark_backups(database: State<'_, DaymarkDatabase>) -> Result<Vec<BackupRecord>, String> {
    database.list_backups().map_err(|error| error.to_string())
}

#[tauri::command]
fn is_launch_at_login_enabled(app: AppHandle) -> Result<bool, String> {
    #[cfg(desktop)]
    {
        app.autolaunch()
            .is_enabled()
            .map_err(|error| error.to_string())
    }
    #[cfg(not(desktop))]
    {
        let _ = app;
        Ok(false)
    }
}

#[tauri::command]
fn set_launch_at_login(app: AppHandle, enabled: bool) -> Result<(), String> {
    #[cfg(desktop)]
    {
        if enabled {
            app.autolaunch().enable().map_err(|error| error.to_string())
        } else {
            app.autolaunch()
                .disable()
                .map_err(|error| error.to_string())
        }
    }
    #[cfg(not(desktop))]
    {
        let _ = (app, enabled);
        Err("모바일에서는 로그인 시 실행을 지원하지 않습니다.".to_string())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateResult {
    status: &'static str,
    version: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeCapabilities {
    desktop_window_controls: bool,
    launch_at_login: bool,
    global_shortcuts: bool,
    updater: bool,
}

#[cfg(any(desktop, test))]
fn complete_update_config<'a>(
    endpoint: Option<&'a str>,
    public_key: Option<&'a str>,
) -> Option<(&'a str, &'a str)> {
    let endpoint = endpoint?.trim();
    let public_key = public_key?.trim();
    if endpoint.is_empty() || public_key.is_empty() {
        None
    } else {
        Some((endpoint, public_key))
    }
}

#[cfg(desktop)]
fn updater_config() -> Option<(&'static str, &'static str)> {
    complete_update_config(
        option_env!("DAYMARK_UPDATE_ENDPOINT"),
        option_env!("DAYMARK_UPDATER_PUBKEY"),
    )
}

#[cfg(desktop)]
fn updater_plugin_config(public_key: &str) -> serde_json::Value {
    serde_json::json!({
        "endpoints": [],
        "pubkey": public_key,
        "windows": null
    })
}

#[tauri::command]
fn get_runtime_capabilities() -> RuntimeCapabilities {
    RuntimeCapabilities {
        desktop_window_controls: cfg!(desktop),
        launch_at_login: cfg!(desktop),
        global_shortcuts: cfg!(desktop),
        #[cfg(desktop)]
        updater: updater_config().is_some(),
        #[cfg(not(desktop))]
        updater: false,
    }
}

#[tauri::command]
async fn check_for_updates(app: AppHandle) -> Result<UpdateResult, String> {
    #[cfg(desktop)]
    {
        let Some((endpoint, _)) = updater_config() else {
            return Ok(UpdateResult {
                status: "disabled",
                version: None,
            });
        };
        let endpoint = endpoint
            .parse::<url::Url>()
            .map_err(|error| format!("업데이트 주소가 올바르지 않습니다: {error}"))?;
        let updater = app
            .updater_builder()
            .endpoints(vec![endpoint])
            .map_err(|error| error.to_string())?
            .build()
            .map_err(|error| error.to_string())?;
        let update = updater.check().await.map_err(|error| error.to_string())?;
        Ok(match update {
            Some(release) => UpdateResult {
                status: "available",
                version: Some(release.version),
            },
            None => UpdateResult {
                status: "current",
                version: None,
            },
        })
    }
    #[cfg(not(desktop))]
    {
        let _ = app;
        Ok(UpdateResult {
            status: "disabled",
            version: None,
        })
    }
}

#[cfg(desktop)]
fn build_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItem::with_id(app, "show", "Daymark 열기", true, None::<&str>)?;
    let capture = MenuItem::with_id(app, "capture", "빠른 수집", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &capture, &quit])?;
    let mut builder = TrayIconBuilder::with_id("daymark")
        .tooltip("Daymark")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                let _ = show_main(app);
            }
            "capture" => {
                if show_main(app).is_ok() {
                    let _ = app.emit("daymark://quick-capture", ());
                }
            }
            "quit" => app.exit(0),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

#[cfg(desktop)]
fn shortcut_modifiers() -> Modifiers {
    #[cfg(target_os = "macos")]
    {
        Modifiers::SUPER | Modifiers::SHIFT
    }
    #[cfg(not(target_os = "macos"))]
    {
        Modifiers::CONTROL | Modifiers::SHIFT
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        let modifiers = shortcut_modifiers();
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, _, _| {
                let _ = show_main(app);
            }))
            .plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_shortcuts(["CmdOrCtrl+Shift+D", "CmdOrCtrl+Shift+N"])
                    .expect("Daymark global shortcuts must be valid")
                    .with_handler(move |app, shortcut, event| {
                        if event.state != ShortcutState::Pressed {
                            return;
                        }
                        let _ = show_main(app);
                        if shortcut.matches(modifiers, Code::KeyN) {
                            let _ = app.emit("daymark://quick-capture", ());
                        }
                    })
                    .build(),
            )
            .plugin(
                tauri_plugin_autostart::Builder::new()
                    .app_name("Daymark")
                    .build(),
            )
            .plugin(
                tauri_plugin_window_state::Builder::default()
                    .with_state_flags(
                        tauri_plugin_window_state::StateFlags::POSITION
                            | tauri_plugin_window_state::StateFlags::SIZE,
                    )
                    .build(),
            );
        if let Some((_, public_key)) = updater_config() {
            builder = builder.plugin(
                tauri_plugin_updater::Builder::new()
                    .pubkey(public_key)
                    .build(),
            );
        }
    }

    let mut context = tauri::generate_context!();
    #[cfg(desktop)]
    if let Some((_, public_key)) = updater_config() {
        context
            .config_mut()
            .plugins
            .0
            .insert("updater".to_string(), updater_plugin_config(public_key));
    }

    builder
        .setup(|app| {
            let data_directory = app
                .path()
                .app_data_dir()
                .map_err(|error| error.to_string())?;
            let database =
                DaymarkDatabase::open(&data_directory).map_err(|error| error.to_string())?;
            app.manage(database);
            #[cfg(desktop)]
            build_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            #[cfg(desktop)]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
            #[cfg(not(desktop))]
            let _ = (window, event);
        })
        .invoke_handler(tauri::generate_handler![
            show_main_window,
            hide_main_window,
            set_main_window_always_on_top,
            load_daymark_data,
            save_daymark_data,
            create_daymark_backup,
            list_daymark_backups,
            get_runtime_capabilities,
            is_launch_at_login_enabled,
            set_launch_at_login,
            check_for_updates,
        ])
        .run(context)
        .expect("Daymark failed to start");
}

#[cfg(test)]
mod tests {
    use super::complete_update_config;
    #[cfg(desktop)]
    use super::updater_plugin_config;

    #[test]
    fn updater_requires_both_non_empty_values() {
        assert_eq!(
            complete_update_config(Some("https://updates.example.test"), Some("public-key")),
            Some(("https://updates.example.test", "public-key"))
        );
        assert_eq!(
            complete_update_config(Some("https://updates.example.test"), None),
            None
        );
        assert_eq!(complete_update_config(None, Some("public-key")), None);
        assert_eq!(complete_update_config(Some("  "), Some("public-key")), None);
        assert_eq!(
            complete_update_config(Some("https://updates.example.test"), Some("")),
            None
        );
        assert_eq!(
            complete_update_config(
                Some("  https://updates.example.test/latest.json  "),
                Some("  public-key  ")
            ),
            Some(("https://updates.example.test/latest.json", "public-key"))
        );
    }

    #[cfg(desktop)]
    #[test]
    fn updater_plugin_config_is_a_valid_object() {
        let config: tauri_plugin_updater::Config =
            serde_json::from_value(updater_plugin_config("public-key"))
                .expect("generated updater config must deserialize");

        assert_eq!(config.pubkey, "public-key");
        assert!(config.endpoints.is_empty());
    }
}
