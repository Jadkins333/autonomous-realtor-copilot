'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

import { useRequireAuth } from '@/components/auth-guard'
import { SiteShell } from '@/components/site-shell'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, Td, Th } from '@/components/ui/table'
import { apiFetch } from '@/lib/api'

type ContactRow = {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  tags_json?: string[]
}

export default function ContactsPage() {
  const { status } = useRequireAuth()
  const { data: session } = useSession()
  const [rows, setRows] = useState([] as ContactRow[])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)

  const loadContacts = useCallback(async () => {
    if (!session) return
    const data = await apiFetch<ContactRow[]>('/contacts', session.apiToken)
    setRows(data)
  }, [session])

  async function createContact() {
    if (!session) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setError('You are offline. Contact writes are disabled until connection returns.')
      return
    }
    setError(null)
    await apiFetch<ContactRow>('/contacts', session.apiToken, {
      method: 'POST',
      body: JSON.stringify({ name, email: email || null, phone: phone || null, tags_json: [] }),
    })
    setName('')
    setEmail('')
    setPhone('')
    await loadContacts()
  }

  useEffect(() => {
    void loadContacts()
  }, [loadContacts])

  if (status !== 'authenticated') {
    return null
  }

  return (
    <SiteShell>
      <Card className='mb-4' data-testid='create-contact-card'>
        <CardTitle className='mb-3'>Create Contact</CardTitle>
        {error ? (
          <p className='mb-2 text-sm text-red-500' data-testid='contact-error'>
            {error}
          </p>
        ) : null}
        <div className='grid gap-2 md:grid-cols-4'>
          <Input
            placeholder='Name'
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid='contact-name-input'
          />
          <Input
            placeholder='Email'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-testid='contact-email-input'
          />
          <Input
            placeholder='Phone'
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            data-testid='contact-phone-input'
          />
          <Button onClick={createContact} data-testid='add-contact-btn'>
            Add Contact
          </Button>
        </div>
      </Card>

      <Card data-testid='contacts-table-card'>
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Phone</Th>
              <Th>Tags</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} data-testid={`contact-row-${row.id}`}>
                <Td>
                  <Link href={`/contacts/${row.id}`} className='text-accent underline hover:opacity-80'>
                    {row.name}
                  </Link>
                </Td>
                <Td>{row.email ?? '—'}</Td>
                <Td>{row.phone ?? '—'}</Td>
                <Td>{(row.tags_json || []).join(', ')}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </SiteShell>
  )
}
