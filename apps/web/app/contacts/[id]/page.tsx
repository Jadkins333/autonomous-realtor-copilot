'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'

import { useRequireAuth } from '@/components/auth-guard'
import { SiteShell } from '@/components/site-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, Td, Th } from '@/components/ui/table'
import { apiFetch } from '@/lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ContactDetail = {
  id: string
  name: string
  email: string | null
  phone: string | null
  tags_json: string[]
  notes: string | null
  created_at: string
}

type MessageRow = {
  id: string
  channel: string
  direction: string
  status: string
  subject: string | null
  body_preview: string
  created_at: string
  sent_at: string | null
}

type EnrollmentRow = {
  id: string
  sequence_id: string
  sequence_name: string
  state: string
  enrolled_at: string
  next_step_at: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'just now'
  const m = Math.floor(diff / 60_000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function statusColor(status: string): string {
  if (status === 'sent' || status === 'delivered') return 'bg-green-100 text-green-800'
  if (status === 'failed' || status.startsWith('blocked')) return 'bg-red-100 text-red-800'
  if (status === 'queued') return 'bg-blue-100 text-blue-800'
  return 'bg-muted text-muted-foreground'
}

function enrollStateColor(state: string): string {
  if (state === 'active') return 'bg-green-100 text-green-800'
  if (state === 'completed') return 'bg-muted text-muted-foreground'
  if (state === 'stopped') return 'bg-red-100 text-red-800'
  if (state === 'paused') return 'bg-amber-100 text-amber-800'
  return 'bg-muted text-muted-foreground'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ContactDetailPage() {
  const { status } = useRequireAuth()
  const { data: session } = useSession()
  const params = useParams<{ id: string }>()

  // Contact overview
  const [contact, setContact] = useState<ContactDetail | null>(null)
  const [contactError, setContactError] = useState(false)

  // Edit mode
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [savePending, setSavePending] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  // Messages section — independent loading/error
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [messagesLoading, setMessagesLoading] = useState(true)
  const [messagesError, setMessagesError] = useState(false)

  // Enrollments section — independent loading/error
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([])
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(true)
  const [enrollmentsError, setEnrollmentsError] = useState(false)

  // Fetch all three in parallel, each fails independently
  useEffect(() => {
    if (status !== 'authenticated' || !session || !params.id) return
    const { id } = params
    const token = session.apiToken

    apiFetch<ContactDetail>(`/contacts/${id}`, token)
      .then(setContact)
      .catch(() => setContactError(true))

    apiFetch<MessageRow[]>(`/contacts/${id}/messages`, token)
      .then(setMessages)
      .catch(() => setMessagesError(true))
      .finally(() => setMessagesLoading(false))

    apiFetch<EnrollmentRow[]>(`/contacts/${id}/enrollments`, token)
      .then(setEnrollments)
      .catch(() => setEnrollmentsError(true))
      .finally(() => setEnrollmentsLoading(false))
  }, [status, session, params])

  function startEdit() {
    if (!contact) return
    setEditName(contact.name)
    setEditEmail(contact.email ?? '')
    setEditPhone(contact.phone ?? '')
    setSaveMsg(null)
    setEditing(true)
  }

  async function saveEdit() {
    if (!session || !contact) return
    setSavePending(true)
    try {
      const updated = await apiFetch<ContactDetail>(
        `/contacts/${contact.id}`,
        session.apiToken,
        {
          method: 'PUT',
          body: JSON.stringify({
            name: editName,
            email: editEmail || null,
            phone: editPhone || null,
          }),
        }
      )
      setContact(updated)
      setEditing(false)
      setSaveMsg('Changes saved.')
    } catch {
      setSaveMsg('Save failed — please try again.')
    } finally {
      setSavePending(false)
    }
  }

  if (status !== 'authenticated') return null

  return (
    <SiteShell>
      {/* Back nav */}
      <div className='mb-4'>
        <Link href='/contacts' className='text-sm text-muted-foreground hover:text-foreground'>
          ← Contacts
        </Link>
      </div>

      {/* Contact overview card */}
      {contactError ? (
        <Card className='mb-6'>
          <p className='text-sm text-red-500'>Unable to load contact. It may not exist or you may not have access.</p>
        </Card>
      ) : !contact ? (
        <Card className='mb-6'>
          <div className='h-6 w-48 animate-pulse rounded bg-muted' />
          <div className='mt-2 h-4 w-64 animate-pulse rounded bg-muted' />
        </Card>
      ) : (
        <Card className='mb-6'>
          <div className='flex flex-wrap items-start justify-between gap-4'>
            <div>
              {editing ? (
                <div className='space-y-2'>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder='Name'
                    className='max-w-xs font-semibold'
                    data-testid='contact-name-input-edit'
                  />
                  <div className='flex gap-2'>
                    <Input
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder='Email'
                      className='max-w-xs'
                    />
                    <Input
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder='Phone'
                      className='max-w-xs'
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <h1 className='text-xl font-bold' data-testid='contact-name'>
                    {contact.name}
                  </h1>
                  <div className='mt-1 flex flex-wrap gap-4 text-sm text-muted-foreground'>
                    {contact.email && <span>{contact.email}</span>}
                    {contact.phone && <span>{contact.phone}</span>}
                    {!contact.email && !contact.phone && <span>No contact info</span>}
                  </div>
                  {contact.tags_json.length > 0 && (
                    <div className='mt-2 flex flex-wrap gap-1'>
                      {contact.tags_json.map((tag) => (
                        <Badge key={tag} variant='outline' className='text-xs'>
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {contact.notes && (
                    <p className='mt-2 text-sm text-muted-foreground'>{contact.notes}</p>
                  )}
                </div>
              )}
            </div>
            <div className='flex gap-2'>
              {editing ? (
                <>
                  <Button onClick={saveEdit} disabled={savePending} data-testid='contact-save'>
                    {savePending ? 'Saving…' : 'Save'}
                  </Button>
                  <Button variant='ghost' onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button variant='outline' onClick={startEdit} data-testid='edit-btn'>
                  Edit
                </Button>
              )}
            </div>
          </div>
          {saveMsg && (
            <p
              className={['mt-3 text-sm', saveMsg.startsWith('Save failed') ? 'text-red-500' : 'text-green-600'].join(' ')}
            >
              {saveMsg}
            </p>
          )}
        </Card>
      )}

      {/* Outreach history */}
      <Card className='mb-6'>
        <CardTitle className='mb-1 text-base'>Outreach History</CardTitle>
        <CardDescription className='mb-4'>Messages sent to or received from this contact.</CardDescription>

        {messagesLoading ? (
          <div className='space-y-2'>
            {[1, 2].map((i) => (
              <div key={i} className='h-8 animate-pulse rounded bg-muted' />
            ))}
          </div>
        ) : messagesError ? (
          <p className='text-sm text-muted-foreground'>Unable to load message history.</p>
        ) : messages.length === 0 ? (
          <p className='text-sm text-muted-foreground' data-testid='no-messages'>
            No messages yet.
          </p>
        ) : (
          <Table data-testid='messages-table'>
            <thead>
              <tr>
                <Th>Channel</Th>
                <Th>Status</Th>
                <Th>Subject / Preview</Th>
                <Th>Sent</Th>
              </tr>
            </thead>
            <tbody>
              {messages.map((msg) => (
                <tr key={msg.id} data-testid={`message-row-${msg.id}`}>
                  <Td>
                    <Badge variant='outline' className='text-xs capitalize'>
                      {msg.channel}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge className={['text-xs', statusColor(msg.status)].join(' ')}>
                      {msg.status}
                    </Badge>
                  </Td>
                  <Td className='max-w-[300px]'>
                    {msg.subject && (
                      <p className='truncate font-medium'>{msg.subject}</p>
                    )}
                    <p className='truncate text-xs text-muted-foreground'>{msg.body_preview}</p>
                  </Td>
                  <Td className='whitespace-nowrap text-xs text-muted-foreground'>
                    {relativeTime(msg.sent_at ?? msg.created_at)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Sequence enrollments */}
      <Card>
        <CardTitle className='mb-1 text-base'>Sequence Enrollments</CardTitle>
        <CardDescription className='mb-4'>Automated drip campaigns this contact is part of.</CardDescription>

        {enrollmentsLoading ? (
          <div className='space-y-2'>
            {[1].map((i) => (
              <div key={i} className='h-8 animate-pulse rounded bg-muted' />
            ))}
          </div>
        ) : enrollmentsError ? (
          <p className='text-sm text-muted-foreground'>Unable to load enrollment history.</p>
        ) : enrollments.length === 0 ? (
          <p className='text-sm text-muted-foreground' data-testid='no-enrollments'>
            Not enrolled in any sequences.{' '}
            <Link href='/sequences' className='text-accent underline'>
              Go to Sequences
            </Link>{' '}
            to enroll.
          </p>
        ) : (
          <ul className='space-y-2' data-testid='enrollments-list'>
            {enrollments.map((enr) => (
              <li
                key={enr.id}
                data-testid={`enrollment-row-${enr.id}`}
                className='flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-4 py-3'
              >
                <div>
                  <p className='font-medium'>{enr.sequence_name}</p>
                  <p className='text-xs text-muted-foreground'>
                    Enrolled {relativeTime(enr.enrolled_at)}
                    {enr.next_step_at && ` · next step ${relativeTime(enr.next_step_at)}`}
                  </p>
                </div>
                <Badge className={['text-xs capitalize', enrollStateColor(enr.state)].join(' ')}>
                  {enr.state}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </SiteShell>
  )
}
