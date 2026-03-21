import React from 'react'

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — must be declared before lazy import of the page
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
      return React.createElement('div', { 'data-testid': 'site-shell' }, children)
    },
  }
})

vi.mock('@/components/ui/badge', function () {
  return {
    Badge: function Badge({
      children,
      className,
      ...rest
    }: React.HTMLAttributes<HTMLSpanElement>) {
      return React.createElement('span', { className, ...rest }, children)
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
// Lazy page import (after mocks are registered)
// ---------------------------------------------------------------------------

const { default: OutreachPage } = await import('./page')

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SESSION = {
  apiToken: 'test-token',
  user: { id: 'u1', email: 'agent@demo.local', role: 'agent' },
  expires: '2099-01-01',
}

function makePack(overrides: Partial<{
  id: string
  status: string
  sandbox: boolean
  objective: string
  drafts: unknown[]
}> = {}) {
  return {
    id: overrides.id ?? 'pack-aaa-111',
    created_at: '2026-03-01T00:00:00Z',
    created_by_user_id: 'u1',
    parcel_id: null,
    contact_id: null,
    status: overrides.status ?? 'draft',
    sandbox: overrides.sandbox ?? true,
    objective: overrides.objective ?? 'initial outreach',
    drafts: overrides.drafts ?? [],
  }
}

function makeDraft(overrides: Partial<{
  id: string
  status: string
  body: string
  subject: string | null
}> = {}) {
  return {
    id: overrides.id ?? 'draft-bbb-222',
    pack_id: 'pack-aaa-111',
    contact_id: 'contact-1',
    channel: 'email',
    subject: overrides.subject ?? 'Hello',
    body: overrides.body ?? 'This is the email body.',
    status: overrides.status ?? 'draft',
    created_at: '2026-03-01T00:00:00Z',
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setup() {
  mockUseRequireAuth.mockReturnValue({ status: 'authenticated' })
  mockUseSession.mockReturnValue({ data: SESSION, status: 'authenticated' })
}

function renderPage() {
  return render(React.createElement(OutreachPage))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OutreachPage', function () {
  beforeEach(function () {
    vi.clearAllMocks()
    setup()
  })

  it('shows loading state while packs are fetching', function () {
    // apiFetch never resolves
    mockApiFetch.mockReturnValue(new Promise(function () { return }))
    renderPage()
    expect(screen.getByTestId('packs-loading')).toBeTruthy()
  })

  it('shows empty state when no packs returned', async function () {
    mockApiFetch.mockResolvedValue({ items: [] })
    renderPage()
    await waitFor(function () {
      expect(screen.getByTestId('no-packs')).toBeTruthy()
    })
  })

  it('renders a pack item with sandbox badge', async function () {
    const pack = makePack({ sandbox: true })
    mockApiFetch.mockResolvedValue({ items: [pack] })
    renderPage()
    await waitFor(function () {
      expect(screen.getByTestId('pack-item-pack-aaa-111')).toBeTruthy()
    })
    expect(screen.getByTestId('sandbox-badge-pack-aaa-111')).toBeTruthy()
  })

  it('does not show sandbox badge for non-sandbox packs', async function () {
    const pack = makePack({ sandbox: false })
    mockApiFetch.mockResolvedValue({ items: [pack] })
    renderPage()
    await waitFor(function () {
      expect(screen.getByTestId('pack-item-pack-aaa-111')).toBeTruthy()
    })
    expect(screen.queryByTestId('sandbox-badge-pack-aaa-111')).toBeNull()
  })

  it('renders pack detail with draft rows for selected pack', async function () {
    const draft = makeDraft()
    const pack = makePack({ drafts: [draft] })
    mockApiFetch.mockResolvedValue({ items: [pack] })
    renderPage()
    await waitFor(function () {
      expect(screen.getByTestId('pack-detail-card')).toBeTruthy()
    })
    expect(screen.getByTestId('draft-row-draft-bbb-222')).toBeTruthy()
  })

  it('renders DraftStatusBadge for pack and draft', async function () {
    const draft = makeDraft({ status: 'blocked_sandbox' })
    const pack = makePack({ status: 'draft', drafts: [draft] })
    mockApiFetch.mockResolvedValue({ items: [pack] })
    renderPage()
    await waitFor(function () {
      expect(screen.getByTestId('pack-detail-card')).toBeTruthy()
    })
    // Pack status badge appears (at least 1 draft-status-draft badge)
    expect(screen.getAllByTestId('draft-status-draft').length).toBeGreaterThan(0)
    // Draft blocked_sandbox badge
    expect(screen.getByTestId('draft-status-blocked_sandbox')).toBeTruthy()
  })

  it('truncates long body text at 120 characters', async function () {
    const longBody = 'A'.repeat(150)
    const draft = makeDraft({ body: longBody })
    const pack = makePack({ drafts: [draft] })
    mockApiFetch.mockResolvedValue({ items: [pack] })
    renderPage()
    await waitFor(function () {
      expect(screen.getByTestId('pack-detail-card')).toBeTruthy()
    })
    const cell = screen.getByTestId('draft-row-draft-bbb-222')
    expect(cell.textContent).toContain('…')
    expect(cell.textContent).not.toContain('A'.repeat(150))
  })

  it('shows approve two-step confirm on first click', async function () {
    const draft = makeDraft()
    const pack = makePack({ drafts: [draft] })
    mockApiFetch.mockResolvedValue({ items: [pack] })
    renderPage()
    await waitFor(function () {
      expect(screen.getByTestId('approve-btn-draft-bbb-222')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('approve-btn-draft-bbb-222'))
    expect(screen.getByTestId('approve-confirm')).toBeTruthy()
    expect(screen.getByTestId('approve-cancel')).toBeTruthy()
  })

  it('cancels approve confirm without calling API', async function () {
    const draft = makeDraft()
    const pack = makePack({ drafts: [draft] })
    mockApiFetch.mockResolvedValue({ items: [pack] })
    renderPage()
    await waitFor(function () {
      expect(screen.getByTestId('approve-btn-draft-bbb-222')).toBeTruthy()
    })
    // First call was the load() — clear it
    mockApiFetch.mockClear()
    mockApiFetch.mockResolvedValue({ items: [pack] })

    fireEvent.click(screen.getByTestId('approve-btn-draft-bbb-222'))
    fireEvent.click(screen.getByTestId('approve-cancel'))
    expect(screen.queryByTestId('approve-confirm')).toBeNull()
    // No extra API call
    expect(mockApiFetch).not.toHaveBeenCalled()
  })

  it('calls approve API on confirm and shows result', async function () {
    const draft = makeDraft()
    const pack = makePack({ drafts: [draft] })
    mockApiFetch.mockResolvedValueOnce({ items: [pack] }) // initial load
    mockApiFetch.mockResolvedValueOnce({ status: 'blocked_sandbox', reason: 'sandbox mode' }) // approve
    mockApiFetch.mockResolvedValueOnce({ items: [pack] }) // reload

    renderPage()
    await waitFor(function () {
      expect(screen.getByTestId('approve-btn-draft-bbb-222')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('approve-btn-draft-bbb-222'))
    await waitFor(function () {
      expect(screen.getByTestId('approve-confirm')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('approve-confirm'))

    await waitFor(function () {
      expect(screen.getByTestId('action-result')).toBeTruthy()
    })
    expect(screen.getByTestId('action-result').textContent).toContain('blocked_sandbox')
  })

  it('shows reject two-step confirm on first click', async function () {
    const draft = makeDraft()
    const pack = makePack({ drafts: [draft] })
    mockApiFetch.mockResolvedValue({ items: [pack] })
    renderPage()
    await waitFor(function () {
      expect(screen.getByTestId('reject-btn-draft-bbb-222')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('reject-btn-draft-bbb-222'))
    expect(screen.getByTestId('reject-confirm')).toBeTruthy()
    expect(screen.getByTestId('reject-cancel')).toBeTruthy()
  })

  it('calls reject API on confirm', async function () {
    const draft = makeDraft()
    const pack = makePack({ drafts: [draft] })
    mockApiFetch.mockResolvedValueOnce({ items: [pack] })
    mockApiFetch.mockResolvedValueOnce({ status: 'rejected', message: 'ok' })
    mockApiFetch.mockResolvedValueOnce({ items: [pack] })

    renderPage()
    await waitFor(function () {
      expect(screen.getByTestId('reject-btn-draft-bbb-222')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('reject-btn-draft-bbb-222'))
    await waitFor(function () {
      expect(screen.getByTestId('reject-confirm')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('reject-confirm'))

    await waitFor(function () {
      expect(screen.getByTestId('action-result')).toBeTruthy()
    })
    expect(screen.getByTestId('action-result').textContent).toContain('rejected')
  })

  it('shows submit pack two-step confirm on first click', async function () {
    const pack = makePack()
    mockApiFetch.mockResolvedValue({ items: [pack] })
    renderPage()
    await waitFor(function () {
      expect(screen.getByTestId('submit-pack-btn')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('submit-pack-btn'))
    expect(screen.getByTestId('submit-pack-confirm')).toBeTruthy()
    expect(screen.getByTestId('submit-pack-cancel')).toBeTruthy()
  })

  it('cancels submit pack confirm without calling API', async function () {
    const pack = makePack()
    mockApiFetch.mockResolvedValue({ items: [pack] })
    renderPage()
    await waitFor(function () {
      expect(screen.getByTestId('submit-pack-btn')).toBeTruthy()
    })
    mockApiFetch.mockClear()
    mockApiFetch.mockResolvedValue({ items: [pack] })

    fireEvent.click(screen.getByTestId('submit-pack-btn'))
    fireEvent.click(screen.getByTestId('submit-pack-cancel'))
    expect(screen.queryByTestId('submit-pack-confirm')).toBeNull()
    expect(mockApiFetch).not.toHaveBeenCalled()
  })

  it('calls submit API on confirm and shows result', async function () {
    const pack = makePack()
    mockApiFetch.mockResolvedValueOnce({ items: [pack] })
    mockApiFetch.mockResolvedValueOnce({ status: 'submitted', message: 'Pack submitted' })
    mockApiFetch.mockResolvedValueOnce({ items: [pack] })

    renderPage()
    await waitFor(function () {
      expect(screen.getByTestId('submit-pack-btn')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('submit-pack-btn'))
    await waitFor(function () {
      expect(screen.getByTestId('submit-pack-confirm')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('submit-pack-confirm'))

    await waitFor(function () {
      expect(screen.getByTestId('action-result')).toBeTruthy()
    })
    expect(screen.getByTestId('action-result').textContent).toContain('submitted')
  })

  it('returns null when not authenticated', async function () {
    mockUseRequireAuth.mockReturnValue({ status: 'loading' })
    const { container } = renderPage()
    await act(async () => {})
    expect(container.firstChild).toBeNull()
  })

  it('approve and reject confirms are mutually exclusive per draft', async function () {
    const draft = makeDraft()
    const pack = makePack({ drafts: [draft] })
    mockApiFetch.mockResolvedValue({ items: [pack] })
    renderPage()
    await waitFor(function () {
      expect(screen.getByTestId('approve-btn-draft-bbb-222')).toBeTruthy()
    })
    // Start approve confirm
    fireEvent.click(screen.getByTestId('approve-btn-draft-bbb-222'))
    expect(screen.getByTestId('approve-confirm')).toBeTruthy()
    expect(screen.queryByTestId('reject-confirm')).toBeNull()
  })

  // ---------------------------------------------------------------------------
  // Compose form tests
  // ---------------------------------------------------------------------------

  it('shows compose-toggle button', async function () {
    mockApiFetch.mockResolvedValue({ items: [] })
    renderPage()
    await waitFor(function () {
      expect(screen.getByTestId('compose-toggle')).toBeTruthy()
    })
  })

  it('compose form hidden by default', async function () {
    mockApiFetch.mockResolvedValue({ items: [] })
    renderPage()
    await waitFor(function () {
      expect(screen.getByTestId('compose-toggle')).toBeTruthy()
    })
    expect(screen.queryByTestId('compose-form')).toBeNull()
  })

  it('clicking compose-toggle shows the form and fetches contacts', async function () {
    mockApiFetch.mockResolvedValueOnce({ items: [] }) // initial packs load
    mockApiFetch.mockResolvedValueOnce([                // contacts fetch
      { id: 'c1', name: 'Alice', email: 'alice@test.com' },
    ])
    renderPage()
    await waitFor(function () {
      expect(screen.getByTestId('compose-toggle')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('compose-toggle'))
    await waitFor(function () {
      expect(screen.getByTestId('compose-form')).toBeTruthy()
    })
    await waitFor(function () {
      expect(screen.getByText('Alice (alice@test.com)')).toBeTruthy()
    })
  })

  it('clicking compose-toggle again hides the form', async function () {
    mockApiFetch.mockResolvedValueOnce({ items: [] })
    mockApiFetch.mockResolvedValueOnce([])
    renderPage()
    await waitFor(function () {
      expect(screen.getByTestId('compose-toggle')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('compose-toggle'))
    await waitFor(function () {
      expect(screen.getByTestId('compose-form')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('compose-toggle'))
    await waitFor(function () {
      expect(screen.queryByTestId('compose-form')).toBeNull()
    })
  })

  it('submit button is disabled when contact or objective is empty', async function () {
    mockApiFetch.mockResolvedValueOnce({ items: [] })
    mockApiFetch.mockResolvedValueOnce([])
    renderPage()
    await waitFor(function () {
      expect(screen.getByTestId('compose-toggle')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('compose-toggle'))
    await waitFor(function () {
      expect(screen.getByTestId('compose-submit')).toBeTruthy()
    })
    expect((screen.getByTestId('compose-submit') as HTMLButtonElement).disabled).toBe(true)
  })

  it('calls POST /outreach/draft-pack on submit and shows result', async function () {
    const newPack = makePack({ id: 'pack-new-999', status: 'draft', drafts: [] })
    mockApiFetch.mockResolvedValueOnce({ items: [] })           // initial packs load
    mockApiFetch.mockResolvedValueOnce([                         // contacts fetch
      { id: 'c1', name: 'Alice', email: 'alice@test.com' },
    ])
    mockApiFetch.mockResolvedValueOnce(newPack)                  // POST /draft-pack
    mockApiFetch.mockResolvedValueOnce({ items: [newPack] })     // reload

    renderPage()
    await waitFor(function () {
      expect(screen.getByTestId('compose-toggle')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('compose-toggle'))
    await waitFor(function () {
      expect(screen.getByTestId('compose-form')).toBeTruthy()
    })
    await waitFor(function () {
      expect(screen.getByTestId('compose-contact')).toBeTruthy()
    })

    // Fill form
    fireEvent.change(screen.getByTestId('compose-contact'), { target: { value: 'c1' } })
    fireEvent.change(screen.getByTestId('compose-objective'), {
      target: { value: 'Initial buyer intro' },
    })

    fireEvent.click(screen.getByTestId('compose-submit'))

    await waitFor(function () {
      expect(screen.getByTestId('action-result')).toBeTruthy()
    })
    expect(screen.getByTestId('action-result').textContent).toContain('pack-new')
  })

  it('shows compose-error when POST fails', async function () {
    mockApiFetch.mockResolvedValueOnce({ items: [] })
    mockApiFetch.mockResolvedValueOnce([
      { id: 'c1', name: 'Alice', email: null },
    ])
    mockApiFetch.mockRejectedValueOnce(new Error('contact not found'))

    renderPage()
    await waitFor(function () {
      expect(screen.getByTestId('compose-toggle')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('compose-toggle'))
    await waitFor(function () {
      expect(screen.getByTestId('compose-form')).toBeTruthy()
    })
    await waitFor(function () {
      expect(screen.getByTestId('compose-contact')).toBeTruthy()
    })

    fireEvent.change(screen.getByTestId('compose-contact'), { target: { value: 'c1' } })
    fireEvent.change(screen.getByTestId('compose-objective'), {
      target: { value: 'Test objective' },
    })
    fireEvent.click(screen.getByTestId('compose-submit'))

    await waitFor(function () {
      expect(screen.getByTestId('compose-error')).toBeTruthy()
    })
    expect(screen.getByTestId('compose-error').textContent).toContain('contact not found')
  })
})
