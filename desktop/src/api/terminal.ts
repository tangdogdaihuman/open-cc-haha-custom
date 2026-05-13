import { isTauriRuntime } from '../lib/desktopRuntime'

export type TerminalSpawnResult = {
  session_id: number
  shell: string
  cwd: string
}

export type TerminalOutputPayload = {
  session_id: number
  data: string
}

export type TerminalExitPayload = {
  session_id: number
  code: number
  signal?: string | null
}

type Unlisten = () => void

function isTerminalAvailable(): boolean {
  if (typeof window === 'undefined') return false
  if ((window as any).__PYWEBVIEW__) return true
  return isTauriRuntime()
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTerminalAvailable()) {
    throw new Error('Terminal is available in the desktop app runtime.')
  }
  // pywebview: 使用注入的 __TAURI_INTERNALS__.invoke polyfill
  if ((window as any).__PYWEBVIEW__) {
    const internals = (window as any).__TAURI_INTERNALS__
    if (!internals?.invoke) throw new Error('Terminal polyfill not found')
    return internals.invoke(command, args) as Promise<T>
  }
  const api = await import('@tauri-apps/api/core')
  return api.invoke<T>(command, args)
}

export const terminalApi = {
  isAvailable: isTerminalAvailable,

  spawn(input: { cols: number; rows: number; cwd?: string }) {
    return invoke<TerminalSpawnResult>('terminal_spawn', input)
  },

  write(sessionId: number, data: string) {
    return invoke<void>('terminal_write', { sessionId, data })
  },

  resize(sessionId: number, cols: number, rows: number) {
    return invoke<void>('terminal_resize', { sessionId, cols, rows })
  },

  kill(sessionId: number) {
    return invoke<void>('terminal_kill', { sessionId })
  },

  async onOutput(handler: (payload: TerminalOutputPayload) => void): Promise<Unlisten> {
    if ((window as any).__PYWEBVIEW__) {
      const internals = (window as any).__TAURI_INTERNALS__
      return internals.event.listen('terminal-output', (event: any) => handler(event.payload))
    }
    const events = await import('@tauri-apps/api/event')
    return events.listen<TerminalOutputPayload>('terminal-output', (event) => handler(event.payload))
  },

  async onExit(handler: (payload: TerminalExitPayload) => void): Promise<Unlisten> {
    if ((window as any).__PYWEBVIEW__) {
      const internals = (window as any).__TAURI_INTERNALS__
      return internals.event.listen('terminal-exit', (event: any) => handler(event.payload))
    }
    const events = await import('@tauri-apps/api/event')
    return events.listen<TerminalExitPayload>('terminal-exit', (event) => handler(event.payload))
  },
}
