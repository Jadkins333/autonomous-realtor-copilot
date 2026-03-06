'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'

import { useRequireAuth } from '@/components/auth-guard'
import { SiteShell } from '@/components/site-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { apiFetch } from '@/lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SourceStatusItem = {
  source_name: string
  mode: 'live' | 'fixture'
  state: 'ok' | 'partial' | 'failed' | 'paused'
  reachable: boolean | null
  is_stale: boolean
  last_run_started_at: string | null
  last_run_finished_at: string | null
  last_success_at: string | null
  last_error: string | null
  drift_detected: boolean
  drift_reason: string | null
  dlq_count: number
  paused_reason: string | null
  updated_at: string
}

type SourceStatusResponse = { items: SourceStatusItem[] }

type ReplayResponse = {
  attempted: number
  succeeded: number
  failed: number
  skipped_duplicate: number
  message: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return 'just now'
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StateBadge({ state }: { state: SourceStatusItem['state'] }) {
  const className =
    state === 'ok'
      ? 'bg-green-500/20 text-green-200'
      : state === 'partial'
        ? 'bg-amber-500/20 text-amber-200'
        : state === 'paused'
          ? 'bg-blue-500/20 text-blue-200'
          : 'bg-red-500/20 text-red-200'
  return (
    <Badge className={className} data-testid={`state-badge-${state}`}>
      {state}
    </Badge>
  )
}

function DriftBanner({ reason }: { reason: string | null }) {
  return (
    <div
      className='mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300'
      data-testid='drift-banner'
    >
      ⚠ Drift detected{reason ? `: ${reason}` : ''}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SourcesPage() {
  const { status } = useRequireAuth()
  const { data: session } = useSession()

  const [items, setItems] = useState<SourceStatusItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  // Inline pause form: tracks which source is being paused + the typed reason.
  const [pausingSource, setPausingSource] = useState<string | null>(null)
  const [pauseReason, setPauseReason] = useState('Manual pause from web admin')
  const pauseInputRef = useRef<HTMLInputElement>(null)

  // Replay confirm: tracks which source needs a confirmation click.
  const [confirmingReplay, setConfirmingReplay] = useState<string | null>(null)

  const isAdmin = useMemo(() => session?.user?.role === 'admin', [session])

  const load = useCallback(async () => {
    if (!session) return
    setLoading(true)
    try {
      const response = await apiFetch<SourceStatusResponse>('/sources/status', session.apiToken)
      setItems(response.items ?? [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sources')
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    void load()
  }, [load])

  // Auto-focus the pause reason input when it appears.
  useEffect(() => {
    if (pausingSource) {
      setTimeout(() => pauseInputRef.current?.focus(), 50)
    }
  }, [pausingSource])

  const submitPause = async (sourceName: string) => {
    if (!session || !isAdmin) return
    setActionMessage(null)
    try {
      await apiFetch('/sources/' + sourceName + '/pause', session.apiToken, {
        method: 'POST',
        body: JSON.stringify({ reason: pauseReason || 'Manual pause from web admin' }),
      })
      setActionMessage(sourceName + ' paused')
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Failed to pause ' + sourceName)
    } finally {
      setPausingSource(null)
      setPauseReason('Manual pause from web admin')
      await load()
    }
  }

  const runAction = async (sourceName: string, action: 'resume' | 'replay') => {
    if (!session || !isAdmin) return
    setActionMessage(null)
    try {
      if (action === 'resume') {
        await apiFetch('/sources/' + sourceName + '/resume', session.apiToken, { method: 'POST' })
        setActionMessage(sourceName + ' resumed')
      } else {
        const replay = await apiFetch<ReplayResponse>(
          '/sources/' + sourceName + '/dlq/replay',
          session.apiToken,
          { method: 'POST' },
        )
        setActionMessage(
          sourceName +
            ' replay: attempted=' +
            replay.attempted +
            ' succeeded=' +
            replay.succeeded +
            ' failed=' +
            replay.failed,
        )
      }
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Failed ' + action + ' for ' + sourceName)
    } finally {
      setConfirmingReplay(null)
      await load()
    }
  }

  if (status !== 'authenticated') {
    return null
  }

  const driftCount = items.filter((i) => i.drift_detected).length

  return (
    <SiteShell>
      {/* Header card */}
      <Card className='mb-4'>
        <CardTitle>Sources Admin</CardTitle>
        <CardDescription>
          Live ingestion source status with pause / resume / replay controls. Actions are admin-only.
        </CardDescription>

        {driftCount > 0 && (
          <div
            className='mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300'
            data-testid='global-drift-banner'
          >
            ⚠ {driftCount} source{driftCount > 1 ? 's' : ''} with drift detected — resolve before replaying.
          </div>
        )}

        <div className='mt-3 flex gap-2'>
          <Button variant='outline' onClick={() => void load()}>
            Refresh
          </Button>
          {!isAdmin ? (
            <Badge data-testid='role-badge-readonly'>read-only (agent role)</Badge>
          ) : (
            <Badge data-testid='role-badge-admin'>admin controls enabled</Badge>
          )}
        </div>

        {actionMessage ? (
          <p className='mt-3 text-sm text-muted-foreground' data-testid='action-message'>
            {actionMessage}
          </p>
        ) : null}
      </Card>

      {/* Loading / error states */}
      {loading ? <Card data-testid='loading-card'>Loading sources…</Card> : null}
      {error ? (
        <Card>
          <p className='text-sm text-red-400'>{error}</p>
        </Card>
      ) : null}

      {/* Source cards */}
      {!loading && !error ? (
        <div className='space-y-3'>
          {items.map((item) => (
            <Card key={item.source_name} data-testid={`source-card-${item.source_name}`}>
              {/* Drift alert */}
              {item.drift_detected && <DriftBanner reason={item.drift_reason} />}

              {/* Header row */}
              <div className='flex flex-wrap items-start justify-between gap-3'>
                <div>
                  <p className='font-semibold'>{item.source_name}</p>
                  <p className='text-xs text-muted-foreground'>
                    mode={item.mode}
                    {item.reachable !== null && <> · reachable={String(item.reachable)}</>}
                  </p>
                </div>
                <div className='flex flex-wrap gap-2'>
                  <StateBadge state={item.state} />
                  {item.is_stale && (
                    <Badge className='bg-orange-500/20 text-orange-300' data-testid='stale-badge'>
                      stale
                    </Badge>
                  )}
                  {item.dlq_count > 0 && (
                    <Badge className='bg-amber-500/20 text-amber-200' data-testid='dlq-badge'>
                      DLQ: {item.dlq_count}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Metadata grid */}
              <div className='mt-3 grid gap-1 text-xs text-muted-foreground md:grid-cols-2'>
                <p>finished: {relativeTime(item.last_run_finished_at)}</p>
                <p>last success: {relativeTime(item.last_success_at)}</p>
                {item.paused_reason ? <p className='col-span-2'>paused: {item.paused_reason}</p> : null}
                {item.last_error ? (
                  <p className='col-span-2 text-red-300' data-testid='last-error'>
                    error: {item.last_error}
                  </p>
                ) : null}
              </div>

              {/* Actions */}
              <div className='mt-3 space-y-2'>
                {/* Inline pause form */}
                {pausingSource === item.source_name ? (
                  <div className='flex flex-wrap items-center gap-2' data-testid='pause-form'>
                    <input
                      ref={pauseInputRef}
                      className='flex-1 rounded-lg border border-input bg-transparent px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring'
                      placeholder='Pause reason'
                      value={pauseReason}
                      onChange={(e) => setPauseReason(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void submitPause(item.source_name)
                        if (e.key === 'Escape') setPausingSource(null)
                      }}
                    />
                    <Button
                      variant='outline'
                      onClick={() => void submitPause(item.source_name)}
                      data-testid='pause-submit'
                    >
                      Confirm Pause
                    </Button>
                    <Button
                      variant='outline'
                      onClick={() => setPausingSource(null)}
                      data-testid='pause-cancel'
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className='flex flex-wrap gap-2'>
                    <Button
                      disabled={!isAdmin}
                      variant='outline'
                      onClick={() => {
                        setPausingSource(item.source_name)
                        setConfirmingReplay(null)
                      }}
                      data-testid='pause-btn'
                    >
                      Pause
                    </Button>
                    <Button
                      disabled={!isAdmin}
                      variant='outline'
                      onClick={() => void runAction(item.source_name, 'resume')}
                      data-testid='resume-btn'
                    >
                      Resume
                    </Button>

                    {/* Replay: two-step confirm */}
                    {confirmingReplay === item.source_name ? (
                      <>
                        <Button
                          variant='outline'
                          className='border-amber-500/50 text-amber-300'
                          onClick={() => void runAction(item.source_name, 'replay')}
                          data-testid='replay-confirm'
                        >
                          Confirm Replay
                        </Button>
                        <Button
                          variant='outline'
                          onClick={() => setConfirmingReplay(null)}
                          data-testid='replay-cancel'
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        disabled={!isAdmin}
                        variant='outline'
                        onClick={() => {
                          setConfirmingReplay(item.source_name)
                          setPausingSource(null)
                        }}
                        data-testid='replay-btn'
                      >
                        Replay DLQ
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </Card>
          ))}
          {items.length === 0 ? <Card>No sources found.</Card> : null}
        </div>
      ) : null}
    </SiteShell>
  )
}
