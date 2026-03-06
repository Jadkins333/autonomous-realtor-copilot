'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'

import { useRequireAuth } from '@/components/auth-guard'
import { SiteShell } from '@/components/site-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Table, Td, Th } from '@/components/ui/table'
import { apiFetch } from '@/lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DraftRow = {
  id: string
  pack_id?: string | null
  contact_id: string
  channel: string
  subject?: string | null
  body: string
  status: string
  created_at: string
}

type DraftPackRow = {
  id: string
  created_at: string
  created_by_user_id: string
  parcel_id?: string | null
  contact_id?: string | null
  status: string
  sandbox: boolean
  objective: string
  drafts: DraftRow[]
}

type DraftPackList = {
  items: DraftPackRow[]
  next_cursor?: string | null
}

type ActionResult = Record<string, unknown>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-blue-500/20 text-blue-200',
  blocked_sandbox: 'bg-amber-500/20 text-amber-200',
  sent: 'bg-green-500/20 text-green-200',
  delivered: 'bg-green-500/20 text-green-200',
  blocked: 'bg-red-500/20 text-red-200',
  failed: 'bg-red-500/20 text-red-200',
  rejected: 'bg-muted text-muted-foreground',
}

function DraftStatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? 'bg-muted text-muted-foreground'
  return (
    <Badge className={cls} data-testid={`draft-status-${status}`}>
      {status.replace('_', ' ')}
    </Badge>
  )
}

function resultMessage(result: ActionResult): string {
  const status = result.status as string | undefined
  if (!status) return 'Action completed'
  if (status === 'blocked_sandbox') return '✓ Staged in sandbox (no real send)'
  if (status === 'sent') return '✓ Message sent'
  if (status === 'delivered') return '✓ Message delivered'
  if (status === 'blocked') return `Blocked: ${String(result.reason ?? 'compliance policy')}`
  if (status === 'rejected') return 'Draft rejected'
  if (status === 'failed') return `Failed: ${String(result.reason ?? 'provider error')}`
  if (result.idempotent) return `Already ${status} (idempotent)`
  return `Status: ${status}`
}

function truncate(text: string, max = 120): string {
  return text.length > max ? text.slice(0, max) + '…' : text
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function OutreachPage() {
  const { status } = useRequireAuth()
  const { data: session } = useSession()

  const [packs, setPacks] = useState<DraftPackRow[]>([])
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null)
  const [actionResult, setActionResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Two-step confirm states per draft
  const [confirmApproving, setConfirmApproving] = useState<string | null>(null)
  const [confirmRejecting, setConfirmRejecting] = useState<string | null>(null)
  const [confirmSubmitPack, setConfirmSubmitPack] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!session) return
    setLoading(true)
    try {
      const packRows = await apiFetch<DraftPackList>('/outreach/draft-packs?limit=20', session.apiToken)
      setPacks(packRows.items ?? [])
      setSelectedPackId((current) => current || packRows.items?.[0]?.id || null)
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    void load()
  }, [load])

  const selectedPack = useMemo(
    () => packs.find((pack) => pack.id === selectedPackId) ?? null,
    [packs, selectedPackId],
  )

  async function submitPack(id: string) {
    if (!session) return
    setActionResult(null)
    const result = await apiFetch<ActionResult>('/outreach/draft-pack/' + id + '/submit', session.apiToken, {
      method: 'POST',
    })
    setActionResult(resultMessage(result))
    setConfirmSubmitPack(null)
    await load()
  }

  async function approveDraft(id: string) {
    if (!session) return
    setActionResult(null)
    const result = await apiFetch<ActionResult>('/outreach/drafts/' + id + '/approve', session.apiToken, {
      method: 'POST',
    })
    setActionResult(resultMessage(result))
    setConfirmApproving(null)
    await load()
  }

  async function rejectDraft(id: string) {
    if (!session) return
    setActionResult(null)
    const result = await apiFetch<ActionResult>('/outreach/drafts/' + id + '/reject', session.apiToken, {
      method: 'POST',
    })
    setActionResult(resultMessage(result))
    setConfirmRejecting(null)
    await load()
  }

  if (status !== 'authenticated') {
    return null
  }

  return (
    <SiteShell>
      {/* Header */}
      <Card className='mb-4'>
        <CardTitle>Outreach Autopilot</CardTitle>
        <CardDescription>
          Sandbox is ON by default. Draft packs group AI-generated SMS / email / voice drafts.
          Each pack requires explicit submission and per-draft human approval.
        </CardDescription>

        {actionResult ? (
          <p className='mt-3 text-sm text-muted-foreground' data-testid='action-result'>
            {actionResult}
          </p>
        ) : null}
      </Card>

      {/* Pack selector */}
      <Card className='mb-4'>
        <CardTitle className='mb-3'>Draft Packs</CardTitle>

        {loading ? <p className='text-sm text-muted-foreground'>Loading…</p> : null}

        {!loading && packs.length === 0 ? (
          <p className='text-sm text-muted-foreground' data-testid='empty-packs'>
            No draft packs yet. Run a copilot outreach command to generate one.
          </p>
        ) : null}

        <div className='space-y-2'>
          {packs.map((pack) => (
            <div
              key={pack.id}
              className={
                'cursor-pointer rounded-xl border p-3 text-sm transition-colors ' +
                (selectedPackId === pack.id ? 'border-accent bg-accent/5' : 'border-border hover:bg-muted/30')
              }
              onClick={() => {
                setSelectedPackId(pack.id)
                setConfirmApproving(null)
                setConfirmRejecting(null)
                setConfirmSubmitPack(null)
              }}
              data-testid={`pack-row-${pack.id}`}
            >
              <div className='flex items-start justify-between gap-2'>
                <div>
                  <p className='font-medium'>{pack.objective || 'Outreach draft'}</p>
                  <p className='text-xs text-muted-foreground'>
                    {pack.drafts.length} draft{pack.drafts.length !== 1 ? 's' : ''} ·{' '}
                    {new Date(pack.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className='flex flex-shrink-0 gap-1'>
                  <Badge
                    className={pack.status === 'submitted' ? 'bg-green-500/20 text-green-200' : 'bg-muted text-muted-foreground'}
                    data-testid='pack-status-badge'
                  >
                    {pack.status}
                  </Badge>
                  {pack.sandbox && (
                    <Badge className='bg-amber-500/20 text-amber-200' data-testid='sandbox-badge'>
                      sandbox
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Selected pack detail */}
      {selectedPack ? (
        <Card className='mb-4' data-testid='pack-detail'>
          <div className='mb-3 flex items-center justify-between gap-3'>
            <CardTitle>Pack Detail</CardTitle>
            <div className='flex gap-2'>
              <Badge
                className={selectedPack.status === 'submitted' ? 'bg-green-500/20 text-green-200' : ''}
              >
                {selectedPack.status}
              </Badge>
              {selectedPack.sandbox && (
                <Badge className='bg-amber-500/20 text-amber-200'>sandbox</Badge>
              )}
            </div>
          </div>

          {/* Submit pack — two-step */}
          {selectedPack.status !== 'submitted' ? (
            <div className='mb-4 flex gap-2'>
              {confirmSubmitPack === selectedPack.id ? (
                <>
                  <Button onClick={() => void submitPack(selectedPack.id)} data-testid='submit-confirm'>
                    Confirm Submit
                  </Button>
                  <Button variant='outline' onClick={() => setConfirmSubmitPack(null)} data-testid='submit-cancel'>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  variant='outline'
                  onClick={() => setConfirmSubmitPack(selectedPack.id)}
                  data-testid='submit-pack-btn'
                >
                  Submit Pack for Approval
                </Button>
              )}
            </div>
          ) : null}

          <Table>
            <thead>
              <tr>
                <Th>Channel</Th>
                <Th>Subject</Th>
                <Th>Body</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {selectedPack.drafts.map((draft) => (
                <tr key={draft.id} data-testid={`draft-row-${draft.id}`}>
                  <Td>
                    <Badge variant='outline'>{draft.channel}</Badge>
                  </Td>
                  <Td className='max-w-[120px] truncate'>{draft.subject ?? '—'}</Td>
                  <Td className='max-w-[240px]'>
                    <span title={draft.body}>{truncate(draft.body)}</span>
                  </Td>
                  <Td>
                    <DraftStatusBadge status={draft.status} />
                  </Td>
                  <Td>
                    {draft.status === 'draft' ? (
                      <div className='flex flex-wrap gap-2'>
                        {/* Approve: two-step */}
                        {confirmApproving === draft.id ? (
                          <>
                            <Button
                              onClick={() => void approveDraft(draft.id)}
                              data-testid='approve-confirm'
                            >
                              Confirm Approve
                            </Button>
                            <Button
                              variant='outline'
                              onClick={() => setConfirmApproving(null)}
                              data-testid='approve-cancel'
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button
                            onClick={() => {
                              setConfirmApproving(draft.id)
                              setConfirmRejecting(null)
                            }}
                            data-testid='approve-btn'
                          >
                            Approve
                          </Button>
                        )}

                        {/* Reject: two-step */}
                        {confirmRejecting === draft.id ? (
                          <>
                            <Button
                              variant='outline'
                              onClick={() => void rejectDraft(draft.id)}
                              data-testid='reject-confirm'
                            >
                              Confirm Reject
                            </Button>
                            <Button
                              variant='outline'
                              onClick={() => setConfirmRejecting(null)}
                              data-testid='reject-cancel'
                            >
                              Cancel
                            </Button>
                          </>
                        ) : confirmApproving !== draft.id ? (
                          <Button
                            variant='outline'
                            onClick={() => {
                              setConfirmRejecting(draft.id)
                              setConfirmApproving(null)
                            }}
                            data-testid='reject-btn'
                          >
                            Reject
                          </Button>
                        ) : null}
                      </div>
                    ) : (
                      <span className='text-xs text-muted-foreground'>—</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </SiteShell>
  )
}
