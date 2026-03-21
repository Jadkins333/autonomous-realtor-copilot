'use client'

import React, { useCallback, useEffect, useState } from 'react'
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

type SequenceStep = {
  id: string
  step_order: number
  delay_minutes: number
  channel: string
  template_subject?: string | null
  template_body: string
  stop_on_reply: boolean
}

type Sequence = {
  id: string
  key: string
  name: string
  description: string
  is_enabled: boolean
  sandbox_only: boolean
  steps: SequenceStep[]
}

type ContactOption = {
  id: string
  name: string
  email?: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDelay(minutes: number): string {
  if (minutes === 0) return 'immediately'
  if (minutes < 60) return `after ${minutes}m`
  const h = Math.floor(minutes / 60)
  const d = Math.floor(h / 24)
  if (d > 0) return `after ${d}d`
  return `after ${h}h`
}

function channelLabel(channel: string): string {
  return channel === 'sms' ? 'SMS' : channel.charAt(0).toUpperCase() + channel.slice(1)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SequencesPage() {
  const { status } = useRequireAuth()
  const { data: session } = useSession()

  const [sequences, setSequences] = useState<Sequence[]>([])
  const [loading, setLoading] = useState(true)

  // per-card expand state
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // enroll state: which card has the enroll form open
  const [enrollingId, setEnrollingId] = useState<string | null>(null)
  const [contacts, setContacts] = useState<ContactOption[]>([])
  const [contactsLoaded, setContactsLoaded] = useState(false)
  const [selectedContact, setSelectedContact] = useState<string>('')
  const [enrollPending, setEnrollPending] = useState(false)
  const [enrollResult, setEnrollResult] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    if (!session) return
    try {
      const data = await apiFetch<Sequence[]>('/sequences', session.apiToken)
      setSequences(data)
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    if (status === 'authenticated') void load()
  }, [status, load])

  async function openEnroll(seqId: string) {
    setEnrollingId(seqId)
    setSelectedContact('')
    setEnrollResult((prev) => ({ ...prev, [seqId]: '' }))
    if (!contactsLoaded && session) {
      const data = await apiFetch<ContactOption[]>('/contacts', session.apiToken)
      setContacts(data)
      setContactsLoaded(true)
    }
  }

  function cancelEnroll() {
    setEnrollingId(null)
    setSelectedContact('')
  }

  async function submitEnroll(seqId: string) {
    if (!session || !selectedContact) return
    setEnrollPending(true)
    try {
      await apiFetch(`/sequences/${seqId}/enroll/${selectedContact}`, session.apiToken, {
        method: 'POST',
      })
      setEnrollResult((prev) => ({ ...prev, [seqId]: '✓ Enrolled successfully' }))
      setEnrollingId(null)
      setSelectedContact('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Enrollment failed'
      setEnrollResult((prev) => ({ ...prev, [seqId]: `Error: ${msg}` }))
      setEnrollingId(null)
    } finally {
      setEnrollPending(false)
    }
  }

  function toggleExpand(seqId: string) {
    setExpanded((prev) => ({ ...prev, [seqId]: !prev[seqId] }))
  }

  if (status !== 'authenticated') return null

  return (
    <SiteShell>
      <div className='mb-6'>
        <h1 className='text-2xl font-bold tracking-tight'>Sequences</h1>
        <p className='mt-1 text-sm text-muted-foreground'>
          Automated nurture drip campaigns — enroll contacts to trigger timed outreach.
        </p>
      </div>

      {loading ? (
        <div className='space-y-3' data-testid='sequences-loading'>
          {[1, 2].map((i) => (
            <div key={i} className='h-28 animate-pulse rounded-2xl bg-muted' />
          ))}
        </div>
      ) : sequences.length === 0 ? (
        <Card data-testid='empty-sequences'>
          <CardTitle className='mb-1'>No sequences configured</CardTitle>
          <CardDescription>
            Sequences are created through the admin CLI. Check the setup guide to add your first
            drip campaign.
          </CardDescription>
        </Card>
      ) : (
        <div className='space-y-4'>
          {sequences.map((seq) => {
            const isOpen = expanded[seq.id] ?? false
            const result = enrollResult[seq.id]
            return (
              <Card key={seq.id} data-testid={`sequence-card-${seq.key}`} className='transition-shadow hover:shadow-md'>
                {/* Header row */}
                <div className='flex flex-wrap items-start justify-between gap-3'>
                  <div className='min-w-0 flex-1'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <CardTitle className='text-base'>{seq.name}</CardTitle>
                      {!seq.is_enabled && (
                        <Badge className='bg-muted text-muted-foreground'>Disabled</Badge>
                      )}
                      {seq.sandbox_only && (
                        <Badge className='bg-amber-100 text-amber-800'>Sandbox</Badge>
                      )}
                      <Badge variant='outline' className='text-xs'>
                        {seq.steps.length} {seq.steps.length === 1 ? 'step' : 'steps'}
                      </Badge>
                    </div>
                    <CardDescription className='mt-1'>{seq.description}</CardDescription>
                  </div>

                  <div className='flex shrink-0 gap-2'>
                    <Button
                      variant='ghost'
                      className='text-xs'
                      onClick={() => toggleExpand(seq.id)}
                      aria-expanded={isOpen}
                    >
                      {isOpen ? 'Hide steps ▲' : 'Show steps ▼'}
                    </Button>
                    {enrollingId !== seq.id && (
                      <Button
                        variant='outline'
                        className='text-xs'
                        onClick={() => openEnroll(seq.id)}
                        data-testid={`enroll-btn-${seq.id}`}
                        disabled={!seq.is_enabled}
                      >
                        Enroll Contact
                      </Button>
                    )}
                  </div>
                </div>

                {/* Steps — collapsible */}
                <div
                  data-testid={`sequence-steps-${seq.id}`}
                  className={[
                    'overflow-hidden transition-all duration-200 ease-in-out',
                    isOpen ? 'mt-4 max-h-[600px] opacity-100' : 'max-h-0 opacity-0',
                  ].join(' ')}
                  aria-hidden={!isOpen}
                >
                  <ol className='space-y-2 border-l-2 border-muted pl-4'>
                    {seq.steps.map((step) => (
                      <li key={step.id} className='relative text-sm'>
                        <span className='absolute -left-[1.15rem] top-1 h-2 w-2 rounded-full bg-muted-foreground/40' />
                        <div className='flex flex-wrap items-center gap-2'>
                          <Badge variant='outline' className='text-xs capitalize'>
                            {channelLabel(step.channel)}
                          </Badge>
                          <span className='text-xs text-muted-foreground'>
                            {formatDelay(step.delay_minutes)}
                          </span>
                          {step.stop_on_reply && (
                            <span className='text-xs text-muted-foreground'>· stops on reply</span>
                          )}
                        </div>
                        {step.template_subject && (
                          <p className='mt-0.5 font-medium text-foreground'>{step.template_subject}</p>
                        )}
                        <p className='mt-0.5 line-clamp-2 text-muted-foreground'>
                          {step.template_body}
                        </p>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Enroll form */}
                {enrollingId === seq.id && (
                  <div className='mt-4 rounded-xl bg-muted/50 p-4' data-testid={`enroll-confirm-${seq.id}`}>
                    <p className='mb-3 text-sm font-medium'>Choose a contact to enroll</p>
                    <div className='flex flex-wrap items-center gap-2'>
                      <select
                        className='flex-1 rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring'
                        value={selectedContact}
                        onChange={(e) => setSelectedContact(e.target.value)}
                        data-testid={`enroll-contact-select-${seq.id}`}
                      >
                        <option value=''>— select contact —</option>
                        {contacts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}{c.email ? ` (${c.email})` : ''}
                          </option>
                        ))}
                      </select>
                      <Button
                        onClick={() => submitEnroll(seq.id)}
                        disabled={!selectedContact || enrollPending}
                        className='text-sm'
                      >
                        {enrollPending ? 'Enrolling…' : 'Confirm Enroll'}
                      </Button>
                      <Button variant='ghost' className='text-sm' onClick={cancelEnroll}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Enroll result */}
                {result && (
                  <p
                    className={[
                      'mt-3 text-sm',
                      result.startsWith('Error') ? 'text-red-500' : 'text-green-600',
                    ].join(' ')}
                    data-testid={`enroll-result-${seq.id}`}
                  >
                    {result}
                  </p>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </SiteShell>
  )
}
