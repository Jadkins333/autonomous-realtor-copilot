'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'

import { useRequireAuth } from '@/components/auth-guard'
import { SiteShell } from '@/components/site-shell'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Table, Td, Th } from '@/components/ui/table'
import { apiFetch } from '@/lib/api'

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

export default function OutreachPage() {
 const { status } = useRequireAuth()
 const { data: session } = useSession()
 const [rows, setRows] = useState<DraftRow[]>([])
 const [packs, setPacks] = useState<DraftPackRow[]>([])
 const [selectedPackId, setSelectedPackId] = useState<string | null>(null)
 const [actionResult, setActionResult] = useState<string | null>(null)

 const load = useCallback(async () => {
 if (!session) return
 const [draftRows, packRows] = await Promise.all([
 apiFetch<DraftRow[]>('/outreach/drafts', session.apiToken),
 apiFetch<DraftPackList>('/outreach/draft-packs?limit=20', session.apiToken)
 ])
 setRows(draftRows)
 setPacks(packRows.items || [])
 setSelectedPackId((current) => current || packRows.items?.[0]?.id || null)
 }, [session])

 async function approveLegacy(id: string) {
 if (!session) return
 if (typeof navigator !== 'undefined' && !navigator.onLine) {
 setActionResult(JSON.stringify({ status: 'blocked_offline', reason: 'Offline mode disables write actions.' }))
 return
 }
 const result = await apiFetch<ActionResult>('/outreach/' + id + '/approve_and_send', session.apiToken, {
 method: 'POST'
 })
 setActionResult(JSON.stringify(result))
 await load()
 }

 async function submitPack(id: string) {
 if (!session) return
 const result = await apiFetch<ActionResult>('/outreach/draft-pack/' + id + '/submit', session.apiToken, {
 method: 'POST'
 })
 setActionResult(JSON.stringify(result))
 await load()
 }

 async function approveDraft(id: string) {
 if (!session) return
 const result = await apiFetch<ActionResult>('/outreach/drafts/' + id + '/approve', session.apiToken, {
 method: 'POST'
 })
 setActionResult(JSON.stringify(result))
 await load()
 }

 async function rejectDraft(id: string) {
 if (!session) return
 const result = await apiFetch<ActionResult>('/outreach/drafts/' + id + '/reject', session.apiToken, {
 method: 'POST'
 })
 setActionResult(JSON.stringify(result))
 await load()
 }

 useEffect(() => {
 void load()
 }, [load])

 const selectedPack = useMemo(() => packs.find((pack) => pack.id === selectedPackId) || null, [packs, selectedPackId])

 if (status !== 'authenticated') {
 return null
 }

 return (
 <SiteShell>
 <Card className='mb-4'>
 <CardTitle>Outreach Autopilot</CardTitle>
 <CardDescription>
 Sandbox is ON by default. Draft packs group SMS/email/voice drafts and require explicit submission and
 approval.
 </CardDescription>
 {actionResult ? (
 <pre className='mt-3 overflow-auto rounded-xl bg-muted p-3 text-xs'>{actionResult}</pre>
 ) : null}
 </Card>

 <Card className='mb-4'>
 <CardTitle className='mb-3'>Draft Packs</CardTitle>
 <div className='space-y-2'>
 {packs.map((pack) => (
 <div
 key={pack.id}
 className={'cursor-pointer rounded-xl border p-3 text-sm ' + (selectedPackId === pack.id ? 'border-accent' : 'border-border')}
 onClick={() => setSelectedPackId(pack.id)}
 >
 <p className='font-medium'>
 Pack {pack.id.slice(0, 8)} - {pack.status}
 </p>
 <p className='text-muted-foreground'>{pack.objective}</p>
 <p className='text-xs text-muted-foreground'>drafts: {pack.drafts.length}</p>
 </div>
 ))}
 {packs.length === 0 ? <p className='text-sm text-muted-foreground'>No draft packs yet.</p> : null}
 </div>
 </Card>

 {selectedPack ? (
 <Card className='mb-4'>
 <CardTitle className='mb-2'>Pack Detail</CardTitle>
 <p className='mb-3 text-sm text-muted-foreground'>Status: {selectedPack.status}</p>
 <Button className='mb-3' onClick={() => submitPack(selectedPack.id)}>
 Submit Pack
 </Button>
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
 <tr key={draft.id}>
 <Td>{draft.channel}</Td>
 <Td>{draft.subject ?? '-'}</Td>
 <Td>{draft.body}</Td>
 <Td>{draft.status}</Td>
 <Td>
 <div className='flex gap-2'>
 <Button onClick={() => approveDraft(draft.id)}>Approve</Button>
 <Button variant='outline' onClick={() => rejectDraft(draft.id)}>
 Reject
 </Button>
 </div>
 </Td>
 </tr>
 ))}
 </tbody>
 </Table>
 </Card>
 ) : null}

 <Card>
 <CardTitle className='mb-2'>Legacy Draft Queue</CardTitle>
 <Table>
 <thead>
 <tr>
 <Th>Channel</Th>
 <Th>Subject</Th>
 <Th>Body</Th>
 <Th>Status</Th>
 <Th>Action</Th>
 </tr>
 </thead>
 <tbody>
 {rows.map((row) => (
 <tr key={row.id}>
 <Td>{row.channel}</Td>
 <Td>{row.subject ?? '-'}</Td>
 <Td>{row.body}</Td>
 <Td>{row.status}</Td>
 <Td>
 <Button onClick={() => approveLegacy(row.id)}>Approve</Button>
 </Td>
 </tr>
 ))}
 </tbody>
 </Table>
 </Card>
 </SiteShell>
 )
}
