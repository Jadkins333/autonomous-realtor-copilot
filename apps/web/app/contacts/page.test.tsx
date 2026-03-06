import React from 'react'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseRequireAuth = vi.fn()
const mockUseSession = vi.fn()
const mockApiFetch = vi.fn()

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

vi.mock('@/lib/api', function () {
  return { apiFetch: (...args: unknown[]) => mockApiFetch(...args) }
})

// ---------------------------------------------------------------------------
// Lazy import
// ---------------------------------------------------------------------------

const { default: ContactsPage } = await import('./page')

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SESSION = {
  apiToken: 'test-token',
  user: { id: 'u1', email: 'agent@demo.local', role: 'agent' },
  expires: '2099-01-01',
}

function makeContact(overrides: Partial<{
  id: string
  name: string
  email: string | null
  phone: string | null
  tags_json: string[]
}> = {}) {
  return {
    id: overrides.id ?? 'contact-001',
    name: overrides.name ?? 'Alice Smith',
    email: overrides.email !== undefined ? overrides.email : 'alice@example.com',
    phone: overrides.phone !== undefined ? overrides.phone : '614-555-0001',
    tags_json: overrides.tags_json ?? [],
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setup() {
  mockUseRequireAuth.mockReturnValue({ status: 'authenticated' })
  mockUseSession.mockReturnValue({ data: SESSION, status: 'authenticated' })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContactsPage', function () {
  beforeEach(function () {
    vi.clearAllMocks()
    setup()
  })

  it('renders contact list on load', async function () {
    mockApiFetch.mockResolvedValue([makeContact()])
    render(React.createElement(ContactsPage))
    await waitFor(function () {
      expect(screen.getByTestId('contact-row-contact-001')).toBeTruthy()
    })
    expect(screen.getByText('Alice Smith')).toBeTruthy()
  })

  it('renders multiple contacts', async function () {
    mockApiFetch.mockResolvedValue([
      makeContact({ id: 'c1', name: 'Alice' }),
      makeContact({ id: 'c2', name: 'Bob' }),
    ])
    render(React.createElement(ContactsPage))
    await waitFor(function () {
      expect(screen.getByTestId('contact-row-c1')).toBeTruthy()
    })
    expect(screen.getByTestId('contact-row-c2')).toBeTruthy()
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
  })

  it('renders em-dash for missing email and phone', async function () {
    mockApiFetch.mockResolvedValue([makeContact({ id: 'c1', email: null, phone: null })])
    render(React.createElement(ContactsPage))
    await waitFor(function () {
      expect(screen.getByTestId('contact-row-c1')).toBeTruthy()
    })
    const row = screen.getByTestId('contact-row-c1')
    expect(row.textContent).toContain('—')
  })

  it('renders tags when present', async function () {
    mockApiFetch.mockResolvedValue([makeContact({ tags_json: ['investor', 'vip'] })])
    render(React.createElement(ContactsPage))
    await waitFor(function () {
      expect(screen.getByTestId('contact-row-contact-001')).toBeTruthy()
    })
    expect(screen.getByText('investor, vip')).toBeTruthy()
  })

  it('fills form fields and calls POST on Add Contact', async function () {
    mockApiFetch.mockResolvedValueOnce([]) // initial load
    mockApiFetch.mockResolvedValueOnce({ id: 'new-c', name: 'Bob' }) // POST
    mockApiFetch.mockResolvedValueOnce([]) // reload

    render(React.createElement(ContactsPage))
    await waitFor(function () {
      expect(screen.getByTestId('contact-name-input')).toBeTruthy()
    })

    fireEvent.change(screen.getByTestId('contact-name-input'), { target: { value: 'Bob Jones' } })
    fireEvent.change(screen.getByTestId('contact-email-input'), { target: { value: 'bob@example.com' } })
    fireEvent.change(screen.getByTestId('contact-phone-input'), { target: { value: '614-555-0002' } })
    fireEvent.click(screen.getByTestId('add-contact-btn'))

    await waitFor(function () {
      // POST call should have been made
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/contacts',
        'test-token',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('clears form inputs after successful create', async function () {
    mockApiFetch.mockResolvedValueOnce([])
    mockApiFetch.mockResolvedValueOnce({ id: 'new-c', name: 'Bob' })
    mockApiFetch.mockResolvedValueOnce([])

    render(React.createElement(ContactsPage))
    await waitFor(function () {
      expect(screen.getByTestId('contact-name-input')).toBeTruthy()
    })

    fireEvent.change(screen.getByTestId('contact-name-input'), { target: { value: 'Bob Jones' } })
    fireEvent.click(screen.getByTestId('add-contact-btn'))

    await waitFor(function () {
      expect((screen.getByTestId('contact-name-input') as HTMLInputElement).value).toBe('')
    })
  })

  it('shows offline error when navigator.onLine is false', async function () {
    mockApiFetch.mockResolvedValue([])
    render(React.createElement(ContactsPage))
    await waitFor(function () {
      expect(screen.getByTestId('add-contact-btn')).toBeTruthy()
    })

    // Simulate offline
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })

    fireEvent.change(screen.getByTestId('contact-name-input'), { target: { value: 'Offline Test' } })
    fireEvent.click(screen.getByTestId('add-contact-btn'))

    await waitFor(function () {
      expect(screen.getByTestId('contact-error')).toBeTruthy()
    })
    expect(screen.getByTestId('contact-error').textContent).toContain('offline')

    // Restore
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  })

  it('returns null when not authenticated', function () {
    mockUseRequireAuth.mockReturnValue({ status: 'loading' })
    const { container } = render(React.createElement(ContactsPage))
    expect(container.firstChild).toBeNull()
  })
})
