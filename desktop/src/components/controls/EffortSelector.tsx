import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSettingsStore } from '../../stores/settingsStore'
import type { EffortLevel } from '../../types/settings'

const EFFORT_OPTIONS: { value: EffortLevel; label: string }[] = [
  { value: 'max', label: 'max' },
  { value: 'xhigh', label: 'xhigh' },
  { value: 'high', label: 'high' },
  { value: 'medium', label: 'medium' },
  { value: 'low', label: 'low' },
]

type Props = {
  compact?: boolean
  disabled?: boolean
}

export function EffortSelector({ compact = false, disabled = false }: Props) {
  const effortLevel = useSettingsStore((s) => s.effortLevel)
  const setEffort = useSettingsStore((s) => s.setEffort)
  const [open, setOpen] = useState(false)
  const [animating, setAnimating] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})

  const toggle = useCallback(() => {
    if (disabled) return
    if (!open) {
      setAnimating(true)
      setOpen(true)
    } else {
      setAnimating(false)
      setTimeout(() => setOpen(false), 200)
    }
  }, [open, disabled])

  const select = useCallback((level: EffortLevel) => {
    void setEffort(level)
    setAnimating(false)
    setTimeout(() => setOpen(false), 200)
  }, [setEffort])

  useEffect(() => {
    if (!open) return
    const updatePos = () => {
      if (!anchorRef.current) return
      const rect = anchorRef.current.getBoundingClientRect()
      setDropdownStyle({
        position: 'fixed',
        bottom: window.innerHeight - rect.top + 6,
        left: rect.left,
        zIndex: 90,
      })
    }
    updatePos()
    // small delay to let the DOM render
    const timer = setTimeout(updatePos, 10)
    window.addEventListener('scroll', updatePos, true)
    window.addEventListener('resize', updatePos)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('scroll', updatePos, true)
      window.removeEventListener('resize', updatePos)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (anchorRef.current?.contains(target)) return
      if (dropdownRef.current?.contains(target)) return
      setAnimating(false)
      setTimeout(() => setOpen(false), 200)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const selectedLabel = EFFORT_OPTIONS.find((o) => o.value === effortLevel)?.label || 'max'

  return (
    <div className="relative min-w-0 shrink-0">
      <button
        ref={anchorRef}
        onClick={toggle}
        disabled={disabled}
        className={`flex items-center gap-1.5 rounded-full bg-[var(--color-surface-container-low)] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50 ${
          compact ? 'max-w-[72px] px-2 py-1 text-[11px]' : 'max-w-[88px] px-2.5 py-1.5 text-xs'
        }`}
        title={selectedLabel}
      >
        <span className="min-w-0 flex-1 truncate font-semibold text-[var(--color-text-primary)]">
          {selectedLabel}
        </span>
        <span className={`material-symbols-outlined shrink-0 text-[12px] transition-transform duration-200 ${open && animating ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>

      {open && (
        createPortal(
          <div
            ref={dropdownRef}
            style={dropdownStyle}
            className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] shadow-[var(--shadow-dropdown)] py-1.5 transition-all duration-200 ease-out ${
              animating ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-1'
            }`}
          >
            <div className="px-3.5 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-widest text-[var(--color-outline)]">
              思考强度
            </div>
            {EFFORT_OPTIONS.map((opt) => {
              const isSelected = opt.value === effortLevel
              return (
                <button
                  key={opt.value}
                  onClick={() => select(opt.value)}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-xs transition-colors hover:bg-[var(--color-surface-hover)] ${
                    isSelected ? 'text-[var(--color-brand)] font-semibold' : 'text-[var(--color-text-secondary)]'
                  }`}
                >
                  <span className="w-3.5 text-center text-[11px]">
                    {isSelected ? '✓' : ''}
                  </span>
                  <span>{opt.label}</span>
                </button>
              )
            })}
          </div>,
          document.body,
        )
      )}
    </div>
  )
}
