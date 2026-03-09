import React from 'react'

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockUseRequireAuth = vi.fn()
const mockUseSession = vi.fn()
const mockApiFetch = vi.fn()
const mockUseParams = vi.fn()

vi.mock('@/components/auth-guard', function () {
  return { useRequireAuth: () => mockUseRequireAuth() }
})

vi.mock('@/components/site-shell', function () {
  return {
    SiteShell: function SiteShell({ children }: { children: React.ReactNode }) {
      return React.createElement('div', null, children)
    },
  }
})

vi.mock('@/components/ui/badge', function () {
  return {
    Badge: function Badge(props: React.HTMLAttributes<HTMLSpanElement>) {
      return React.createElement('span', props, props.children)
    },
  }
})

vi.mock('@/components/ui/button', function () {
  return {
    Button: function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
      return React.createElement('button', props, props.children)
    },
  }
})

vi.mock('@/components/ui/card', function () {
  return {
    Card: function Card(props: React.HTMLAttributes<HTMLDivElement>) {
      return React.createElement('div', props, props.children)
    },
    CardTitle: function CardTitle(props: React.HTMLAttributes<HTMLHeadingElement>) {
      return React.createElement('h2', props, props.children)
    },
    CardDescription: function CardDescription(props: React.HTMLAttributes<HTMLParagraphElement>) {
      return React.createElement('p', props, props.children)
    },
  }
})

vi.mock('@/components/ui/input', function () {
  return {
    Input: function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
      return React.createElement('input', props)
    },
  }
})

vi.mock('@/components/ui/table', function () {
  return {
    Table: function Table(props: React.HTMLAttributes<HTMLTableElement>) {
      return React.createElement('table', props, props.children)
    },
    Th: function Th(props: React.ThHTMLAttributes<HTMLTableCellElement>) {
      return React.createElement('th', props, props.children)
    },
    Td: function Td(props: React.TdHTMLAttributes<HTMLTableCellElement>) {
      return React.createElement('td', props, props.children)
    },
  }
})

vi.mock('next-auth/react', function () {
  return { useSession: () => mockUseSession() }
})

vi.mock('next/link', function () {
  return {
    default: function Link({ href, children, ...rest }: { href: string; children: React.ReactNode }) {
      return React.createElement('a', { href, ...rest }, children)
    },
  }
})

vi.mock('next/navigation', function () {
  return { useParams: () => mockUseParams() }
})

vi.mock('@/lib/api', function () {
  return { apiFetch: (...args: unknown[]) => mockApiFetch(...args) }
})

const { default: ContactDetailPage } = await import('./page')

const SESSION = {
  apiToken: 'token-agent',
  user: { id: 'u1', email: 'agent@demo.local', role: 'agent' },
  expires: '2099-01-01',
}

const CONTACT = {
  id: 'cid-1',
  name: 'Alice Smith',
  email: 'alice@example.com',
  phone: '555-1234',
  tags_json: ['buyer'],
  notes: 'Met at open house',
  created_at: '2026-01-01T00:00:00Z',
}

const MESSAGE = {
  id: 'msg-1',
  channel: 'email',
  direction: 'outbound',
  status: 'sent',
  subject: 'Hello Alice',
  body_preview: 'Just following up on the property.',
  created_at: '2026-03-01T00:00:00Z',
  sent_at: '2026-03-01T00:05:00Z',
}

const ENROLLMENT = {
  id: 'enr-1',
  sequence_id: 'seq-1',
  sequence_name: 'Welcome Sequence',
  state: 'active',
  enrolled_at: '2026-03-01T00:00:00Z',
  next_step_at: null,
}

function setup() {
  mockUseRequireAuth.mockReturnValue({ status: 'authenticated' })
  mockUseSession.mockReturnValue({ data: SESSION, status: 'authenticated' })
  mockUseParams.mockReturnValue({ id: 'cid-1' })
}

describe('ContactDetailPage', function () {
  beforeEach(function () {
    vi.clearAllMocks()
  })

  it('returns null when not authenticated', async function () {
    mockUseRequireAuth.mockReturnValue({ status: 'loading' })
    mockUseSession.mockReturnValue({ data: null, status: 'loading' })
    mockUseParams.mockReturnValue({ id: 'cid-1' })
    mockApiFetch.mockReturnValue(new Promise(() => {}))
    const { container } = render(React.createElement(ContactDetailPage))
    expect(container.firstChild).toBeNull()
    await act(async () => {})
  })

  it('renders contact name and details', async function () {
    setup()
    mockApiFetch
      .mockResolvedValueOnce(CONTACT)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    render(React.createElement(ContactDetailPage))
    await waitFor(() => {
      expect(screen.getByTestId('contact-name')).toBeTruthy()
      expect(screen.getByText('Alice Smith')).toBeTruthy()
      expect(screen.getByText('alice@example.com')).toBeTruthy()
    })
  })

  it('renders messages table when messages exist', async function () {
    setup()
    mockApiFetch
      .mockResolvedValueOnce(CONTACT)
      .mockResolvedValueOnce([MESSAGE])
      .mockResolvedValueOnce([])
    render(React.createElement(ContactDetailPage))
    await waitFor(() => {
      expect(screen.getByTestId('messages-table')).toBeTruthy()
      expect(screen.getByTestId(`message-row-${MESSAGE.id}`)).toBeTruthy()
    })
  })

  it('shows no-messages state when empty', async function () {
    setup()
    mockApiFetch
      .mockResolvedValueOnce(CONTACT)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    render(React.createElement(ContactDetailPage))
    await waitFor(() => {
      expect(screen.getByTestId('no-messages')).toBeTruthy()
    })
  })

  it('renders enrollment list when enrollments exist', async function () {
    setup()
    mockApiFetch
      .mockResolvedValueOnce(CONTACT)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([ENROLLMENT])
    render(React.createElement(ContactDetailPage))
    await waitFor(() => {
      expect(screen.getByTestId('enrollments-list')).toBeTruthy()
      expect(screen.getByTestId(`enrollment-row-${ENROLLMENT.id}`)).toBeTruthy()
      expect(screen.getByText('Welcome Sequence')).toBeTruthy()
    })
  })

  it('shows no-enrollments state when empty', async function () {
    setup()
    mockApiFetch
      .mockResolvedValueOnce(CONTACT)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    render(React.createElement(ContactDetailPage))
    await waitFor(() => {
      expect(screen.getByTestId('no-enrollments')).toBeTruthy()
    })
  })

  it('shows back link to contacts', async function () {
    setup()
    mockApiFetch
      .mockResolvedValueOnce(CONTACT)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    render(React.createElement(ContactDetailPage))
    await waitFor(() => {
      const back = screen.getByText(/← contacts/i)
      expect(back).toBeTruthy()
    })
  })

  it('edit button shows inline edit form', async function () {
    setup()
    mockApiFetch
      .mockResolvedValueOnce(CONTACT)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    render(React.createElement(ContactDetailPage))
    await waitFor(() => expect(screen.getByTestId('edit-btn')).toBeTruthy())

    fireEvent.click(screen.getByTestId('edit-btn'))
    await waitFor(() => {
      expect(screen.getByTestId('contact-save')).toBeTruthy()
    })
  })

  it('save calls PUT and updates contact', async function () {
    setup()
    const updated = { ...CONTACT, name: 'Alice Jones' }
    mockApiFetch
      .mockResolvedValueOnce(CONTACT)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(updated)
    render(React.createElement(ContactDetailPage))
    await waitFor(() => expect(screen.getByTestId('edit-btn')).toBeTruthy())

    fireEvent.click(screen.getByTestId('edit-btn'))
    await waitFor(() => expect(screen.getByTestId('contact-save')).toBeTruthy())

    fireEvent.click(screen.getByTestId('contact-save'))
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/contacts/cid-1'),
        SESSION.apiToken,
        expect.objectContaining({ method: 'PUT' })
      )
    })
  })

  it('overview loads even when messages fetch fails', async function () {
    setup()
    mockApiFetch
      .mockResolvedValueOnce(CONTACT)
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce([])
    render(React.createElement(ContactDetailPage))
    await waitFor(() => {
      // contact name still visible
      expect(screen.getByTestId('contact-name')).toBeTruthy()
      // messages section shows error fallback
      expect(screen.getByText(/unable to load message history/i)).toBeTruthy()
    })
  })
})
