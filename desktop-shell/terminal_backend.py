"""Terminal WebSocket Backend — PowerShell 终端"""
import asyncio
import json
import os
import subprocess
import sys

PORT = 18925


class TermSession:
    def __init__(self, sid, cols, rows, cwd):
        self.sid = sid
        self.cols = cols
        self.rows = rows
        self.cwd = cwd or os.path.expanduser("~")
        self.proc = None

    async def spawn(self):
        env = os.environ.copy()
        # 通过 PowerShell 配置文件设置 UTF-8
        ps_cmd = (
            '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; '
            '$OutputEncoding=[System.Text.Encoding]::UTF8; '
            'chcp 65001 >$null'
        )
        self.proc = await asyncio.create_subprocess_shell(
            f'powershell.exe -NoLogo -NoExit -Command "{ps_cmd}"',
            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            cwd=self.cwd,
            env=env,
        )
        return {"ok": True, "shell": "powershell"}

    async def write(self, data):
        if self.proc and self.proc.stdin:
            self.proc.stdin.write(data.encode("utf-8"))
            await self.proc.stdin.drain()

    async def read(self):
        if not self.proc or not self.proc.stdout:
            return None
        try:
            data = await asyncio.wait_for(self.proc.stdout.read(4096), timeout=0.05)
            if not data:
                return None
            try:
                return data.decode("utf-8")
            except UnicodeDecodeError:
                return data.decode("gbk", errors="replace")
        except asyncio.TimeoutError:
            return None
        except Exception:
            return None

    async def kill(self):
        if self.proc:
            try:
                self.proc.kill()
            except Exception:
                pass


async def handle(ws):
    session = None
    reader_task = None

    async def reader():
        while session:
            data = await session.read()
            if data:
                try:
                    await ws.send(json.dumps({
                        "type": "output",
                        "session_id": session.sid,
                        "data": data,
                    }))
                except Exception:
                    break
            else:
                await asyncio.sleep(0.05)
        if session:
            try:
                await ws.send(json.dumps({
                    "type": "exit", "session_id": session.sid, "code": 0,
                }))
            except Exception:
                pass

    try:
        async for msg in ws:
            try:
                m = json.loads(msg)
            except json.JSONDecodeError:
                continue

            cmd = m.get("command", "")

            if cmd == "spawn":
                try:
                    session = TermSession(
                        1, m.get("cols", 80), m.get("rows", 24), m.get("cwd"),
                    )
                    await session.spawn()
                    await ws.send(json.dumps({
                        "type": "spawn",
                        "session_id": session.sid,
                        "shell": "powershell",
                        "cwd": session.cwd,
                    }))
                    reader_task = asyncio.create_task(reader())
                except Exception as spawn_err:
                    await ws.send(json.dumps({
                        "type": "spawn",
                        "session_id": 0,
                        "shell": "error",
                        "cwd": "",
                        "error": str(spawn_err),
                    }))

            elif cmd == "write" and session:
                await session.write(m.get("data", ""))

            elif cmd == "resize" and session:
                session.cols = m.get("cols", 80)
                session.rows = m.get("rows", 24)

            elif cmd == "kill":
                if session:
                    await session.kill()
                if reader_task:
                    reader_task.cancel()
                break
    except Exception:
        pass
    finally:
        if session:
            await session.kill()
        if reader_task:
            reader_task.cancel()


async def main():
    import websockets
    async with websockets.serve(handle, "127.0.0.1", PORT):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
