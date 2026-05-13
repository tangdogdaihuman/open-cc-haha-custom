import { useCallback, useMemo, useState } from 'react'
import { sessionsApi, type SessionTurnCheckpoint } from '../../api/sessions'
import { useTranslation } from '../../i18n'
import { WorkspaceDiffSurface } from '../workspace/WorkspaceCodeSurface'

type DiffPreviewState = {
  loading: boolean
  diff?: string
  error?: string
}

type CurrentTurnChangeCardProps = {
  sessionId: string
  targetUserMessageId: string
  checkpoint: SessionTurnCheckpoint
  workDir: string | null
  error: string | null
  isUndoing: boolean
  isLatest: boolean
  onUndo: () => void
}

type ChangedFileEntry = {
  apiPath: string
  displayPath: string
}

export function CurrentTurnChangeCard({
  sessionId,
  targetUserMessageId,
  checkpoint,
  workDir,
  error,
  isUndoing,
  isLatest,
  onUndo,
}: CurrentTurnChangeCardProps) {
  const t = useTranslation()
  const [collapsed, setCollapsed] = useState(true)
  const [expandedPath, setExpandedPath] = useState<string | null>(null)
  const [diffByPath, setDiffByPath] = useState<Record<string, DiffPreviewState>>({})

  const files = useMemo<ChangedFileEntry[]>(
    () => checkpoint.code.filesChanged.map((filePath) => ({
      apiPath: filePath,
      displayPath: relativizeWorkspacePath(filePath, workDir),
    })),
    [checkpoint.code.filesChanged, workDir],
  )

  const toggleDiff = useCallback((fileEntry: ChangedFileEntry) => {
    const nextExpandedPath = expandedPath === fileEntry.apiPath ? null : fileEntry.apiPath
    setExpandedPath(nextExpandedPath)
    if (!nextExpandedPath || diffByPath[fileEntry.apiPath]?.diff || diffByPath[fileEntry.apiPath]?.loading) {
      return
    }

    setDiffByPath((current) => ({
      ...current,
      [fileEntry.apiPath]: { loading: true },
    }))

    void sessionsApi
      .getTurnCheckpointDiff(
        sessionId,
        targetUserMessageId,
        fileEntry.apiPath,
        checkpoint.target.userMessageIndex,
      )
      .then((result) => {
        setDiffByPath((current) => ({
          ...current,
          [fileEntry.apiPath]: {
            loading: false,
            diff: result.state === 'ok' ? result.diff || '' : undefined,
            error: result.state === 'ok'
              ? undefined
              : result.error || t('chat.turnChangesDiffUnavailable'),
          },
        }))
      })
      .catch((diffError) => {
        setDiffByPath((current) => ({
          ...current,
          [fileEntry.apiPath]: {
            loading: false,
            error: diffError instanceof Error
              ? diffError.message
              : String(diffError),
          },
        }))
      })
  }, [diffByPath, expandedPath, sessionId, t, targetUserMessageId])

  const cardLabel = isLatest
    ? t('chat.turnChangesLatestCardLabel')
    : t('chat.turnChangesHistoricalCardLabel')
  const undoLabel = isLatest
    ? t('chat.turnChangesLatestUndo')
    : t('chat.turnChangesHistoricalUndo')
  const undoAria = isLatest
    ? t('chat.turnChangesLatestUndoAria')
    : t('chat.turnChangesHistoricalUndoAria')

  return (
    <section
      className="mx-auto mb-5 w-full max-w-[860px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]/60 bg-[var(--color-surface-container-lowest)] shadow-sm"
      aria-label={cardLabel}
    >
      {/* Collapsed: compact one-line summary */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-[var(--color-surface-hover)]/40"
      >
        <span className="material-symbols-outlined shrink-0 text-[13px] text-[var(--color-text-tertiary)]">
          {collapsed ? 'chevron_right' : 'expand_more'}
        </span>
        <span className="text-[var(--color-text-tertiary)]">
          {t('chat.turnChangesTitle', { count: files.length })}
        </span>
        <span className="font-mono font-medium text-[var(--color-success)]">
          +{checkpoint.code.insertions}
        </span>
        <span className="font-mono font-medium text-[var(--color-error)]">
          -{checkpoint.code.deletions}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onUndo()
          }}
          disabled={isUndoing}
          aria-label={undoAria}
          className="inline-flex h-6 shrink-0 items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)]/60 bg-[var(--color-surface)] px-2 text-[10px] font-medium text-[var(--color-text-tertiary)] transition-colors hover:border-[var(--color-brand)]/30 hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-brand)]/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-[12px]">undo</span>
          {isUndoing ? t('chat.turnChangesUndoing') : undoLabel}
        </button>
      </button>

      {!collapsed && (
        <>
          <div className="divide-y divide-[var(--color-border)]/60 border-t border-[var(--color-border)]/60">
            {files.map((fileEntry) => {
              const isExpanded = expandedPath === fileEntry.apiPath
              const diffState = diffByPath[fileEntry.apiPath]
              return (
                <div key={fileEntry.apiPath}>
                  <button
                    type="button"
                    onClick={() => toggleDiff(fileEntry)}
                    aria-label={t(
                      isExpanded ? 'chat.turnChangesHideDiffAria' : 'chat.turnChangesShowDiffAria',
                      { path: fileEntry.displayPath },
                    )}
                    className="flex min-h-[34px] w-full items-center gap-2.5 px-3 text-left text-xs text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-brand)]/35"
                  >
                    <span className="material-symbols-outlined shrink-0 text-[15px] text-[var(--color-text-tertiary)]">
                      {isExpanded ? 'keyboard_arrow_down' : 'chevron_right'}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[12px]">
                      {fileEntry.displayPath}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-[var(--color-border)]/60 bg-[var(--color-surface-container-lowest)] px-3 py-2.5">
                      {diffState?.loading ? (
                        <div className="text-xs text-[var(--color-text-tertiary)]">
                          {t('chat.turnChangesDiffLoading')}
                        </div>
                      ) : diffState?.error ? (
                        <div className="text-xs text-[var(--color-error)]">
                          {diffState.error}
                        </div>
                      ) : diffState?.diff ? (
                        <WorkspaceDiffSurface
                          value={diffState.diff}
                          path={fileEntry.displayPath}
                          className="max-h-[430px] overflow-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-code-bg)]"
                        />
                      ) : (
                        <div className="text-xs text-[var(--color-text-tertiary)]">
                          {t('chat.turnChangesDiffUnavailable')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {error && (
            <div className="border-t border-[var(--color-error)]/20 bg-[var(--color-error-container)]/18 px-3 py-2.5 text-xs text-[var(--color-error)]">
              {error}
            </div>
          )}
        </>
      )}
    </section>
  )
}

export function relativizeWorkspacePath(filePath: string, workDir: string | null): string {
  const normalizedPath = filePath.replace(/\\/g, '/')
  const isAbsolute = normalizedPath.startsWith('/') || /^[a-zA-Z]:\//.test(normalizedPath)
  if (!workDir || !isAbsolute) return normalizedPath

  const normalizedWorkDir = workDir.replace(/\\/g, '/').replace(/\/+$/, '')
  const comparablePath = normalizedPath.toLowerCase()
  const comparableWorkDir = normalizedWorkDir.toLowerCase()
  if (comparablePath === comparableWorkDir) return ''
  if (comparablePath.startsWith(`${comparableWorkDir}/`)) {
    return normalizedPath.slice(normalizedWorkDir.length + 1)
  }
  return normalizedPath
}
