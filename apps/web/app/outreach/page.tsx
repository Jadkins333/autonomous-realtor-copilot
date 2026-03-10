'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'

import { useRequireAuth } from '@/components/auth-guard'
import { SiteShell } from '@/components/site-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { Table, Td, Th } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { apiFetch } from '@/lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ContactRow = {
  id: string
  name: string
  email: string | null
}

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

type VoiceStatus = {
  available: boolean
  provider?: string | null
  reason?: string | null
}

type ActionResult = Record<string, unknown>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-blue-500/20 text-blue-200',
  queued: 'bg-sky-500/20 text-sky-200',
  initiated: 'bg-sky-500/20 text-sky-200',
  ringing: 'bg-amber-500/20 text-amber-200',
  in_progress: 'bg-amber-500/20 text-amber-200',
  blocked_sandbox: 'bg-amber-500/20 text-amber-200',
  sent: 'bg-green-500/20 text-green-200',
  delivered: 'bg-green-500/20 text-green-200',
  completed: 'bg-green-500/20 text-green-200',
  busy: 'bg-amber-500/20 text-amber-200',
  no_answer: 'bg-amber-500/20 text-amber-200',
  canceled: 'bg-muted text-muted-foreground',
  blocked: 'bg-red-500/20 text-red-200',
  failed: 'bg-red-500/20 text-red-200',
  rejected: 'bg-muted text-muted-foreground',
  unavailable: 'bg-red-500/20 text-red-200',
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

function channelLabel(channel: string): string {
  if (channel === 'voice') return 'voice call'
  return channel
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

  // Compose form state
  const [showCompose, setShowCompose] = useState(false)
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [composeContact, setComposeContact] = useState('')
  const [composeParcel, setComposeParcel] = useState('')
  const [composeObjective, setComposeObjective] = useState('')
  const [composeChannels, setComposeChannels] = useState<string[]>(['email'])
  const [composing, setComposing] = useState(false)
  const [composeError, setComposeError] = useState<string | null>(null)
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>({
    available: false,
    provider: null,
    reason: 'Voice calls are unavailable until Twilio Voice is configured.',
  })
  const [voiceStatusLoaded, setVoiceStatusLoaded] = useState(false)

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

  // Fetch contacts when compose form is opened (lazy to avoid breaking other flows)
  useEffect(() => {
    if (!showCompose || !session || contacts.length > 0) return
    apiFetch<ContactRow[]>('/contacts', session.apiToken)
      .then(setContacts)
      .catch(() => setContacts([]))
  }, [showCompose, session, contacts.length])

  async function createDraftPack() {
    if (!session || !composeContact || !composeObjective || composeChannels.length === 0) return
    setComposing(true)
    setComposeError(null)
    try {
      const pack = await apiFetch<DraftPackRow>('/outreach/draft-pack', session.apiToken, {
        method: 'POST',
        body: JSON.stringify({
          contact_id: composeContact,
          parcel_id: composeParcel || null,
          objective: composeObjective,
          channels: composeChannels,
          sandbox: true,
        }),
      })
      setShowCompose(false)
      setComposeContact('')
      setComposeParcel('')
      setComposeObjective('')
      setComposeChannels(['email'])
      await load()
      setSelectedPackId(pack.id)
      setActionResult('Draft pack created: ' + pack.id.slice(0, 8))
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : 'Failed to create draft pack')
    } finally {
      setComposing(false)
    }
  }

  function toggleChannel(ch: string) {
    setComposeChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch],
    )
  }

  const selectedPack = useMemo(
    () => packs.find((pack) => pack.id === selectedPackId) || null,
    [packs, selectedPackId],
  )
  const selectedPackHasVoiceDraft = useMemo(
    () => Boolean(selectedPack?.drafts.some((draft) => draft.channel === 'voice')),
    [selectedPack],
  )

  useEffect(() => {
    if (!session || (!showCompose && !selectedPackHasVoiceDraft) || voiceStatusLoaded) return
    apiFetch<VoiceStatus>('/outreach/voice-status', session.apiToken)
      .then((statusPayload) => {
        setVoiceStatus(statusPayload)
        setVoiceStatusLoaded(true)
      })
      .catch((err) => {
        setVoiceStatus({
          available: false,
          provider: null,
          reason: err instanceof Error ? err.message : 'Voice calls are unavailable right now.',
        })
        setVoiceStatusLoaded(true)
      })
  }, [session, selectedPackHasVoiceDraft, showCompose, voiceStatusLoaded])

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
      <PageHeader
        eyebrow='Approval queue'
        title='Outreach'
        description='Draft packs stage outbound work for deterministic review. Voice availability only appears when the server reports a real Twilio path, and approval never overrides server send authority.'
        meta={
          <>
            <Badge variant='outline'>{packs.length} draft pack{packs.length === 1 ? '' : 's'}</Badge>
            <span>
              {voiceStatus.available
                ? 'Voice ready for real approval attempts'
                : `Voice unavailable: ${voiceStatus.reason}`}
            </span>
          </>
        }
      />

      {actionResult ? (
        <Card className='mb-4'>
          <p
            className='text-sm text-muted-foreground'
            data-testid='action-result'
            aria-live='polite'
          >
            {actionResult}
          </p>
        </Card>
      ) : null}

      {/* Compose new draft pack */}
      <Card className='mb-4' data-testid='compose-card'>
        <div className='flex items-center justify-between'>
          <CardTitle>New Outreach</CardTitle>
          <Button
            variant='outline'
            onClick={() => {
              setShowCompose((v) => !v)
              setComposeError(null)
            }}
            data-testid='compose-toggle'
          >
            {showCompose ? 'Cancel' : '+ Compose'}
          </Button>
        </div>

        {showCompose ? (
          <form
            className='mt-4 space-y-4'
            data-testid='compose-form'
            onSubmit={(event) => {
              event.preventDefault()
              void createDraftPack()
            }}
          >
            <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr),minmax(0,0.9fr)]'>
              <div className='space-y-4'>
                <div>
                  <label className='mb-1 block text-xs text-muted-foreground'>Contact *</label>
                  <select
                    className='h-11 w-full rounded-2xl border border-input/80 bg-white/90 px-4 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] transition-all duration-200 hover:border-border'
                    value={composeContact}
                    onChange={(e) => setComposeContact(e.target.value)}
                    data-testid='compose-contact'
                  >
                    <option value=''>— select contact —</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.email ? ` (${c.email})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className='mb-1 block text-xs text-muted-foreground'>Parcel ID (optional)</label>
                  <Input
                    placeholder='UUID of parcel'
                    value={composeParcel}
                    onChange={(e) => setComposeParcel(e.target.value)}
                    data-testid='compose-parcel'
                  />
                </div>

                <div>
                  <label className='mb-1 block text-xs text-muted-foreground'>Objective *</label>
                  <Textarea
                    rows={3}
                    placeholder='e.g. Introduce myself and ask about selling timeline'
                    value={composeObjective}
                    onChange={(e) => setComposeObjective(e.target.value)}
                    data-testid='compose-objective'
                  />
                </div>
              </div>

              <div className='app-panel-muted px-4 py-4'>
                <fieldset>
                  <legend className='section-label'>Channels *</legend>
                  <div className='mt-3 flex flex-wrap gap-3 text-sm' data-testid='compose-channels'>
                    {(['email', 'sms'] as string[])
                      .concat(voiceStatus.available ? ['voice'] : [])
                      .map((ch) => (
                      <label
                        key={ch}
                        className='flex items-center gap-2 rounded-full border border-border/70 bg-white/75 px-3 py-2'
                      >
                        <input
                          type='checkbox'
                          checked={composeChannels.includes(ch)}
                          onChange={() => toggleChannel(ch)}
                          data-testid={`compose-channel-${ch}`}
                        />
                        {channelLabel(ch)}
                      </label>
                    ))}
                  </div>
                </fieldset>

                {voiceStatus.available ? (
                  <p className='mt-4 text-sm text-muted-foreground' data-testid='voice-available-note'>
                    Voice calls use approved scripts, signed Twilio callbacks, and still depend on deterministic approval.
                  </p>
                ) : (
                  <p className='mt-4 text-sm text-muted-foreground' data-testid='voice-unavailable-note'>
                    Voice call channel unavailable: {voiceStatus.reason}
                  </p>
                )}
              </div>
            </div>

            {composeError ? (
              <p className='text-xs text-red-400' data-testid='compose-error' aria-live='polite'>
                {composeError}
              </p>
            ) : null}

            <Button
              disabled={composing || !composeContact || !composeObjective || composeChannels.length === 0}
              data-testid='compose-submit'
              type='submit'
            >
              {composing ? 'Creating…' : 'Create Draft Pack'}
            </Button>
          </form>
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
              <button
                key={pack.id}
                type='button'
                className={
                  'w-full rounded-xl border p-3 text-left text-sm transition-all ' +
                  (selectedPackId === pack.id ? 'border-accent shadow-soft' : 'border-border hover:border-primary/20')
                }
                onClick={() => setSelectedPackId(pack.id)}
                aria-pressed={selectedPackId === pack.id}
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
                      draft staging
                    </Badge>
                  )}
                </div>
                <p className='mt-1 text-xs text-muted-foreground'>drafts: {pack.drafts.length}</p>
                {pack.sandbox ? (
                  <p
                    className='text-xs text-muted-foreground'
                    data-testid={`sandbox-note-${pack.id}`}
                  >
                    Real sends still depend on server sandbox mode.
                  </p>
                ) : null}
              </button>
            ))}
            {packs.length === 0 ? (
              <EmptyState
                title='No draft packs yet'
                description='Create a new pack to stage reviewed outreach. Approval still routes through deterministic compliance before any send attempt.'
                action={
                  <span className='sr-only' data-testid='no-packs'>
                    No draft packs yet.
                  </span>
                }
                className='border-none bg-card-muted/65 shadow-none'
              />
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

          <div className='space-y-3 md:hidden'>
            {selectedPack.drafts.map((draft) => (
              <article
                key={draft.id}
                className='app-panel-muted px-4 py-4'
                data-testid={`draft-card-${draft.id}`}
              >
                <div className='flex flex-wrap items-center justify-between gap-3'>
                  <Badge variant='outline' className='text-xs capitalize'>
                    {channelLabel(draft.channel)}
                  </Badge>
                  <DraftStatusBadge status={draft.status} />
                </div>
                <p className='mt-3 font-semibold text-foreground'>
                  {draft.subject ?? 'Voice script'}
                </p>
                <p className='mt-2 text-sm leading-6 text-muted-foreground'>
                  {truncate(draft.body)}
                </p>
                <div className='mt-4'>
                  {draft.channel === 'voice' && !voiceStatus.available ? (
                    <p
                      className='text-xs text-muted-foreground'
                      data-testid={`voice-disabled-${draft.id}`}
                    >
                      Voice unavailable: {voiceStatus.reason}
                    </p>
                  ) : confirmApproving === draft.id ? (
                    <div className='flex flex-wrap gap-2' data-testid='approve-confirm-row'>
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
                    <div className='flex flex-wrap gap-2' data-testid='reject-confirm-row'>
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
                    <div className='flex flex-wrap gap-2'>
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
                </div>
              </article>
            ))}
          </div>

          <div className='hidden md:block'>
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
                    <Td>{channelLabel(draft.channel)}</Td>
                    <Td>{draft.subject ?? '—'}</Td>
                    <Td>{truncate(draft.body)}</Td>
                    <Td>
                      <DraftStatusBadge status={draft.status} />
                    </Td>
                    <Td>
                      {draft.channel === 'voice' && !voiceStatus.available ? (
                        <p
                          className='text-xs text-muted-foreground'
                          data-testid={`voice-disabled-${draft.id}`}
                        >
                          Voice unavailable: {voiceStatus.reason}
                        </p>
                      ) : confirmApproving === draft.id ? (
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
          </div>
        </Card>
      ) : null}
    </SiteShell>
  )
}
