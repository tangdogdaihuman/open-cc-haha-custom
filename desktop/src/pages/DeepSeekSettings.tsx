import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from '../i18n'
import { Button } from '../components/shared/Button'

type Tier = {
  model: string
  prompt: string
}

type VisionConfig = {
  apiKey: string
  apiUrl: string
  tiers: Tier[]
}

const DEFAULT_CONFIG: VisionConfig = {
  apiKey: '',
  apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  tiers: [
    { model: 'qwen3-vl-plus', prompt: '请详细描述这张截图的全部内容，让一个看不见图片的人能完全理解屏幕状态：\n1. 整体布局：有哪些窗口/面板/区域，各自在屏幕的什么位置\n2. 每个区域的具体内容：按钮、菜单、输入框、列表项、图标、图形节点、连线等\n3. 所有可见文字（包括按钮标签、菜单项、状态栏、代码、文件名等）\n4. 颜色特征：各区域的主题色、高亮色、选中状态的颜色变化\n5. 如果有代码或脚本，写出代码内容\n直接输出，不要加开场白。' },
    { model: 'qwen3-vl-flash', prompt: '请描述这张截图的画面内容和布局，包括所有可见文字、UI元素位置、颜色特征。直接输出。' },
    { model: 'qwen-vl-ocr', prompt: '提取图中所有文字。直接输出。' },
  ],
}

const DEFAULT_TIER: Tier = { model: '', prompt: '' }

export function DeepSeekSettings() {
  const t = useTranslation()
  const [config, setConfig] = useState<VisionConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [showKey, setShowKey] = useState(false)

  useEffect(() => {
    fetch('/api/vision-config')
      .then((r) => r.json())
      .then((data) => {
        if (data.apiKey || data.apiUrl || data.tiers) {
          setConfig({
            apiKey: data.apiKey || '',
            apiUrl: data.apiUrl || DEFAULT_CONFIG.apiUrl,
            tiers: data.tiers?.length ? data.tiers : DEFAULT_CONFIG.tiers,
          })
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const save = useCallback(() => {
    fetch('/api/vision-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config, null, 2),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setSaved(true)
          setTimeout(() => setSaved(false), 2000)
        }
      })
      .catch(() => {})
  }, [config])

  const setApiKey = (v: string) => setConfig((c) => ({ ...c, apiKey: v }))
  const setApiUrl = (v: string) => setConfig((c) => ({ ...c, apiUrl: v }))

  const updateTier = useCallback((index: number, field: keyof Tier, value: string) => {
    setConfig((c) => {
      const tiers = [...c.tiers]
      tiers[index] = { ...tiers[index]!, [field]: value }
      return { ...c, tiers }
    })
  }, [])

  const addTier = () => setConfig((c) => ({ ...c, tiers: [...c.tiers, { ...DEFAULT_TIER }] }))

  const removeTier = (index: number) => {
    setConfig((c) => ({ ...c, tiers: c.tiers.filter((_, i) => i !== index) }))
  }

  const moveTier = (index: number, direction: -1 | 1) => {
    setConfig((c) => {
      const tiers = [...c.tiers]
      const target = index + direction
      if (target < 0 || target >= tiers.length) return c
      ;[tiers[index]!, tiers[target]!] = [tiers[target]!, tiers[index]!]
      return { ...c, tiers }
    })
  }

  if (loading) {
    return <div className="w-full max-w-xl mx-auto py-6 text-sm text-[var(--color-text-tertiary)]">加载中...</div>
  }

  return (
    <div className="w-full max-w-xl mx-auto py-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[var(--color-text-primary)]">{t('settings.deepseek.title')}</h2>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)] leading-relaxed">
          {t('settings.deepseek.description')}
        </p>
      </div>

      {/* API Key */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-[var(--color-text-primary)]">{t('settings.deepseek.apiKey')}</label>
        <div className="flex gap-1.5">
          <input
            type={showKey ? 'text' : 'password'}
            value={config.apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={t('settings.deepseek.apiKeyPlaceholder')}
            className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/35"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">
              {showKey ? 'visibility_off' : 'visibility'}
            </span>
          </button>
        </div>
        {!showKey && config.apiKey && (
          <p className="text-[11px] text-[var(--color-text-tertiary)]">
            {config.apiKey.slice(0, 8)}{'···'}（点击右侧眼睛图标查看）
          </p>
        )}
      </div>

      {/* API URL */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-[var(--color-text-primary)]">{t('settings.deepseek.apiUrl')}</label>
        <input
          type="text"
          value={config.apiUrl}
          onChange={(e) => setApiUrl(e.target.value)}
          placeholder={t('settings.deepseek.apiUrlPlaceholder')}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/35"
        />
      </div>

      {/* Model tiers */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-medium text-[var(--color-text-primary)]">{t('settings.deepseek.modelOrder')}</h3>
          <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{t('settings.deepseek.modelOrderHint')}</p>
        </div>

        <div className="space-y-2">
          {config.tiers.map((tier, index) => (
            <div
              key={index}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--color-text-tertiary)]">
                  #{index + 1}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveTier(index, -1)}
                    disabled={index === 0}
                    title={t('settings.deepseek.moveUp')}
                    className="inline-flex items-center justify-center w-6 h-6 rounded text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] disabled:opacity-30 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px]">keyboard_arrow_up</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => moveTier(index, 1)}
                    disabled={index === config.tiers.length - 1}
                    title={t('settings.deepseek.moveDown')}
                    className="inline-flex items-center justify-center w-6 h-6 rounded text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] disabled:opacity-30 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px]">keyboard_arrow_down</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeTier(index)}
                    disabled={config.tiers.length <= 1}
                    title={t('settings.deepseek.removeTier')}
                    className="inline-flex items-center justify-center w-6 h-6 rounded text-[var(--color-text-tertiary)] hover:bg-[var(--color-error-container)] hover:text-[var(--color-error)] disabled:opacity-30 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                </div>
              </div>

              <div className="grid gap-2">
                <div>
                  <label className="text-[11px] font-medium text-[var(--color-text-tertiary)]">{t('settings.deepseek.model')}</label>
                  <input
                    type="text"
                    value={tier.model}
                    onChange={(e) => updateTier(index, 'model', e.target.value)}
                    placeholder="qwen3-vl-plus"
                    className="w-full mt-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]/35"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-[var(--color-text-tertiary)]">{t('settings.deepseek.prompt')}</label>
                  <textarea
                    value={tier.prompt}
                    onChange={(e) => updateTier(index, 'prompt', e.target.value)}
                    rows={2}
                    className="w-full mt-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]/35 resize-y"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <Button size="sm" variant="secondary" onClick={addTier}>
          <span className="material-symbols-outlined text-[16px]">add</span>
          {t('settings.deepseek.addTier')}
        </Button>
      </div>

      {/* Local OCR */}
      <div className="rounded-lg border border-[var(--color-border)]/60 bg-[var(--color-surface-container-low)] p-3">
        <div className="flex items-start gap-2.5">
          <span className="material-symbols-outlined text-[18px] text-[var(--color-text-tertiary)] mt-0.5">description</span>
          <div>
            <div className="text-sm font-medium text-[var(--color-text-primary)]">{t('settings.deepseek.localOcr')}</div>
            <div className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{t('settings.deepseek.localOcrDesc')}</div>
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={save}>{t('settings.deepseek.save')}</Button>
        {saved && <span className="text-xs text-[var(--color-success)]">{t('settings.deepseek.saved')}</span>}
      </div>
    </div>
  )
}
