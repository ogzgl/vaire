use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tauri::{Emitter, Manager, State};

// ============================================
// File System
// ============================================

#[derive(Debug, Serialize, Clone)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub children: Option<Vec<FileNode>>,
    pub lang: Option<String>,
    pub is_git_repo: bool,
}

fn detect_lang(path: &Path) -> Option<String> {
    let name = path.file_name()?.to_str()?;

    // Check full filename first
    let lang_by_name = match name {
        "Dockerfile" | "dockerfile" => Some("dockerfile"),
        "Makefile" | "makefile" => Some("makefile"),
        "Jenkinsfile" => Some("groovy"),
        ".gitignore" | ".dockerignore" => Some("ignore"),
        _ => None,
    };
    if let Some(l) = lang_by_name {
        return Some(l.to_string());
    }

    let ext = path.extension()?.to_str()?;
    let lang = match ext {
        "kt" | "kts" => "kotlin",
        "java" => "java",
        "js" | "jsx" | "mjs" | "cjs" => "javascript",
        "ts" | "tsx" | "mts" => "typescript",
        "py" => "python",
        "rs" => "rust",
        "go" => "go",
        "rb" => "ruby",
        "swift" => "swift",
        "c" | "h" => "c",
        "cpp" | "cc" | "cxx" | "hpp" => "cpp",
        "cs" => "csharp",
        "json" => "json",
        "yaml" | "yml" => "yaml",
        "toml" => "toml",
        "xml" => "xml",
        "html" | "htm" => "html",
        "css" => "css",
        "scss" => "scss",
        "less" => "less",
        "sql" => "sql",
        "sh" | "bash" | "zsh" => "shell",
        "md" | "markdown" => "markdown",
        "tf" | "tfvars" => "terraform",
        "gradle" => "gradle",
        "graphql" | "gql" => "graphql",
        "svelte" => "svelte",
        "vue" => "vue",
        "csv" => "csv",
        "env" => "env",
        "properties" => "properties",
        "ini" | "cfg" => "ini",
        "lock" => "lock",
        "svg" => "xml",
        "txt" => "plaintext",
        "log" => "plaintext",
        _ => return None,
    };
    Some(lang.to_string())
}

fn should_skip(name: &str) -> bool {
    matches!(
        name,
        "node_modules"
            | ".git"
            | "target"
            | "build"
            | "dist"
            | ".gradle"
            | ".idea"
            | ".vscode"
            | "__pycache__"
            | ".next"
            | ".nuxt"
            | ".svelte-kit"
            | "coverage"
            | ".turbo"
            | ".cache"
            | ".DS_Store"
            | ".ds_store"
            | "Thumbs.db"
    )
}

fn is_gitignored(path: &Path, root: &Path) -> bool {
    // Walk up to find .gitignore files and check
    let relative = match path.strip_prefix(root) {
        Ok(r) => r,
        Err(_) => return false,
    };

    let name = match path.file_name().and_then(|n| n.to_str()) {
        Some(n) => n,
        None => return false,
    };

    // Common gitignored patterns
    matches!(
        name,
        ".DS_Store" | "Thumbs.db" | ".env.local" | ".env.production"
            | "*.pyc" | "__pycache__"
    ) || name.ends_with(".pyc")
      || name.ends_with(".class")
      || name.ends_with(".o")
      || name.ends_with(".a")
}

fn read_dir_tree(path: &Path, depth: u32, max_depth: u32) -> Option<Vec<FileNode>> {
    if depth > max_depth {
        return Some(vec![]);
    }

    let mut entries: Vec<FileNode> = Vec::new();
    let read_dir = fs::read_dir(path).ok()?;

    let mut items: Vec<_> = read_dir.filter_map(|e| e.ok()).collect();
    items.sort_by(|a, b| {
        let a_is_dir = a.file_type().map(|ft| ft.is_dir()).unwrap_or(false);
        let b_is_dir = b.file_type().map(|ft| ft.is_dir()).unwrap_or(false);
        match (a_is_dir, b_is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.file_name().cmp(&b.file_name()),
        }
    });

    for entry in items {
        let entry_path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if name.starts_with('.') && !name.starts_with(".env") {
            continue;
        }
        if should_skip(&name) {
            continue;
        }

        if entry_path.is_dir() {
            let is_git = entry_path.join(".git").exists();
            let children = read_dir_tree(&entry_path, depth + 1, max_depth);

            entries.push(FileNode {
                name,
                path: entry_path.to_string_lossy().to_string(),
                node_type: if is_git { "repo".to_string() } else { "folder".to_string() },
                children,
                lang: None,
                is_git_repo: is_git,
            });
        } else {
            let lang = detect_lang(&entry_path);
            entries.push(FileNode {
                name,
                path: entry_path.to_string_lossy().to_string(),
                node_type: "file".to_string(),
                children: None,
                lang,
                is_git_repo: false,
            });
        }
    }

    Some(entries)
}

#[tauri::command]
fn read_directory(path: String) -> Result<Vec<FileNode>, String> {
    let dir_path = PathBuf::from(&path);
    if !dir_path.exists() || !dir_path.is_dir() {
        return Err(format!("Invalid directory: {}", path));
    }
    read_dir_tree(&dir_path, 0, 10).ok_or_else(|| "Failed to read directory".to_string())
}

#[tauri::command]
fn read_file_content(path: String) -> Result<String, String> {
    let file_path = PathBuf::from(&path);
    if !file_path.exists() {
        return Err(format!("File does not exist: {}", path));
    }
    let metadata = fs::metadata(&file_path).map_err(|e| e.to_string())?;
    if metadata.len() > 5 * 1024 * 1024 {
        return Err("File is too large (>5MB)".to_string());
    }
    fs::read_to_string(&file_path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
fn write_file_content(path: String, content: String) -> Result<(), String> {
    let file_path = PathBuf::from(&path);
    fs::write(&file_path, &content).map_err(|e| format!("Failed to write file: {}", e))
}

// ============================================
// Search
// ============================================

#[derive(Debug, Serialize, Clone)]
pub struct SearchResult {
    pub path: String,
    pub relative_path: String,
    pub line_number: u32,
    pub line_content: String,
    pub match_start: u32,
    pub match_end: u32,
}

fn is_binary_ext(path: &Path) -> bool {
    let ext = match path.extension().and_then(|e| e.to_str()) {
        Some(e) => e.to_lowercase(),
        None => return false,
    };
    matches!(
        ext.as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "bmp" | "ico" | "svg" | "webp"
            | "mp3" | "mp4" | "avi" | "mov" | "wav" | "flac"
            | "zip" | "tar" | "gz" | "rar" | "7z" | "bz2"
            | "pdf" | "doc" | "docx" | "xls" | "xlsx"
            | "woff" | "woff2" | "ttf" | "otf" | "eot"
            | "exe" | "dll" | "so" | "dylib" | "class" | "jar"
            | "lock" | "min.js" | "min.css"
            | "dump" | "db" | "sqlite"
    )
}

#[tauri::command]
async fn search_in_files(
    workspace_path: String,
    query: String,
    case_sensitive: bool,
    max_results: usize,
) -> Result<Vec<SearchResult>, String> {
    if query.len() < 2 {
        return Ok(vec![]);
    }

    // Run search in a blocking thread so it doesn't freeze the UI
    tokio::task::spawn_blocking(move || {
        let pattern = if case_sensitive {
            regex::Regex::new(&regex::escape(&query))
        } else {
            regex::RegexBuilder::new(&regex::escape(&query))
                .case_insensitive(true)
                .build()
        }
        .map_err(|e| e.to_string())?;

        let mut results = Vec::new();
        let ws_path = PathBuf::from(&workspace_path);

        fn search_dir(
            dir: &Path,
            ws_root: &Path,
            pattern: &regex::Regex,
            results: &mut Vec<SearchResult>,
            max_results: usize,
        ) {
            if results.len() >= max_results {
                return;
            }

            let entries = match fs::read_dir(dir) {
                Ok(e) => e,
                Err(_) => return,
            };

            for entry in entries.filter_map(|e| e.ok()) {
                if results.len() >= max_results {
                    return;
                }

                let path = entry.path();
                let name = entry.file_name().to_string_lossy().to_string();

                if name.starts_with('.') || should_skip(&name) {
                    continue;
                }

                if path.is_dir() {
                    search_dir(&path, ws_root, pattern, results, max_results);
                } else if path.is_file() {
                    // Skip binary files by extension
                    if is_binary_ext(&path) {
                        continue;
                    }

                    // Skip large files (>200KB for search)
                    let metadata = match fs::metadata(&path) {
                        Ok(m) => m,
                        Err(_) => continue,
                    };
                    if metadata.len() > 200 * 1024 {
                        continue;
                    }

                    let content = match fs::read_to_string(&path) {
                        Ok(c) => c,
                        Err(_) => continue, // Binary file or encoding issue
                    };

                    for (line_idx, line) in content.lines().enumerate() {
                        if results.len() >= max_results {
                            return;
                        }

                        if let Some(m) = pattern.find(line) {
                            let relative = path
                                .strip_prefix(ws_root)
                                .unwrap_or(&path)
                                .to_string_lossy()
                                .to_string();

                            results.push(SearchResult {
                                path: path.to_string_lossy().to_string(),
                                relative_path: relative,
                                line_number: (line_idx + 1) as u32,
                                line_content: line.to_string(),
                                match_start: m.start() as u32,
                                match_end: m.end() as u32,
                            });
                        }
                    }
                }
            }
        }

        search_dir(&ws_path, &ws_path, &pattern, &mut results, max_results);
        Ok(results)
    })
    .await
    .map_err(|e| format!("Search task failed: {}", e))?
}

// ============================================
// Git
// ============================================

#[derive(Debug, Serialize, Clone)]
pub struct GitRepo {
    pub path: String,
    pub name: String,
    pub branch: String,
    pub changed_files: Vec<GitChangedFile>,
    pub ahead: u32,
    pub behind: u32,
}

#[derive(Debug, Serialize, Clone)]
pub struct GitChangedFile {
    pub path: String,
    pub relative_path: String,
    pub status: String, // "modified", "added", "deleted", "untracked", "renamed"
    pub staged: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct GitLogEntry {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
    pub refs: String,
}

fn git_cmd(repo_path: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
fn get_git_repos(path: String) -> Result<Vec<String>, String> {
    let dir_path = PathBuf::from(&path);
    if !dir_path.is_dir() {
        return Err("Not a directory".to_string());
    }

    let mut repos = Vec::new();
    if dir_path.join(".git").exists() {
        repos.push(dir_path.to_string_lossy().to_string());
    }

    if let Ok(entries) = fs::read_dir(&dir_path) {
        for entry in entries.filter_map(|e| e.ok()) {
            if entry.path().is_dir() && entry.path().join(".git").exists() {
                repos.push(entry.path().to_string_lossy().to_string());
            }
        }
    }

    Ok(repos)
}

#[tauri::command]
fn get_git_status(repo_path: String) -> Result<GitRepo, String> {
    let path = PathBuf::from(&repo_path);
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    // Get branch
    let branch = git_cmd(&repo_path, &["rev-parse", "--abbrev-ref", "HEAD"])
        .unwrap_or_else(|_| "unknown".to_string())
        .trim()
        .to_string();

    // Get status
    let status_output = git_cmd(&repo_path, &["status", "--porcelain=v1"])?;
    let mut changed_files = Vec::new();

    for line in status_output.lines() {
        if line.len() < 4 {
            continue;
        }
        let index_status = line.chars().nth(0).unwrap_or(' ');
        let work_status = line.chars().nth(1).unwrap_or(' ');
        let file_path = line[3..].to_string();

        let (status, staged) = match (index_status, work_status) {
            ('?', '?') => ("untracked", false),
            ('A', _) => ("added", true),
            ('M', _) => ("modified", true),
            ('D', _) => ("deleted", true),
            ('R', _) => ("renamed", true),
            (_, 'M') => ("modified", false),
            (_, 'D') => ("deleted", false),
            _ => ("modified", false),
        };

        // Skip common junk files
        let file_name = file_path.split('/').last().unwrap_or(&file_path);
        if file_name == ".DS_Store" || file_name == "Thumbs.db" || file_name == ".ds_store" {
            continue;
        }

        changed_files.push(GitChangedFile {
            relative_path: file_path.clone(),
            path: path.join(&file_path).to_string_lossy().to_string(),
            status: status.to_string(),
            staged,
        });
    }

    // Get ahead/behind
    let ahead_behind = git_cmd(
        &repo_path,
        &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
    )
    .unwrap_or_else(|_| "0\t0".to_string());

    let parts: Vec<&str> = ahead_behind.trim().split('\t').collect();
    let ahead = parts.first().and_then(|s| s.parse().ok()).unwrap_or(0);
    let behind = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);

    Ok(GitRepo {
        path: repo_path,
        name,
        branch,
        changed_files,
        ahead,
        behind,
    })
}

#[tauri::command]
fn get_git_log(repo_path: String, count: u32) -> Result<Vec<GitLogEntry>, String> {
    let output = git_cmd(
        &repo_path,
        &[
            "log",
            &format!("-{}", count),
            "--pretty=format:%H|%h|%s|%an|%ad|%D",
            "--date=format:%d.%m.%Y, %H:%M",
        ],
    )?;

    let entries: Vec<GitLogEntry> = output
        .lines()
        .filter(|l| !l.is_empty())
        .map(|line| {
            let parts: Vec<&str> = line.splitn(6, '|').collect();
            GitLogEntry {
                hash: parts.first().unwrap_or(&"").to_string(),
                short_hash: parts.get(1).unwrap_or(&"").to_string(),
                message: parts.get(2).unwrap_or(&"").to_string(),
                author: parts.get(3).unwrap_or(&"").to_string(),
                date: parts.get(4).unwrap_or(&"").to_string(),
                refs: parts.get(5).unwrap_or(&"").to_string(),
            }
        })
        .collect();

    Ok(entries)
}

#[tauri::command]
fn get_git_diff(repo_path: String, file_path: String, staged: bool) -> Result<String, String> {
    let args = if staged {
        vec!["diff", "--cached", "--", &file_path]
    } else {
        vec!["diff", "--", &file_path]
    };
    git_cmd(&repo_path, &args)
}

// ============================================
// Terminal (PTY)
// ============================================

struct TerminalState {
    writers: Mutex<HashMap<u32, Box<dyn Write + Send>>>,
    next_id: Mutex<u32>,
}

#[tauri::command]
fn terminal_spawn(
    cwd: String,
    state: State<TerminalState>,
    app: tauri::AppHandle,
) -> Result<u32, String> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let mut cmd = CommandBuilder::new(&shell);
    cmd.cwd(&cwd);
    cmd.env("TERM", "xterm-256color");

    let mut child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    let id = {
        let mut next = state.next_id.lock().unwrap();
        let current = *next;
        *next += 1;
        current
    };

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to get writer: {}", e))?;

    {
        let mut writers = state.writers.lock().unwrap();
        writers.insert(id, writer);
    }

    // Reader thread: read PTY output and emit to frontend
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to get reader: {}", e))?;

    let app_clone = app.clone();
    let terminal_id = id;
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_clone.emit(
                        &format!("terminal-output-{}", terminal_id),
                        data,
                    );
                }
                Err(_) => break,
            }
        }
    });

    // Child wait thread
    std::thread::spawn(move || {
        let _ = child.wait();
    });

    Ok(id)
}

#[tauri::command]
fn terminal_write(id: u32, data: String, state: State<TerminalState>) -> Result<(), String> {
    let mut writers = state.writers.lock().unwrap();
    if let Some(writer) = writers.get_mut(&id) {
        writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("Write failed: {}", e))?;
        writer.flush().map_err(|e| format!("Flush failed: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn terminal_resize(id: u32, rows: u16, cols: u16) -> Result<(), String> {
    // Note: resize requires keeping a reference to the master PTY
    // For now this is a no-op, we'll improve this later
    Ok(())
}

// ============================================
// Git Blame
// ============================================

#[derive(Debug, Serialize, Clone)]
pub struct BlameEntry {
    pub line: u32,
    pub commit: String,
    pub short_commit: String,
    pub author: String,
    pub time: i64, // unix timestamp
    pub summary: String,
    pub is_committed: bool, // false for "not yet committed" lines
}

#[tauri::command]
async fn git_blame(repo_path: String, file_path: String) -> Result<Vec<BlameEntry>, String> {
    tokio::task::spawn_blocking(move || {
        let output = Command::new("git")
            .args(["blame", "--porcelain", &file_path])
            .current_dir(&repo_path)
            .output()
            .map_err(|e| format!("Failed to run git blame: {}", e))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }

        let text = String::from_utf8_lossy(&output.stdout);
        let mut entries: Vec<BlameEntry> = Vec::new();

        // Porcelain format: each hunk starts with "<hash> <orig-line> <final-line> <num-lines>"
        // followed by header lines, then a line starting with TAB which is the content
        let mut current_hash = String::new();
        let mut current_author = String::new();
        let mut current_time: i64 = 0;
        let mut current_summary = String::new();
        let mut current_line: u32 = 0;
        // cache of previously seen commits to avoid re-reading headers
        let mut commit_cache: std::collections::HashMap<String, (String, i64, String)> = std::collections::HashMap::new();

        for raw in text.lines() {
            // Hunk header: 40-char hex hash followed by space and numbers
            if raw.len() > 40 && raw.chars().take(40).all(|c| c.is_ascii_hexdigit()) {
                let parts: Vec<&str> = raw.splitn(4, ' ').collect();
                current_hash = parts[0].to_string();
                current_line = parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0);

                // If we've seen this commit before, restore cached data
                if let Some(cached) = commit_cache.get(&current_hash) {
                    current_author = cached.0.clone();
                    current_time = cached.1;
                    current_summary = cached.2.clone();
                }
            } else if let Some(val) = raw.strip_prefix("author ") {
                current_author = val.to_string();
            } else if let Some(val) = raw.strip_prefix("author-time ") {
                current_time = val.parse().unwrap_or(0);
            } else if let Some(val) = raw.strip_prefix("summary ") {
                current_summary = val.to_string();
            } else if raw.starts_with('\t') {
                // Content line — emit entry
                let is_committed = !current_hash.starts_with("0000000");
                commit_cache.entry(current_hash.clone()).or_insert_with(|| {
                    (current_author.clone(), current_time, current_summary.clone())
                });
                let short = if current_hash.len() >= 8 { current_hash[..8].to_string() } else { current_hash.clone() };
                entries.push(BlameEntry {
                    line: current_line,
                    commit: current_hash.clone(),
                    short_commit: short,
                    author: current_author.clone(),
                    time: current_time,
                    summary: current_summary.clone(),
                    is_committed,
                });
            }
        }

        Ok(entries)
    })
    .await
    .map_err(|e| e.to_string())?
}

// ============================================
// TODO Scanner
// ============================================

#[derive(Debug, Serialize, Clone)]
pub struct TodoItem {
    pub file_path: String,
    pub relative_path: String,
    pub line: u32,
    pub kind: String, // TODO, FIXME, HACK, XXX
    pub text: String,
}

#[tauri::command]
async fn scan_todos(workspace_path: String) -> Result<Vec<TodoItem>, String> {
    tokio::task::spawn_blocking(move || {
        let re = regex::Regex::new(r"(?i)(TODO|FIXME|HACK|XXX)\s*:?\s*(.*)")
            .map_err(|e| e.to_string())?;

        let mut items: Vec<TodoItem> = Vec::new();
        let ws = PathBuf::from(&workspace_path);

        fn scan_dir(
            dir: &Path,
            ws_root: &Path,
            re: &regex::Regex,
            items: &mut Vec<TodoItem>,
        ) {
            let entries = match fs::read_dir(dir) {
                Ok(e) => e,
                Err(_) => return,
            };
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with('.') || should_skip(&name) {
                    continue;
                }
                if path.is_dir() {
                    scan_dir(&path, ws_root, re, items);
                } else if path.is_file() {
                    if is_binary_ext(&path) {
                        continue;
                    }
                    let metadata = match fs::metadata(&path) {
                        Ok(m) => m,
                        Err(_) => continue,
                    };
                    if metadata.len() > 500 * 1024 {
                        continue;
                    }
                    let content = match fs::read_to_string(&path) {
                        Ok(c) => c,
                        Err(_) => continue,
                    };
                    let relative = path
                        .strip_prefix(ws_root)
                        .unwrap_or(&path)
                        .to_string_lossy()
                        .to_string();
                    for (idx, line) in content.lines().enumerate() {
                        if let Some(cap) = re.captures(line) {
                            let kind = cap.get(1).map(|m| m.as_str().to_uppercase()).unwrap_or_default();
                            let text = cap.get(2).map(|m| m.as_str().trim().to_string()).unwrap_or_default();
                            items.push(TodoItem {
                                file_path: path.to_string_lossy().to_string(),
                                relative_path: relative.clone(),
                                line: (idx + 1) as u32,
                                kind,
                                text,
                            });
                        }
                    }
                }
            }
        }

        scan_dir(&ws, &ws, &re, &mut items);
        Ok(items)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Generic git command for commit, push, etc.
#[tauri::command]
fn git_command(repo_path: String, args: Vec<String>) -> Result<String, String> {
    let str_args: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    git_cmd(&repo_path, &str_args)
}

// ============================================
// Git Stash
// ============================================

#[derive(Debug, Serialize, Clone)]
pub struct StashEntry {
    pub index: u32,
    pub message: String,
    pub date: String,
}

#[tauri::command]
fn git_stash_save(repo_path: String, message: String, include_untracked: bool) -> Result<String, String> {
    let mut args = vec!["stash", "push", "-m", &message];
    if include_untracked {
        args.push("-u");
    }
    git_cmd(&repo_path, &args)
}

#[tauri::command]
fn git_stash_list(repo_path: String) -> Result<Vec<StashEntry>, String> {
    let output = git_cmd(
        &repo_path,
        &["stash", "list", "--pretty=format:%gd|%s|%ar"],
    )?;

    let entries = output
        .lines()
        .filter(|l| !l.is_empty())
        .enumerate()
        .map(|(i, line)| {
            let parts: Vec<&str> = line.splitn(3, '|').collect();
            let index_str = parts.first().unwrap_or(&"stash@{0}");
            // Extract numeric index from "stash@{N}"
            let index = index_str
                .trim_start_matches("stash@{")
                .trim_end_matches('}')
                .parse::<u32>()
                .unwrap_or(i as u32);
            StashEntry {
                index,
                message: parts.get(1).unwrap_or(&"").to_string(),
                date: parts.get(2).unwrap_or(&"").to_string(),
            }
        })
        .collect();

    Ok(entries)
}

#[tauri::command]
fn git_stash_apply(repo_path: String, index: u32) -> Result<String, String> {
    let stash_ref = format!("stash@{{{}}}", index);
    git_cmd(&repo_path, &["stash", "apply", &stash_ref])
}

#[tauri::command]
fn git_stash_pop(repo_path: String, index: u32) -> Result<String, String> {
    let stash_ref = format!("stash@{{{}}}", index);
    git_cmd(&repo_path, &["stash", "pop", &stash_ref])
}

#[tauri::command]
fn git_stash_drop(repo_path: String, index: u32) -> Result<String, String> {
    let stash_ref = format!("stash@{{{}}}", index);
    git_cmd(&repo_path, &["stash", "drop", &stash_ref])
}

#[tauri::command]
async fn git_fetch(repo_path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        git_cmd(&repo_path, &["fetch", "--all"])
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_pull(repo_path: String, strategy: Option<String>) -> Result<String, String> {
    let strat = strategy.unwrap_or_else(|| "ff-only".to_string());
    let args: Vec<&str> = match strat.as_str() {
        "merge" => vec!["pull"],
        "rebase" => vec!["pull", "--rebase"],
        _ => vec!["pull", "--ff-only"],
    };
    tokio::task::spawn_blocking(move || {
        git_cmd(&repo_path, &args)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn git_branches(repo_path: String) -> Result<Vec<String>, String> {
    let output = git_cmd(&repo_path, &["branch", "--format=%(refname:short)"])?;
    Ok(output
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect())
}

#[tauri::command]
fn git_checkout(repo_path: String, branch: String) -> Result<String, String> {
    git_cmd(&repo_path, &["checkout", &branch])
}

// ============================================
// File System Operations (context menu)
// ============================================

#[tauri::command]
fn create_file(path: String) -> Result<(), String> {
    let file_path = PathBuf::from(&path);
    if file_path.exists() {
        return Err(format!("File already exists: {}", path));
    }
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directories: {}", e))?;
    }
    fs::File::create(&file_path).map_err(|e| format!("Failed to create file: {}", e))?;
    Ok(())
}

#[tauri::command]
fn create_directory(path: String) -> Result<(), String> {
    let dir_path = PathBuf::from(&path);
    if dir_path.exists() {
        return Err(format!("Directory already exists: {}", path));
    }
    fs::create_dir_all(&dir_path).map_err(|e| format!("Failed to create directory: {}", e))
}

#[tauri::command]
fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
    let src = PathBuf::from(&old_path);
    let dst = PathBuf::from(&new_path);
    if !src.exists() {
        return Err(format!("Source does not exist: {}", old_path));
    }
    if dst.exists() {
        return Err(format!("Destination already exists: {}", new_path));
    }
    fs::rename(&src, &dst).map_err(|e| format!("Failed to rename: {}", e))
}

#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if !target.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    if target.is_dir() {
        fs::remove_dir_all(&target).map_err(|e| format!("Failed to delete directory: {}", e))
    } else {
        fs::remove_file(&target).map_err(|e| format!("Failed to delete file: {}", e))
    }
}

// ============================================
// Local History
// ============================================

fn vaire_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    PathBuf::from(home).join(".vaire")
}

fn history_dir_for(file_path: &str) -> PathBuf {
    // Use a simple hash of the path as the directory name
    let hash = format!("{:x}", {
        let mut h: u64 = 14695981039346656037;
        for byte in file_path.bytes() {
            h ^= byte as u64;
            h = h.wrapping_mul(1099511628211);
        }
        h
    });
    vaire_dir().join("history").join(hash)
}

#[derive(Debug, Serialize, Clone)]
pub struct HistoryEntry {
    pub timestamp: i64,
    pub size: u64,
}

#[tauri::command]
fn save_local_history(file_path: String, content: String) -> Result<(), String> {
    let dir = history_dir_for(&file_path);
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create history dir: {}", e))?;

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as i64;

    let snapshot_path = dir.join(format!("{}.txt", ts));
    fs::write(&snapshot_path, &content)
        .map_err(|e| format!("Failed to write history snapshot: {}", e))?;

    // Also store the original path as metadata
    let meta_path = dir.join("path.txt");
    if !meta_path.exists() {
        fs::write(&meta_path, &file_path).ok();
    }

    // Keep only the latest 50 snapshots
    let mut entries: Vec<PathBuf> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.extension().and_then(|e| e.to_str()) == Some("txt")
                && p.file_stem().and_then(|s| s.to_str()).map(|s| s.parse::<i64>().is_ok()).unwrap_or(false)
        })
        .collect();

    if entries.len() > 50 {
        entries.sort();
        let to_delete = entries.len() - 50;
        for path in entries.iter().take(to_delete) {
            fs::remove_file(path).ok();
        }
    }

    Ok(())
}

#[tauri::command]
fn get_local_history(file_path: String) -> Result<Vec<HistoryEntry>, String> {
    let dir = history_dir_for(&file_path);
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut entries: Vec<HistoryEntry> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let path = e.path();
            let ext = path.extension().and_then(|x| x.to_str())?;
            if ext != "txt" { return None; }
            let stem = path.file_stem().and_then(|s| s.to_str())?;
            let ts: i64 = stem.parse().ok()?;
            let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            Some(HistoryEntry { timestamp: ts, size })
        })
        .collect();

    // Most recent first
    entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(entries)
}

#[tauri::command]
fn get_local_history_content(file_path: String, timestamp: i64) -> Result<String, String> {
    let dir = history_dir_for(&file_path);
    let snapshot_path = dir.join(format!("{}.txt", timestamp));
    if !snapshot_path.exists() {
        return Err(format!("Snapshot not found: {}", timestamp));
    }
    fs::read_to_string(&snapshot_path).map_err(|e| format!("Failed to read snapshot: {}", e))
}

// ============================================
// Scratch Files
// ============================================

fn scratches_dir() -> PathBuf {
    vaire_dir().join("scratches")
}

#[derive(Debug, Serialize, Clone)]
pub struct ScratchInfo {
    pub path: String,
    pub name: String,
    pub language: String,
    pub created_at: i64,
}

#[tauri::command]
fn create_scratch(language: String) -> Result<String, String> {
    let dir = scratches_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create scratches dir: {}", e))?;

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as i64;

    let ext = match language.as_str() {
        "typescript" => "ts",
        "javascript" => "js",
        "python" => "py",
        "rust" => "rs",
        "go" => "go",
        "java" => "java",
        "kotlin" => "kt",
        "html" => "html",
        "css" => "css",
        "json" => "json",
        "yaml" | "yml" => "yaml",
        "sql" => "sql",
        "shell" | "bash" => "sh",
        "markdown" => "md",
        "ruby" => "rb",
        "cpp" => "cpp",
        "c" => "c",
        "csharp" => "cs",
        _ => "txt",
    };

    let name = format!("scratch-{}.{}", ts, ext);
    let path = dir.join(&name);
    fs::write(&path, "").map_err(|e| format!("Failed to create scratch file: {}", e))?;

    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn list_scratches() -> Result<Vec<ScratchInfo>, String> {
    let dir = scratches_dir();
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut scratches: Vec<ScratchInfo> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let path = e.path();
            if !path.is_file() { return None; }
            let name = path.file_name()?.to_str()?.to_string();
            if !name.starts_with("scratch-") { return None; }

            // Parse timestamp from filename
            let stem = path.file_stem()?.to_str()?;
            let parts: Vec<&str> = stem.splitn(2, '-').collect();
            let ts: i64 = if parts.len() >= 2 {
                parts[1].parse().unwrap_or(0)
            } else {
                0
            };

            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("txt");
            let language = match ext {
                "ts" => "typescript",
                "js" => "javascript",
                "py" => "python",
                "rs" => "rust",
                "go" => "go",
                "java" => "java",
                "kt" => "kotlin",
                "html" => "html",
                "css" => "css",
                "json" => "json",
                "yaml" | "yml" => "yaml",
                "sql" => "sql",
                "sh" => "shell",
                "md" => "markdown",
                "rb" => "ruby",
                "cpp" => "cpp",
                "c" => "c",
                "cs" => "csharp",
                _ => "plaintext",
            };

            Some(ScratchInfo {
                path: path.to_string_lossy().to_string(),
                name,
                language: language.to_string(),
                created_at: ts,
            })
        })
        .collect();

    scratches.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(scratches)
}

// ============================================
// Workspace Settings
// ============================================

#[tauri::command]
fn load_workspace_settings(workspace_path: String) -> Result<String, String> {
    let settings_path = PathBuf::from(&workspace_path).join(".vaire").join("settings.json");
    if !settings_path.exists() {
        return Ok("{}".to_string());
    }
    fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read workspace settings: {}", e))
}

#[tauri::command]
fn save_workspace_settings(workspace_path: String, settings: String) -> Result<(), String> {
    let vaire_dir = PathBuf::from(&workspace_path).join(".vaire");
    fs::create_dir_all(&vaire_dir)
        .map_err(|e| format!("Failed to create .vaire directory: {}", e))?;
    let settings_path = vaire_dir.join("settings.json");
    fs::write(&settings_path, &settings)
        .map_err(|e| format!("Failed to write workspace settings: {}", e))
}

// ============================================
// Debug (simplified: spawn with output capture)
// ============================================

struct DebugState {
    processes: Mutex<HashMap<u32, Child>>,
}

#[derive(Debug, Serialize, Clone)]
pub struct DebugBreakpoint {
    pub file_path: String,
    pub line: u32,
    pub enabled: bool,
}

#[tauri::command]
async fn debug_start(
    cwd: String,
    command: String,
    args: Vec<String>,
    app: tauri::AppHandle,
    state: tauri::State<'_, DebugState>,
) -> Result<u32, String> {
    let mut parts = command.split_whitespace();
    let program = parts.next().ok_or("Empty command")?;
    let mut cmd_args: Vec<String> = parts.map(|s| s.to_string()).collect();
    cmd_args.extend(args);

    let mut child = Command::new(program)
        .args(&cmd_args)
        .current_dir(&cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn debug target: {}", e))?;

    let pid = child.id();

    // Read stdout and emit events
    if let Some(stdout) = child.stdout.take() {
        let app_clone = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                match line {
                    Ok(l) => {
                        let _ = app_clone.emit("debug-output", format!("{}\n", l));
                    }
                    Err(_) => break,
                }
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        let app_clone = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                match line {
                    Ok(l) => {
                        let _ = app_clone.emit("debug-output", format!("\x1b[31m{}\x1b[0m\n", l));
                    }
                    Err(_) => break,
                }
            }
        });
    }

    // Insert child into state
    {
        let mut procs = state.processes.lock().unwrap();
        procs.insert(pid, child);
    }

    // Spawn a thread that polls until the process exits, then emits debug-stopped
    let app_wait = app.clone();
    let pid_for_wait = pid;
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_millis(300));
            // Check if process is still running by attempting `kill -0 <pid>`
            let still_running = Command::new("kill")
                .args(["-0", &pid_for_wait.to_string()])
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false);
            if !still_running {
                let _ = app_wait.emit("debug-stopped", pid_for_wait);
                break;
            }
        }
    });

    Ok(pid)
}

#[tauri::command]
fn debug_stop(pid: u32, state: tauri::State<'_, DebugState>) -> Result<(), String> {
    let mut procs = state.processes.lock().unwrap();
    if let Some(mut child) = procs.remove(&pid) {
        child.kill().map_err(|e| format!("Failed to kill debug process: {}", e))?;
        let _ = child.wait();
    }
    Ok(())
}

// ============================================
// Multi-Window Support
// ============================================

#[tauri::command]
fn open_new_window(app: tauri::AppHandle, workspace_path: String) -> Result<(), String> {
    let label = format!(
        "project-{}",
        workspace_path
            .replace('/', "-")
            .replace('.', "")
            .trim_start_matches('-')
            .to_string()
    );
    let project_name = workspace_path.split('/').last().unwrap_or(&workspace_path);
    tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App("/".into()))
        .title(&format!("Vaire \u{2014} {}", project_name))
        .inner_size(1280.0, 820.0)
        .min_inner_size(900.0, 600.0)
        .decorations(true)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================
// App Init
// ============================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(TerminalState {
            writers: Mutex::new(HashMap::new()),
            next_id: Mutex::new(0),
        })
        .manage(DebugState {
            processes: Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            read_directory,
            read_file_content,
            write_file_content,
            search_in_files,
            get_git_repos,
            get_git_status,
            get_git_log,
            get_git_diff,
            git_command,
            git_fetch,
            git_pull,
            git_branches,
            git_checkout,
            git_blame,
            scan_todos,
            terminal_spawn,
            terminal_write,
            terminal_resize,
            create_file,
            create_directory,
            rename_path,
            delete_path,
            save_local_history,
            get_local_history,
            get_local_history_content,
            create_scratch,
            list_scratches,
            git_stash_save,
            git_stash_list,
            git_stash_apply,
            git_stash_pop,
            git_stash_drop,
            load_workspace_settings,
            save_workspace_settings,
            debug_start,
            debug_stop,
            open_new_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
