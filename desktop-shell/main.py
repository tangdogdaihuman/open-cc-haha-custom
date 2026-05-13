"""
Claude Desktop — pywebview 桌面壳 + cc-haha 完整后端
"""
import http.server
import json
import os
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

PORT = 18923
CC_HAHA_DIR = Path(r"C:\Users\admin\cc-haha-custom")
BUN_EXE = Path.home() / ".bun" / "bin" / "bun.exe"
DIST_DIR = CC_HAHA_DIR / "desktop" / "dist"

API_PORT = PORT
FRONTEND_PORT = 18924
TERMINAL_PORT = 18925
NOTIFICATION_CONFIG_PATH = Path.home() / ".claude" / "cc-haha" / "desktop-config.json"


def _read_notification_state():
    """读取通知权限状态。WinRT 检测 + 配置文件兜底。"""
    try:
        from winrt.windows.ui.notifications import ToastNotifier
        notifier = ToastNotifier()
        # WinRT setting 枚举: Enabled=0, DisabledForApplication=1, DisabledForUser=2, DisabledByGroupPolicy=3, DisabledByManifest=4
        if notifier.setting.value_ == 1:  # DisabledForApplication
            return "denied"
        if notifier.setting.value_ in (2, 3, 4):  # 用户/策略/清单禁用
            return "denied"
        return "granted"
    except Exception:
        # WinRT 不可用时回退到配置文件
        try:
            if NOTIFICATION_CONFIG_PATH.exists():
                cfg = json.loads(NOTIFICATION_CONFIG_PATH.read_text(encoding="utf-8"))
                return cfg.get("notificationPermission", "granted")
        except Exception:
            pass
        return "granted"


def _write_notification_state(state):
    """持久化通知权限状态。"""
    try:
        NOTIFICATION_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        cfg = {}
        if NOTIFICATION_CONFIG_PATH.exists():
            try:
                cfg = json.loads(NOTIFICATION_CONFIG_PATH.read_text(encoding="utf-8"))
            except Exception:
                pass
        cfg["notificationPermission"] = state
        NOTIFICATION_CONFIG_PATH.write_text(
            json.dumps(cfg, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except Exception:
        pass


def _send_windows_toast(title, body):
    """通过 WinRT 发送 Windows Toast 通知。"""
    import uuid
    try:
        from winrt.windows.ui.notifications import ToastNotificationManager, ToastNotification
        from winrt.windows.data.xml.dom import XmlDocument
        template = (
            '<toast launch="claude-desktop">'
            '<visual><binding template="ToastText02">'
            f'<text id="1">{title}</text>'
            f'<text id="2">{body}</text>'
            '</binding></visual>'
            '</toast>'
        )
        doc = XmlDocument()
        doc.load_xml(template)
        toast = ToastNotification(doc)
        toast.id = str(uuid.uuid4())
        # 使用 pythonw.exe 的 AUMID（通用 Python 应用的 notification identity）
        notifier = ToastNotificationManager.create_toast_notifier("Claude.Desktop")
        notifier.show(toast)
        return True
    except Exception:
        return False


def start_cc_haha_server():
    env = os.environ.copy()
    env["CALLER_DIR"] = str(Path.home())
    proc = subprocess.Popen(
        [str(BUN_EXE), "run", "./src/server/index.ts",
         "--port", str(API_PORT), "--host", "127.0.0.1"],
        cwd=str(CC_HAHA_DIR),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
    )
    return proc


class FrontendHandler(http.server.SimpleHTTPRequestHandler):
    """服务前端静态文件，注入 server URL，API 请求代理到 cc-haha"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST_DIR), **kwargs)

    def _path(self):
        """返回不带 query string 的路径"""
        from urllib.parse import urlparse
        return urlparse(self.path).path

    def do_GET(self):
        p = self._path()
        if p.startswith("/mock/"):
            self._serve_mock_module(p)
        elif p == "/api/skills":
            self._serve_all_skills()
        elif p == "/api/vision-config":
            self._serve_vision_config()
        elif p == "/api/cc-connect-config":
            self._serve_cc_connect_config()
        elif p == "/api/notification/permission":
            self._serve_notification_permission()
        elif p == "/api/dialog/open-folder":
            self._open_folder_dialog()
        elif p.startswith("/api/filesystem/"):
            self._serve_filesystem()
        elif self._is_api_path():
            self._proxy()
        elif p == "/" or p == "":
            self._serve_index()
        else:
            super().do_GET()

    def do_POST(self):
        p = self._path()
        if p == "/api/vision-config":
            self._save_vision_config()
        elif p == "/api/notification/open-settings":
            self._open_notification_settings()
        elif p == "/api/notification/request":
            self._request_notification_permission()
        elif p == "/api/notification/send":
            self._send_notification()
        elif p == "/api/cc-connect-config":
            self._save_cc_connect_config()
        elif p == "/api/cc-connect-restart":
            self._restart_cc_connect()
        elif self._is_api_path():
            self._proxy()
        else:
            self.send_error(404)

    def do_PUT(self):
        if self._is_api_path():
            self._proxy()
        else:
            self.send_error(404)

    def do_DELETE(self):
        if self._is_api_path():
            self._proxy()
        else:
            self.send_error(404)

    def _serve_index(self):
        index_path = DIST_DIR / "index.html"
        html = index_path.read_text(encoding="utf-8")

        css = (
            "<style>"
            '[data-theme="dark"]{'
            "--color-surface:#1e1e20!important;"
            "--color-surface-container:#252528!important;"
            "--color-surface-container-low:#222225!important;"
            "--color-surface-container-lowest:#1c1c1f!important;"
            "--color-surface-container-high:#2a2a2e!important;"
            "--color-surface-container-highest:#303035!important;"
            "--color-surface-dim:#18181a!important;"
            "--color-surface-bright:#35353a!important;"
            "--color-surface-variant:#28282c!important;"
            "--color-surface-sidebar:rgba(36,36,40,0.95)!important;"
            "--color-surface-glass:rgba(42,42,48,0.85)!important;"
            "--color-background:#1a1a1d!important;"
            "--color-on-surface:#e4e4e6!important;"
            "--color-on-surface-variant:#b0b0b5!important;"
            "--color-outline:#3e3e44!important;"
            "--color-outline-variant:#333338!important;"
            "--color-border:#2e2e33!important;"
            "}"
            "</style>"
        )

        importmap = (
            '<script type="importmap">'
            '{'
            '"imports":{'
            '"@tauri-apps/api/core":"/mock/tauri-api-core.js",'
            '"@tauri-apps/plugin-notification":"/mock/tauri-plugin-notification.js",'
            '"@tauri-apps/plugin-shell":"/mock/tauri-plugin-shell.js",'
            '"@tauri-apps/api/window":"/mock/tauri-api-window.js",'
            '"@tauri-apps/api/event":"/mock/tauri-api-event.js"'
            '}'
            '}'
            '</script>'
        )
        js = (
            "<script>"
            "(function(){"
            "window.__PYWEBVIEW__=true;"
            "var S='http://127.0.0.1:" + str(API_PORT) + "';"
            "var TW='ws://127.0.0.1:" + str(TERMINAL_PORT) + "';"
            # 注入 skills override：前端 get('/api/skills') 交给代理处理
            "var __SKILLS_URL__='http://127.0.0.1:" + str(FRONTEND_PORT) + "/api/skills';"
            "try{localStorage.setItem('cc-haha-h5-server-url',S)}catch(e){}"
            "var termWs=null,termListeners={};"
            "function termConnect(){"
            "if(termWs&&termWs.readyState===WebSocket.OPEN)return;"
            "termWs=new WebSocket(TW+'/terminal');"
            "termWs.onmessage=function(e){"
            "try{var m=JSON.parse(e.data);"
            "if(m.type==='output'&&termListeners.output)termListeners.output({payload:{session_id:m.session_id,data:m.data}});"
            "if(m.type==='exit'&&termListeners.exit)termListeners.exit({payload:{session_id:m.session_id,code:m.code}});"
            "if(m.type==='spawn'&&termListeners.spawnResolve){"
            "termListeners.spawnResolve({session_id:m.session_id,shell:m.shell||'powershell',cwd:m.cwd||''});"
            "delete termListeners.spawnResolve;"
            "}"
            "}catch(e){}"
            "};"
            "termWs.onclose=function(){termWs=null;};"
            "}"
            "window.__TAURI_INTERNALS__={"
            "invoke:function(cmd,args){"
            "if(cmd==='get_server_url')return Promise.resolve(S);"
            "if(cmd==='plugin:notification|is_permission_granted'){return fetch('/api/notification/permission').then(function(r){return r.json()}).then(function(d){return d.granted});}"
            "if(cmd==='plugin:notification|request_permission'){return fetch('/api/notification/request',{method:'POST'}).then(function(r){return r.json()}).then(function(d){return d.permission});}"
            "if(cmd==='plugin:notification|send'){return fetch('/api/notification/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args||{})}).then(function(r){return r.json()}).then(function(d){return d.ok});}"
            "if(cmd==='open_windows_notification_settings'){return fetch('/api/notification/open-settings',{method:'POST'}).then(function(r){return r.json()}).then(function(d){return d.ok});}"
            "if(cmd==='macos_notification_permission_state')return Promise.resolve(null);"
            "if(cmd==='macos_request_notification_permission')return Promise.resolve(null);"
            "if(cmd==='macos_send_notification')return Promise.resolve(false);"
            "if(cmd==='terminal_spawn'){"
            "return new Promise(function(resolve){"
            "termConnect();"
            "termListeners.spawnResolve=resolve;"
            "var spawnMsg=JSON.stringify({command:'spawn',cols:args.cols||80,rows:args.rows||24,cwd:args.cwd});"
            "if(termWs.readyState===WebSocket.OPEN)termWs.send(spawnMsg);"
            "else termWs.onopen=function(){termWs.send(spawnMsg)};"
            "});"
            "}"
            "if(cmd==='terminal_write'){termConnect();if(termWs&&termWs.readyState===WebSocket.OPEN)termWs.send(JSON.stringify({command:'write',data:args.data,sessionId:args.sessionId}));return Promise.resolve()}"
            "if(cmd==='terminal_resize'){termConnect();if(termWs&&termWs.readyState===WebSocket.OPEN)termWs.send(JSON.stringify({command:'resize',cols:args.cols,rows:args.rows,sessionId:args.sessionId}));return Promise.resolve()}"
            "if(cmd==='terminal_kill'){termConnect();if(termWs&&termWs.readyState===WebSocket.OPEN)termWs.send(JSON.stringify({command:'kill',sessionId:args.sessionId}));return Promise.resolve()}"
            "return Promise.resolve(null);"
            "},"
            "event:{"
            "listen:function(evt,handler){"
            "var key=evt==='terminal-output'?'output':evt==='terminal-exit'?'exit':evt;"
            "termListeners[key]=handler;"
            "return Promise.resolve(function(){delete termListeners[key]});"
            "},"
            "once:function(evt,handler){"
            "var key=evt==='terminal-output'?'output':evt==='terminal-exit'?'exit':evt;"
            "var wrapped=function(e){handler(e);delete termListeners[key]};"
            "termListeners[key]=wrapped;"
            "return Promise.resolve(function(){});"
            "}"
            "},"
            "convertFileSrc:function(p){return p}"
            "};"
            "window.__TAURI__={};"
            "})();"
            "</script>"
        )

        inject = importmap + css + js
        html = html.replace("</head>", inject + "\n</head>")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(html.encode("utf-8"))

    def _serve_mock_module(self, path):
        """Serve mock Tauri modules for the webview, bridging to __TAURI_INTERNALS__."""
        mocks = {
            "/mock/tauri-api-core.js": (
                "var i=window.__TAURI_INTERNALS__;"
                "export function invoke(cmd,args){return i.invoke(cmd,args||{});}"
                "export function convertFileSrc(p){return p;}"
                "export function transformCallback(cb,once){return cb;}"
            ),
            "/mock/tauri-plugin-notification.js": (
                "var i=window.__TAURI_INTERNALS__;"
                "export function isPermissionGranted(){return i.invoke('plugin:notification|is_permission_granted');}"
                "export function requestPermission(){return i.invoke('plugin:notification|request_permission');}"
                "export function sendNotification(opts){return i.invoke('plugin:notification|send',opts||{});}"
            ),
            "/mock/tauri-plugin-shell.js": (
                "var i=window.__TAURI_INTERNALS__;"
                "export function open(url){"
                "if(url&&url.startsWith('ms-settings:'))return i.invoke('open_windows_notification_settings');"
                "try{window.open(url,'_blank','noopener,noreferrer');return true;}catch(e){return false;}"
                "}"
            ),
            "/mock/tauri-api-window.js": (
                "export var UserAttentionType={Critical:1,Informational:2};"
                "export function getCurrentWindow(){"
                "return{"
                "requestUserAttention:function(){return Promise.resolve(true)},"
                "show:function(){return Promise.resolve()},"
                "setFocus:function(){return Promise.resolve()},"
                "};}"
            ),
            "/mock/tauri-api-event.js": (
                "export function listen(evt,handler){"
                "if(evt==='desktop-notification-clicked')return window.__TAURI_INTERNALS__.event.listen(evt,handler);"
                "return Promise.resolve(function(){});"
                "}"
            ),
        }
        content = mocks.get(path)
        if content:
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript; charset=utf-8")
            self.end_headers()
            self.wfile.write(content.encode("utf-8"))
        else:
            self.send_error(404)

    def _serve_all_skills(self):
        """从文件系统读取所有 skill，绕过 cc-haha 的过滤，并合并 Bun 返回的其他来源 skill"""
        import re
        skills = []
        seen = set()

        # 1. 先从 Bun 服务器获取 skills（project/plugin/mcp/bundled 来源）
        try:
            from urllib.parse import urlparse
            query = urlparse(self.path).query
            bun_url = f"http://127.0.0.1:{API_PORT}/api/skills"
            if query:
                bun_url += f"?{query}"
            req = urllib.request.Request(bun_url)
            resp = urllib.request.urlopen(req, timeout=10)
            data = json.loads(resp.read())
            for s in data.get("skills", []):
                key = f"{s.get('source', '')}:{s.get('name', '')}"
                if key not in seen:
                    seen.add(key)
                    skills.append(s)
        except Exception:
            pass

        # 2. 补充本地文件系统的 user skills
        skills_dir = Path.home() / ".claude" / "skills"
        if skills_dir.is_dir():
            for d in sorted(skills_dir.iterdir()):
                if not d.is_dir() or d.name.startswith("."):
                    continue
                key = f"user:{d.name}"
                if key in seen:
                    continue
                skill_md = d / "SKILL.md"
                if not skill_md.exists():
                    continue
                try:
                    raw = skill_md.read_text(encoding="utf-8")
                    fm_match = re.match(r'^---\s*\n(.*?)\n---', raw, re.DOTALL)
                    desc = ""
                    name = d.name
                    if fm_match:
                        fm = fm_match.group(1)
                        name_match = re.search(r'name\s*:\s*(.+)', fm)
                        if name_match:
                            name = name_match.group(1).strip()
                        desc_match = re.search(r'description\s*:\s*(.+)', fm)
                        if desc_match:
                            desc = desc_match.group(1).strip().replace('"', '\\"')
                    seen.add(key)
                    skills.append({
                        "name": d.name,
                        "displayName": name,
                        "description": desc or "No description",
                        "source": "user",
                        "userInvocable": True,
                        "contentLength": skill_md.stat().st_size,
                        "hasDirectory": True,
                    })
                except Exception:
                    pass
        body = json.dumps({"skills": skills}, ensure_ascii=False)
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))

    def _serve_vision_config(self):
        """返回 vision-config.json 内容"""
        config_path = Path.home() / ".claude" / "cc-haha" / "vision-config.json"
        if config_path.exists():
            try:
                body = config_path.read_text(encoding="utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(body.encode("utf-8"))
                return
            except Exception:
                pass
        self.send_error(404)

    def _save_vision_config(self):
        """保存 vision-config.json"""
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length > 0:
                data = self.rfile.read(length)
                config = json.loads(data.decode("utf-8"))
                config_dir = Path.home() / ".claude" / "cc-haha"
                config_dir.mkdir(parents=True, exist_ok=True)
                config_path = config_dir / "vision-config.json"
                config_path.write_text(
                    json.dumps(config, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": True}).encode("utf-8"))
                return
        except Exception as e:
            try:
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": False, "error": str(e)}).encode("utf-8"))
            except Exception:
                pass
            return
        self.send_error(400)

    def _serve_cc_connect_config(self):
        """读取 cc-connect 的 config.toml + config-qq.toml，合并返回 JSON"""
        try:
            import tomllib
        except ImportError:
            self.send_error(500, "tomllib not available (need Python 3.11+)")
            return
        cc_dir = Path.home() / ".cc-connect"
        result = {}
        for name in ("config.toml", "config-qq.toml"):
            p = cc_dir / name
            if p.exists():
                try:
                    result[name] = tomllib.loads(p.read_text(encoding="utf-8"))
                except Exception:
                    result[name] = {}
            else:
                result[name] = {}
        try:
            body = json.dumps(result, ensure_ascii=False)
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(body.encode("utf-8"))
        except Exception:
            pass

    def _save_cc_connect_config(self):
        """保存 cc-connect config.toml（只写主配置，QQ 配置暂不写入）"""
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length > 0:
                data = self.rfile.read(length)
                config = json.loads(data.decode("utf-8"))
                # 安全检查：拒绝空配置覆盖已有文件
                providers = config.get("providers", [])
                projects = config.get("projects", [])
                if not providers and not projects:
                    config_path = Path.home() / ".cc-connect" / "config.toml"
                    if config_path.exists():
                        self.send_response(400)
                        self.send_header("Content-Type", "application/json; charset=utf-8")
                        self.end_headers()
                        self.wfile.write(json.dumps({"ok": False, "error": "配置为空，拒绝覆盖已有文件。请刷新页面重新加载配置。"}, ensure_ascii=False).encode("utf-8"))
                        return
                toml_str = _build_cc_connect_toml(config)
                config_path = Path.home() / ".cc-connect" / "config.toml"
                config_path.write_text(toml_str, encoding="utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": True}).encode("utf-8"))
                return
        except Exception as e:
            try:
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": False, "error": str(e)}).encode("utf-8"))
            except Exception:
                pass
            return
        self.send_error(400)

    def _restart_cc_connect(self):
        """重启 cc-connect 进程"""
        import shutil
        result = {"ok": False, "message": ""}
        try:
            # 杀掉旧的 node 进程
            subprocess.run(
                ["taskkill", "/f", "/im", "node.exe"],
                capture_output=True,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
            )
            # 等进程完全退出
            import time as _time
            _time.sleep(0.5)
            # 直接调 node 运行 cc-connect/run.js，跳过 .cmd 壳避免弹窗
            npm_dir = str(Path.home() / "AppData" / "Roaming" / "npm")
            node_exe = shutil.which("node") or "node"
            run_js = Path(npm_dir) / "node_modules" / "cc-connect" / "run.js"
            subprocess.Popen(
                [str(node_exe), str(run_js)],
                cwd=str(Path.home() / ".cc-connect"),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
            )
            result["ok"] = True
            result["message"] = "cc-connect 已重启"
        except Exception as e:
            result["message"] = str(e)
        body = json.dumps(result, ensure_ascii=False)
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))

    def _serve_notification_permission(self):
        """返回通知权限状态"""
        state = _read_notification_state()
        body = json.dumps({"granted": state == "granted", "permission": state})
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))

    def _open_notification_settings(self):
        """打开 Windows 系统通知设置"""
        ok = False
        try:
            os.startfile("ms-settings:notifications")
            ok = True
        except Exception:
            pass
        body = json.dumps({"ok": ok})
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))

    def _request_notification_permission(self):
        """请求通知权限。WinRT 检测状态或默认授权。"""
        state = _read_notification_state()
        if state != "denied":
            state = "granted"
            _write_notification_state(state)
        body = json.dumps({"permission": state})
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))

    def _send_notification(self):
        """发送测试通知"""
        try:
            length = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(length)) if length > 0 else {}
        except Exception:
            data = {}
        title = data.get("title", "Claude Desktop")
        body_text = data.get("body", "")
        ok = _send_windows_toast(title, body_text)
        body = json.dumps({"ok": ok})
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))

    def _open_folder_dialog(self):
        """打开 Windows 原生文件夹选择器"""
        import tkinter.filedialog
        import tkinter
        try:
            root = tkinter.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            folder = tkinter.filedialog.askdirectory(title="选择文件夹")
            root.destroy()
            body = json.dumps({"path": folder or ""}, ensure_ascii=False)
        except Exception:
            body = json.dumps({"path": "", "error": "无法打开文件夹选择器"}, ensure_ascii=False)
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))

    def _serve_filesystem(self):
        """不限路径的目录浏览，替代 cc-haha 受限版本"""
        from urllib.parse import urlparse, parse_qs
        import os as _os
        try:
            parsed = urlparse(self.path)
            params = parse_qs(parsed.query)
            req_path = params.get("path", [None])[0] or str(Path.home())
            resolved = _os.path.abspath(req_path)
            if not _os.path.isdir(resolved):
                self.send_error(404, "Not a directory")
                return
            entries = []
            try:
                for name in sorted(_os.listdir(resolved)):
                    if name.startswith("."):
                        continue
                    full = _os.path.join(resolved, name)
                    entries.append({
                        "name": name,
                        "path": full.replace("\\", "/"),
                        "isDirectory": _os.path.isdir(full),
                    })
            except PermissionError:
                pass
            parent = _os.path.dirname(resolved)
            body = json.dumps({
                "currentPath": resolved.replace("\\", "/"),
                "parentPath": (parent.replace("\\", "/") if parent != resolved else ""),
                "entries": entries,
            }, ensure_ascii=False)
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(body.encode("utf-8"))
        except Exception:
            self.send_error(500)

    def _is_api_path(self):
        return (
            self.path.startswith("/api/")
            or self.path == "/health"
            or self.path == "/api/status"
        )

    def _proxy(self):
        try:
            url = f"http://127.0.0.1:{API_PORT}{self.path}"
            data = None
            if self.command in ("POST", "PUT"):
                length = int(self.headers.get("Content-Length", 0))
                if length > 0:
                    data = self.rfile.read(length)

            req = urllib.request.Request(url, data=data, method=self.command)
            for key, val in self.headers.items():
                if key.lower() not in ("host", "connection"):
                    req.add_header(key, val)

            resp = urllib.request.urlopen(req, timeout=300)
            self.send_response(resp.status)

            # 转发响应头
            is_sse = resp.headers.get("Content-Type", "").startswith("text/event-stream")
            for key, val in resp.headers.items():
                if key.lower() not in ("transfer-encoding", "connection", "content-length"):
                    self.send_header(key, val)
            self.end_headers()

            if is_sse:
                while True:
                    chunk = resp.read(4096)
                    if not chunk:
                        break
                    try:
                        self.wfile.write(chunk)
                        self.wfile.flush()
                    except (BrokenPipeError, ConnectionResetError):
                        break
            else:
                self.wfile.write(resp.read())
        except Exception:
            try:
                self.send_error(502)
            except Exception:
                pass

    def log_message(self, format, *args):
        pass


def start_frontend_server():
    server = http.server.HTTPServer(("127.0.0.1", FRONTEND_PORT), FrontendHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def wait_for_api(timeout=10):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(
                f"http://127.0.0.1:{API_PORT}/health", timeout=1)
            return True
        except Exception:
            time.sleep(0.3)
    return False


def start_terminal_backend():
    """启动终端 WebSocket 后端"""
    proc = subprocess.Popen(
        [sys.executable, str(Path(__file__).parent / "terminal_backend.py")],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
    )
    time.sleep(0.5)
    return proc


def start_cc_connect():
    """启动 cc-connect IM 桥接进程"""
    import shutil
    npm_dir = str(Path.home() / "AppData" / "Roaming" / "npm")
    run_js = Path(npm_dir) / "node_modules" / "cc-connect" / "run.js"
    node_exe = shutil.which("node")
    if not node_exe:
        print("警告: 找不到 node.exe，跳过 cc-connect 启动")
        return None
    proc = subprocess.Popen(
        [node_exe, str(run_js)],
        cwd=str(Path.home() / ".cc-connect"),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
    )
    print("cc-connect 已启动")
    return proc


def _esc(v: str) -> str:
    """转义 TOML 字符串中的反斜杠"""
    return v.replace("\\", "\\\\")


def _build_cc_connect_toml(cfg: dict) -> str:
    """将前端 JSON 转回 config.toml"""
    lines = []
    lang = cfg.get("language", "zh")
    lines.append(f'language = "{_esc(lang)}"')
    lines.append("")

    log = cfg.get("log", {})
    lines.append("[log]")
    lines.append(f'level = "{_esc(log.get("level", "info"))}"')
    lines.append("")

    display = cfg.get("display", {})
    lines.append("[display]")
    tm = display.get("thinking_messages", False)
    lines.append(f"thinking_messages = {str(tm).lower()}")
    lines.append("")

    # providers
    for p in cfg.get("providers", []):
        lines.append("[[providers]]")
        lines.append(f'name = "{_esc(p.get("name", ""))}"')
        lines.append(f'api_key = "{_esc(p.get("api_key", ""))}"')
        lines.append(f'base_url = "{_esc(p.get("base_url", ""))}"')
        at = p.get("agent_types", ["claudecode"])
        if isinstance(at, list):
            lines.append(f"agent_types = {json.dumps(at)}")
        lines.append("")

    # projects
    for proj in cfg.get("projects", []):
        lines.append("[[projects]]")
        lines.append(f'name = "{_esc(proj.get("name", "my-project"))}"')
        lines.append("")

        agent = proj.get("agent", {})
        lines.append("[projects.agent]")
        lines.append(f'type = "{_esc(agent.get("type", "claudecode"))}"')
        lines.append("")

        opts = agent.get("options", {})
        lines.append("[projects.agent.options]")
        lines.append(f'work_dir = "{_esc(opts.get("work_dir", ""))}"')
        lines.append(f'mode = "{_esc(opts.get("mode", "default"))}"')
        pref = opts.get("provider_refs", [])
        if isinstance(pref, list):
            lines.append(f"provider_refs = {json.dumps(pref)}")
        lines.append("")

        # platforms
        for plat in proj.get("platforms", []):
            lines.append("[[projects.platforms]]")
            lines.append(f'type = "{_esc(plat.get("type", ""))}"')
            lines.append("")

            popts = plat.get("options", {})
            lines.append("[projects.platforms.options]")
            ptype = plat.get("type", "")
            if ptype == "feishu":
                lines.append(f'app_id = "{_esc(popts.get("app_id", ""))}"')
                lines.append(f'app_secret = "{_esc(popts.get("app_secret", ""))}"')
                af = popts.get("allow_from", "")
                if af:
                    lines.append(f'allow_from = "{_esc(af)}"')
                adm = popts.get("admin_from", "")
                if adm:
                    lines.append(f'admin_from = "{_esc(adm)}"')
            elif ptype == "weixin":
                lines.append(f'token = "{_esc(popts.get("token", ""))}"')
                lines.append(f'base_url = "{_esc(popts.get("base_url", "https://ilinkai.weixin.qq.com"))}"')
                lines.append(f'account_id = "{_esc(popts.get("account_id", ""))}"')
                af = popts.get("allow_from", "")
                if af:
                    lines.append(f'allow_from = "{_esc(af)}"')
            elif ptype == "telegram":
                lines.append(f'token = "{_esc(popts.get("token", ""))}"')
                af = popts.get("allow_from", "")
                if af:
                    lines.append(f'allow_from = "{_esc(af)}"')
            lines.append("")

    return "\n".join(lines) + "\n"


def _set_window_icon():
    """在后台线程中等待窗口创建，通过 Win32 API 设置窗口图标"""
    import ctypes
    import ctypes.wintypes

    icon_path = str(Path(__file__).parent / "app-icon.ico")
    # 等待窗口出现（最多等 5 秒）
    for _ in range(50):
        time.sleep(0.1)
        hwnd = ctypes.windll.user32.FindWindowW(None, "Claude Desktop")
        if hwnd:
            break
    else:
        return

    # IMAGE_ICON=1, LR_LOADFROMFILE=0x10
    flags = 0x10
    icon_big = ctypes.windll.user32.LoadImageW(0, icon_path, 1, 0, 0, flags)
    icon_small = ctypes.windll.user32.LoadImageW(0, icon_path, 1, 32, 32, flags)
    # WM_SETICON=0x80, ICON_BIG=1, ICON_SMALL=0
    if icon_big:
        ctypes.windll.user32.SendMessageW(hwnd, 0x80, 1, icon_big)
    if icon_small:
        ctypes.windll.user32.SendMessageW(hwnd, 0x80, 0, icon_small)


def main():
    if not DIST_DIR.exists():
        print("错误: 前端未构建")
        print(f"  cd {CC_HAHA_DIR / 'desktop'} && bun run build")
        sys.exit(1)

    print("Claude Desktop 启动中...")
    api_proc = start_cc_haha_server()

    if not wait_for_api(15):
        print("错误: 后端启动超时")
        api_proc.kill()
        sys.exit(1)
    print(f"后端就绪")

    start_frontend_server()
    term_proc = start_terminal_backend()
    cc_connect_proc = start_cc_connect()

    import webview

    webview.create_window(
        "Claude Desktop",
        f"http://127.0.0.1:{FRONTEND_PORT}",
        width=1280,
        height=860,
        min_size=(1060, 640),
        text_select=True,
    )

    # 启动后台线程，窗口出现后自动设置图标
    threading.Thread(target=_set_window_icon, daemon=True).start()

    webview.start(debug=False)

    api_proc.terminate()
    term_proc.terminate()
    if cc_connect_proc:
        cc_connect_proc.terminate()
    try:
        api_proc.wait(timeout=5)
        term_proc.wait(timeout=5)
        if cc_connect_proc:
            cc_connect_proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        api_proc.kill()
        term_proc.kill()
        if cc_connect_proc:
            cc_connect_proc.kill()


if __name__ == "__main__":
    main()
