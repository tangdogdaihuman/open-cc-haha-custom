import { useEffect, useState, useCallback } from 'react'
import { Button } from '../components/shared/Button'

type PlatformType = 'feishu' | 'weixin' | 'telegram'

type PlatformOptions = {
  // feishu
  app_id?: string
  app_secret?: string
  allow_from?: string
  admin_from?: string
  // weixin
  token?: string
  base_url?: string
  account_id?: string
}

type Platform = {
  type: PlatformType
  options: PlatformOptions
}

type Provider = {
  name: string
  api_key: string
  base_url: string
  agent_types?: string[]
}

type AgentOptions = {
  work_dir: string
  mode: string
  provider_refs: string[]
}

type Project = {
  name: string
  platforms: Platform[]
  agent?: {
    type?: string
    options?: AgentOptions
  }
}

type CcConfig = {
  language: string
  log: { level: string }
  display: { thinking_messages: boolean }
  providers: Provider[]
  projects: Project[]
}

const EMPTY_CONFIG: CcConfig = {
  language: 'zh',
  log: { level: 'info' },
  display: { thinking_messages: false },
  providers: [],
  projects: [],
}

const PLATFORM_LABELS: Record<PlatformType, string> = {
  feishu: '飞书',
  weixin: '微信',
  telegram: 'Telegram',
}

export function CcConnectSettings() {
  const [config, setConfig] = useState<CcConfig>(EMPTY_CONFIG)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saved, setSaved] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [activePlatform, setActivePlatform] = useState<PlatformType>('feishu')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/cc-connect-config')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        const main = data['config.toml'] || {}
        if (!main.providers?.length && !main.projects?.length) {
          setLoadError('配置文件为空或格式异常，请检查 ~/.cc-connect/config.toml')
          return
        }
        const merged: CcConfig = {
          language: main.language || 'zh',
          log: { level: main.log?.level || 'info' },
          display: { thinking_messages: main.display?.thinking_messages ?? false },
          providers: (main.providers || []).map((p: any) => ({
            name: p.name || '',
            api_key: p.api_key || '',
            base_url: p.base_url || '',
            agent_types: p.agent_types || ['claudecode'],
          })),
          projects: (main.projects || []).map((proj: any) => ({
            name: proj.name || '',
            platforms: (proj.platforms || []).map((plat: any) => ({
              type: plat.type as PlatformType,
              options: plat.options || {},
            })),
            agent: {
              type: proj.agent?.type || 'claudecode',
              options: {
                work_dir: proj.agent?.options?.work_dir || '',
                mode: proj.agent?.options?.mode || 'default',
                provider_refs: proj.agent?.options?.provider_refs || ['deepseek'],
              },
            },
          })),
        }
        setConfig(merged)
      })
      .catch((e) => setLoadError(e.message || String(e)))
      .finally(() => setLoading(false))
  }, [])

  const project = config.projects[0]
  const platforms = project?.platforms || []

  const updatePlatform = useCallback((type: PlatformType, patch: Partial<PlatformOptions>) => {
    setConfig((c) => {
      const projects = [...c.projects]
      if (!projects[0]) return c
      const platforms: Platform[] = [...(projects[0].platforms || [])]
      const idx = platforms.findIndex((p) => p.type === type)
      if (idx >= 0) {
        platforms[idx] = { type, options: { ...platforms[idx]!.options, ...patch } }
      } else {
        platforms.push({ type, options: patch as PlatformOptions })
      }
      projects[0] = { ...projects[0], platforms }
      return { ...c, projects }
    })
  }, [])

  const updateAgent = useCallback((patch: Partial<AgentOptions>) => {
    setConfig((c) => {
      const projects = [...c.projects]
      if (!projects[0] || !projects[0].agent) return c
      projects[0] = {
        ...projects[0],
        agent: {
          ...projects[0].agent,
          options: { ...projects[0].agent.options!, ...patch },
        },
      }
      return { ...c, projects }
    })
  }, [])

  const updateProvider = useCallback((patch: Partial<Provider>) => {
    setConfig((c) => {
      const providers = c.providers.length > 0 ? [...c.providers] : [{} as Provider]
      providers[0] = { ...providers[0]!, ...patch }
      return { ...c, providers }
    })
  }, [])

  const saveAndRestart = useCallback(() => {
    setRestarting(true)
    setError('')
    fetch('/api/cc-connect-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config, null, 2),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) {
          setError(data.error || '保存失败')
          setRestarting(false)
          return
        }
        // 保存成功后重启 cc-connect
        return fetch('/api/cc-connect-restart', { method: 'POST' })
          .then((r) => r.json())
          .then((rr) => {
            setRestarting(false)
            if (rr.ok) {
              setSaved(true)
              setTimeout(() => setSaved(false), 3000)
            } else {
              setError(rr.message || '重启失败，请手动在终端运行 cc-connect')
            }
          })
      })
      .catch((e) => {
        setError(String(e))
        setRestarting(false)
      })
  }, [config])

  if (loading) {
    return <div className="w-full max-w-xl mx-auto py-6 text-sm text-[var(--color-text-tertiary)]">加载中...</div>
  }

  if (loadError) {
    return (
      <div className="w-full max-w-xl mx-auto py-6 space-y-4">
        <div className="rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-container)]/15 p-4">
          <p className="text-sm font-medium text-[var(--color-error)]">无法加载配置</p>
          <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{loadError}</p>
          <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">请确认 cc-connect 已正确安装，且 ~/.cc-connect/config.toml 文件存在。</p>
        </div>
      </div>
    )
  }

  const platform = platforms.find((p) => p.type === activePlatform)
  const provider = config.providers[0]

  return (
    <div className="w-full max-w-xl mx-auto py-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[var(--color-text-primary)]">IM 连接（cc-connect 方案）</h2>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)] leading-relaxed">
          管理 cc-connect 的 IM 平台连接配置（飞书、微信、Telegram）。修改后需重启 cc-connect 生效。
        </p>
      </div>

      {/* Provider */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-4 space-y-3">
        <h3 className="text-sm font-medium text-[var(--color-text-primary)]">AI 服务商</h3>
        <div className="grid gap-3">
          <InputField label="名称" value={provider?.name || ''} onChange={(v) => updateProvider({ name: v })} />
          <InputField label="API Key" type="password" value={provider?.api_key || ''} onChange={(v) => updateProvider({ api_key: v })} />
          <InputField label="Base URL" value={provider?.base_url || ''} onChange={(v) => updateProvider({ base_url: v })} />
        </div>
      </div>

      {/* Agent */}
      {project?.agent?.options && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-4 space-y-3">
          <h3 className="text-sm font-medium text-[var(--color-text-primary)]">Agent 配置</h3>
          <div className="grid gap-3">
            <InputField label="工作目录" value={project.agent.options.work_dir} onChange={(v) => updateAgent({ work_dir: v.replace(/\\/g, '\\\\') })} />
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">模式</label>
              <select
                value={project.agent.options.mode}
                onChange={(e) => updateAgent({ mode: e.target.value })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/35"
              >
                <option value="default">default — 每次询问</option>
                <option value="dontAsk">dontAsk — 自动执行</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Platform tabs */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-4 space-y-4">
        <h3 className="text-sm font-medium text-[var(--color-text-primary)]">IM 平台</h3>

        <div className="flex gap-1 rounded-lg bg-[var(--color-surface)] p-1">
          {(Object.keys(PLATFORM_LABELS) as PlatformType[]).map((type) => (
            <button
              key={type}
              onClick={() => setActivePlatform(type)}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                activePlatform === type
                  ? 'bg-[var(--color-brand)]/15 text-[var(--color-brand)]'
                  : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {PLATFORM_LABELS[type]}
              {platforms.some((p) => p.type === type) && (
                <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />
              )}
            </button>
          ))}
        </div>

        {/* Feishu */}
        {activePlatform === 'feishu' && (
          <div className="space-y-3">
            <InputField label="App ID" value={platform?.options?.app_id || ''} onChange={(v) => updatePlatform('feishu', { app_id: v })} />
            <InputField label="App Secret" type="password" value={platform?.options?.app_secret || ''} onChange={(v) => updatePlatform('feishu', { app_secret: v })} />
            <InputField label="允许用户 (allow_from)" placeholder="ou_xxx" value={platform?.options?.allow_from || ''} onChange={(v) => updatePlatform('feishu', { allow_from: v })} />
            <InputField label="管理员 (admin_from)" placeholder="ou_xxx" value={platform?.options?.admin_from || ''} onChange={(v) => updatePlatform('feishu', { admin_from: v })} />
          </div>
        )}

        {/* Weixin */}
        {activePlatform === 'weixin' && (
          <div className="space-y-3">
            <InputField label="Token" value={platform?.options?.token || ''} onChange={(v) => updatePlatform('weixin', { token: v })} />
            <InputField label="Base URL" value={platform?.options?.base_url || ''} onChange={(v) => updatePlatform('weixin', { base_url: v })} />
            <InputField label="Account ID" value={platform?.options?.account_id || ''} onChange={(v) => updatePlatform('weixin', { account_id: v })} />
          </div>
        )}

        {/* Telegram */}
        {activePlatform === 'telegram' && (
          <div className="space-y-3">
            <InputField label="Bot Token" type="password" value={platform?.options?.token || ''} onChange={(v) => updatePlatform('telegram', { token: v })} />
            <InputField label="允许用户 ID (allow_from)" placeholder="8081942170" value={platform?.options?.allow_from || ''} onChange={(v) => updatePlatform('telegram', { allow_from: v })} />
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-[var(--color-error)]/20 bg-[var(--color-error-container)]/18 px-3 py-2 text-xs text-[var(--color-error)]">{error}</div>
      )}

      <div className="flex items-center gap-3">
        <Button size="sm" onClick={saveAndRestart} loading={restarting}>
          {restarting ? '重启中...' : '保存并重启 cc-connect'}
        </Button>
        {saved && <span className="text-xs text-[var(--color-success)]">已保存并重启成功</span>}
        {error && <span className="text-xs text-[var(--color-error)]">{error}</span>}
      </div>
    </div>
  )
}

function InputField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder = '',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-[var(--color-text-tertiary)]">{label}</label>
      <div className="flex gap-1">
        <input
          type={type === 'password' && !show ? 'password' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/35"
        />
        {type === 'password' && (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="inline-flex items-center justify-center w-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">
              {show ? 'visibility_off' : 'visibility'}
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
