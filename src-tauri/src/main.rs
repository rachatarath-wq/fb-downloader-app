use axum::{
    routing::{get, post},
    http::Method,
    Json, Router, response::Html,
};
use serde::{Deserialize, Serialize};
use tokio::process::Command;
use tower_http::cors::{Any, CorsLayer};
use std::time::{SystemTime, UNIX_EPOCH};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::process::Stdio;
use std::path::Path;

use axum::extract::Query; // 👈 เพิ่มบรรทัดนี้ด้านบนสุดของไฟล์ (ตรงกลุ่ม use axum::...)
// กำหนด Path ใหม่ให้อยู่ในโฟลเดอร์ที่แอปมีสิทธิ์เขียนเสมอ
const CONFIG_PATH: &str = "/tmp/fb_config.json";

// ---------------------------------------------------------
// เพิ่มโค้ดโครงสร้างและฟังก์ชันใหม่ 2 ตัวนี้ลงไปใน main.rs
// ---------------------------------------------------------
#[derive(Deserialize)]
pub struct BrowseQuery {
    pub path: Option<String>,
}

// โค้ดบรรทัดนี้คือจุดที่ระบบแชทแอบลบไปครับ
async fn browse_directory(Query(params): Query<BrowseQuery>) -> Json<Vec<String>> {
    let base_path = params.path.unwrap_or_else(|| "/".to_string());
    let mut dirs = Vec::new();

    if base_path != "/" && base_path.len() > 0 {
        dirs.push(".. (ย้อนกลับ)".to_string());
    }

    if let Ok(entries) = fs::read_dir(&base_path) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_dir() { 
                    if let Ok(name) = entry.file_name().into_string() {
                        dirs.push(name);
                    }
                }
            }
        }
    }
    dirs.sort();
    Json(dirs)
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppConfig {
    pub save_directory: String,
    pub ffmpeg_profile: String, 
    pub custom_args: String,    
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            save_directory: "/smb".to_string(), // ค่าเริ่มต้นชี้ไปที่ /smb ตามที่คุณเคยใช้
            ffmpeg_profile: "mac".to_string(),         
            custom_args: "".to_string(),
        }
    }
}

#[derive(Deserialize)]
pub struct DownloadPayload {
    pub video_url: String,
    pub audio_url: String,
    pub filename: Option<String>,
    pub user_agent: Option<String>, // 🛡️ เพิ่มรับค่า User-Agent จาก Extension
    pub cookies: Option<String>,    // 🛡️ เพิ่มรับค่า Cookies จาก Extension
}

// ---------------------------------------------------------
// ส่วนที่ 1: ระบบจัดการการตั้งค่า (Config & Logs)
// ---------------------------------------------------------

pub fn load_config() -> AppConfig {
    if Path::new(CONFIG_PATH).exists() {
        let data = fs::read_to_string(CONFIG_PATH).unwrap_or_default();
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        let default_config = AppConfig::default();
        save_config(&default_config);
        default_config
    }
}

pub fn save_config(config: &AppConfig) {
    let data = serde_json::to_string_pretty(config).unwrap();
    // เอา .expect() ออก เพื่อเวลามีปัญหาโปรแกรมหลังบ้านจะได้ไม่แครชดับไปเลย
    let _ = fs::write(CONFIG_PATH, data); 
}

fn write_log(msg: &str) {
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open("/tmp/server.log") {
        let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
        writeln!(file, "[{}] {}", timestamp, msg).ok();
    }
}

// ---------------------------------------------------------
// ส่วนที่ 2: API Endpoints
// ---------------------------------------------------------

async fn get_settings() -> Json<AppConfig> {
    Json(load_config())
}

async fn save_settings(Json(config): Json<AppConfig>) -> &'static str {
    save_config(&config);
    "Settings saved successfully"
}

async fn clear_logs() -> &'static str {
    // ลบไฟล์ทิ้งไปเลยเด็ดขาด เพื่อตัดปัญหาการโดนโปรแกรมอื่น (FFmpeg) ยึดไฟล์ไว้
    let _ = std::fs::remove_file("/tmp/server.log");
    
    // พอสั่งเขียน Log บรรทัดนี้ ระบบจะสร้างไฟล์ใหม่ขึ้นมาให้เองแบบสะอาด 100%
    write_log("✅ เคลียร์ Log เรียบร้อยแล้วผ่านหน้าตั้งค่า!");
    
    "Logs cleared"
}

// ---------------------------------------------------------
// ส่วนที่ 3: ระบบหลัก (Main Server & Download Logic)
// ---------------------------------------------------------

fn main() {
    // 1. แยกโค้ด Server ของคุณไปรันใน Background Thread
    std::thread::spawn(|| {
        // สร้างระบบรองรับ async สำหรับรัน Axum
        tokio::runtime::Runtime::new().unwrap().block_on(async {
            
            // เคลียร์ Log เก่าทุกครั้งที่ Restart โปรแกรม
            let _ = fs::remove_file("/tmp/server.log");
            write_log("🚀 Server started! พร้อมรับคำสั่งดาวน์โหลด");

            let cors = CorsLayer::new()
                .allow_origin(Any)
                .allow_methods([Method::GET, Method::POST]) 
                .allow_headers(Any);

            let app = Router::new()
                .route("/download", post(handle_download))
                .route("/logs", get(handle_logs)) 
                .route("/settings", get(get_settings).post(save_settings))
                .route("/clear-log", post(clear_logs))
                .route("/browse", get(browse_directory)) 
                .layer(cors);

            // เปลี่ยนจาก 0.0.0.0 เป็น 127.0.0.1 เพราะตอนนี้เรารันบน Mac โดยตรง (ปลอดภัยกว่า)
            let listener = tokio::net::TcpListener::bind("127.0.0.1:3000").await.unwrap();
            println!("🚀 Backend Server running silently on http://127.0.0.1:3000");
            
            axum::serve(listener, app).await.unwrap();
        });
    });

    // 2. รันหน้าต่าง Desktop ของ Tauri (ส่วนนี้คือ UI ของ Mac)
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init()) 
        .plugin(tauri_plugin_dialog::init()) 
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn handle_download(Json(payload): Json<DownloadPayload>) -> &'static str {
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
    
    // 1. นำชื่อไฟล์จาก Extension มาใช้งาน
    let base_name = payload.filename.unwrap_or_else(|| format!("FB_Video_{}", timestamp));
    
    // 2. ดึงการตั้งค่าปัจจุบันมาตรวจสอบ Path
    let config = load_config();
    let final_output_path = format!("{}/{}.mp4", config.save_directory, base_name);

    write_log("--------------------------------------------------");
    write_log(&format!("📥 เริ่มโปรเจกต์ใหม่: {}", base_name));
    write_log(&format!("📂 ปลายทาง: {}", final_output_path));
    write_log(&format!("⚙️ กำลังใช้ Profile: {}", config.ffmpeg_profile));

    let log_file = OpenOptions::new().create(true).append(true).open("/tmp/server.log").unwrap();
    let log_file_err = log_file.try_clone().unwrap();
 
    // 🛡️ เตรียมข้อมูลพรางตัว (ถ้าไม่มีให้ใช้ Default เนียนๆ)
    let user_agent = payload.user_agent.clone().unwrap_or_else(|| "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36".to_string());
    
    // 🛡️ จัดฟอร์แมต Headers สำหรับหลอก Facebook
    //let mut headers = String::from("Referer: https://www.facebook.com/\r\n");
    //if let Some(c) = &payload.cookies {
   //     if !c.is_empty() {
   //         headers.push_str(&format!("Cookie: {}\r\n", c));
   //     }
   // }
    // 🛡️ จัดฟอร์แมต Headers สำหรับหลอก Facebook (อัปเกรดเพิ่ม Headers ย่อย)
    let mut headers = String::from("Referer: https://www.facebook.com/\r\n");
    
    // เพิ่มชุด Headers มาตรฐานของ Google Chrome
    headers.push_str("Accept: */*\r\n");
    headers.push_str("Accept-Language: th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7\r\n");
    headers.push_str("Sec-Fetch-Mode: cors\r\n");
    headers.push_str("Sec-Fetch-Site: cross-site\r\n");

    if let Some(c) = &payload.cookies {
        if !c.is_empty() {
            headers.push_str(&format!("Cookie: {}\r\n", c));
        }
    }


    let mut ffmpeg_cmd = Command::new("/opt/homebrew/bin/ffmpeg");

    ffmpeg_cmd.arg("-y"); // บังคับเขียนทับไฟล์เดิม

    // 🛡️ แทรกการพรางตัวสำหรับ Video (ต้องแทรกก่อน -i เสมอ)
    ffmpeg_cmd.arg("-user_agent").arg(&user_agent);
    ffmpeg_cmd.arg("-headers").arg(&headers);
    ffmpeg_cmd.arg("-i").arg(&payload.video_url);

    // 🛡️ แทรกการพรางตัวสำหรับ Audio (ต้องแทรกก่อน -i เสมอ)
    ffmpeg_cmd.arg("-user_agent").arg(&user_agent);
    ffmpeg_cmd.arg("-headers").arg(&headers);
    ffmpeg_cmd.arg("-i").arg(&payload.audio_url);

    // 3. ใส่คำสั่งตาม Profile ที่ตั้งค่าไว้จาก Extension
    match config.ffmpeg_profile.as_str() {
        "mac" => {
            ffmpeg_cmd.args(["-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p", "-movflags", "+faststart"]);
        },
        "windows" => {
            ffmpeg_cmd.args(["-c:v", "copy", "-c:a", "copy"]);
        },
        "custom" => {
            let parsed_args: Vec<&str> = config.custom_args.split_whitespace().collect();
            ffmpeg_cmd.args(&parsed_args);
        },
        _ => {
            ffmpeg_cmd.args(["-c:v", "copy", "-c:a", "copy"]); 
        }
    }

    ffmpeg_cmd.arg(&final_output_path);

    let output = ffmpeg_cmd
        .stdout(Stdio::from(log_file))      
        .stderr(Stdio::from(log_file_err))  
        .spawn();

    match output {
        Ok(_) => "Downloading and merging in background...",
        Err(e) => {
            write_log(&format!("❌ เกิดข้อผิดพลาด ffmpeg: {}", e));
            "Error starting download"
        }
    }
}

async fn handle_logs() -> Html<String> {
    let content = fs::read_to_string("/tmp/server.log").unwrap_or_else(|_| "ยังไม่มีประวัติการทำงาน".to_string());
    let clean_content = content.replace("\r", "\n");

    let html = format!(
        r#"
        <!DOCTYPE html>
        <html>
            <head>
                <meta charset="UTF-8">
                <title>FB Downloader Logs</title>
                <meta http-equiv="refresh" content="2">
                <style>
                    body {{ background-color: #1e1e1e; color: #00ff00; font-family: 'Courier New', monospace; padding: 20px; line-height: 1.5; }}
                    h2 {{ color: #ffffff; border-bottom: 1px solid #555; padding-bottom: 10px; }}
                    pre {{ white-space: pre-wrap; word-wrap: break-word; font-size: 14px; }}
                    .container {{ max-width: 1000px; margin: auto; background: #000; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.5); }}
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>🖥️ Server Logs (อัปเดตสถานะอัตโนมัติ)</h2>
                    <pre>{}</pre>
                </div>
                <script>
                    window.scrollTo(0, document.body.scrollHeight);
                </script>
            </body>
        </html>
        "#,
        clean_content
    );

    Html(html)
}