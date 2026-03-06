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
      {status.replace(/_/g, ' ')}
    </Badge>
  )
}

function truncate(text: string, max = 120): string {
  return text.length > max ? text.slice(0, max) + '…' : text
}

function resultMessage(result: ActionResult): string {
  if (typeof result.status === 'string') {
    const parts: string[] = [result.status as string]
    if (typeof result.reason === 'string') parts.push(result.reason as string)
    if (typeof result.message === 'string') parts.push(result.message as string)
    return parts.join(' — ')
  }
  return JSON.stringify(result)
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

  // Two-step confirm states
  const [confirmApproving, setConfirmApproving] = useState<string | null>(null)
  const [confirmRejecting, setConfirmRejecting] = useState<string | null>(null)
  const [confirmSubmitPack, setConfirmSubmitPack] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!session) return
    setLoading(true)
    try {
      const packRows = await apiFetch<DraftPackList>(
        '/outreach/draft-packs?limit=20',
        session.apiToken,
      )
      setPacks(packRows.items || [])
      setSelectedPackId((current) => current || packRows.items?.[0]?.id || null)
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    void load()
  }, [load])

  const selectedPack = useMemo(
    () => packs.find((pack) => pack.id === selectedPackId) || null,
    [packs, selectedPackId],
  )

  async function submitPack(id: string) {
    if (!session) return
    const result = await apiFetch<ActionResult>(
      '/outreach/draft-pack/' + id + '/submit',
      session.apiToken,
      { method: 'POST' },
    )
    setActionResult(resultMessage(result))
    setConfirmSubmitPack(null)
    await load()
  }

  async function approveDraft(id: string) {
    if (!session) return
    const result = await apiFetch<ActionResult>(
      '/outreach/drafts/' + id + '/approve',
      session.apiToken,
      { method: 'POST' },
    )
    setActionResult(resultMessage(result))
    setConfirmApproving(null)
    await load()
  }

  async function rejectDraft(id: string) {
    if (!session) return
    const result = await apiFetch<ActionResult>(
      '/outreach/drafts/' + id + '/reject',
      session.apiToken,
      { method: 'POST' },
    )
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
          Sandbox is ON by default. Draft packs group SMS/email/voice drafts and require explicit
          submission and approval.
        </CardDescription>
        {actionResult ? (
          <p className='mt-3 text-sm text-muted-foreground' data-testid='action-result'>
            {actionResult}
          </p>
        ) : null}
      </Card>

      {/* Draft Packs list */}
      <Card className='mb-4' data-testid='packs-card'>
        <CardTitle className='mb-3'>Draft Packs</CardTitle>
        {loading ? (
          <p className='text-sm text-muted-foreground' data-testid='packs-loading'>
            Loading…
          </p>
        ) : (
          <div className='space-y-2'>
            {packs.map((pack) => (
              <div
                key={pack.id}
                className={
                  'cursor-pointer rounded-xl border p-3 text-sm ' +
                  (selectedPackId === pack.id ? 'border-accent' : 'border-border')
                }
                onClick={() => setSelectedPackId(pack.id)}
                data-testid={`pack-item-${pack.id}`}
              >
                <div className='flex flex-wrap items-center gap-2'>
                  <p className='font-medium'>
                    Pack {pack.id.slice(0, 8)} — {pack.objective}
                  </p>
                  <DraftStatusBadge status={pack.status} />
                  {pack.sandbox && (
                    <Badge
                      className='bg-amber-500/20 text-amber-200'
                      data-testid={`sandbox-badge-${pack.id}`}
                    >
                      sandbox
                    </Badge>
                  )}
                </div>
                <p className='mt-1 text-xs text-muted-foreground'>drafts: {pack.drafts.length}</p>
              </div>
            ))}
            {packs.length === 0 ? (
              <p className='text-sm text-muted-foreground' data-testid='no-packs'>
                No draft packs yet.
              </p>
            ) : null}
          </div>
        )}
      </Card>

      {/* Pack detail */}
      {selectedPack ? (
        <Card className='mb-4' data-testid='pack-detail-card'>
          <CardTitle className='mb-2'>Pack Detail</CardTitle>
          <p className='mb-1 text-sm text-muted-foreground'>
            Status: <DraftStatusBadge status={selectedPack.status} />
          </p>

          {/* Submit pack — two-step */}
          <div className='mb-3 flex gap-2'>
            {confirmSubmitPack === selectedPack.id ? (
              <>
                <Button
                  onClick={() => void submitPack(selectedPack.id)}
                  data-testid='submit-pack-confirm'
                >
                  Confirm Submit
                </Button>
                <Button
                  variant='outline'
                  onClick={() => setConfirmSubmitPack(null)}
                  data-testid='submit-pack-cancel'
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                variant='outline'
                onClick={() => setConfirmSubmitPack(selectedPack.id)}
                data-testid='submit-pack-btn'
              >
                Submit Pack
              </Button>
            )}
          </div>

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
                  <Td>{draft.channel}</Td>
                  <Td>{draft.subject ?? '—'}</Td>
                  <Td>{truncate(draft.body)}</Td>
                  <Td>
                    <DraftStatusBadge status={draft.status} />
                  </Td>
                  <Td>
                    {/* Approve — two-step */}
                    {confirmApproving === draft.id ? (
                      <div className='flex gap-2' data-testid='approve-confirm-row'>
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
                      </div>
                    ) : confirmRejecting === draft.id ? (
                      <div className='flex gap-2' data-testid='reject-confirm-row'>
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
                      </div>
                    ) : (
                      <div className='flex gap-2'>
                        <Button
                          onClick={() => {
                            setConfirmApproving(draft.id)
                            setConfirmRejecting(null)
                          }}
                          data-testid={`approve-btn-${draft.id}`}
                        >
                          Approve
                        </Button>
                        <Button
                          variant='outline'
                          onClick={() => {
                            setConfirmRejecting(draft.id)
                            setConfirmApproving(null)
                          }}
                          data-testid={`reject-btn-${draft.id}`}
                        >
                          Reject
                        </Button>
                      </div>
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
