import React from 'react'

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

vi.mock('next/link', function () {
  return {
    default: function Link({
      href,
      children,
      ...rest
    }: { href: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
      return React.createElement('a', { href, ...rest }, children)
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

const { default: OpportunityEventsPage } = await import('./page')

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SESSION = {
  apiToken: 'test-token',
  user: { id: 'u1', email: 'agent@demo.local', role: 'agent' },
  expires: '2099-01-01',
}

function makeEvent(overrides: Partial<{
  id: string
  event_type: string
  severity: string
  address: string
}> = {}) {
  return {
    id: overrides.id ?? 'evt-001',
    parcel_id: 'parcel-001',
    address: overrides.address ?? '123 Main St',
    event_type: overrides.event_type ?? 'distress_signal_crossed',
    severity: overrides.severity ?? 'medium',
    details: {},
    created_at: '2026-03-01T12:00:00Z',
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

describe('OpportunityEventsPage', function () {
  beforeEach(function () {
    vi.clearAllMocks()
    setup()
  })

  it('shows empty state when no events returned', async function () {
    mockApiFetch.mockResolvedValue({ status: 'ok', filters: {}, items: [] })
    render(React.createElement(OpportunityEventsPage))
    await waitFor(function () {
      expect(screen.getByTestId('no-events')).toBeTruthy()
    })
  })

  it('describes deterministic event feed behavior in the page header', async function () {
    mockApiFetch.mockResolvedValue({ status: 'ok', filters: {}, items: [] })
    render(React.createElement(OpportunityEventsPage))
    await waitFor(function () {
      expect(screen.getByText(/ai does not generate these event rows/i)).toBeTruthy()
    })
  })

  it('labels event filters with explicit form copy', async function () {
    mockApiFetch.mockResolvedValue({ status: 'ok', filters: {}, items: [] })
    render(React.createElement(OpportunityEventsPage))
    await waitFor(function () {
      expect(mockApiFetch).toHaveBeenCalledTimes(1)
    })
    expect(screen.getByLabelText(/event severity filter/i)).toBeTruthy()
    expect(screen.getByLabelText(/lookback days/i)).toBeTruthy()
    expect(screen.getByLabelText(/opportunity event filters/i)).toBeTruthy()
  })

  it('renders an event card for each event', async function () {
    mockApiFetch.mockResolvedValue({
      status: 'ok',
      filters: {},
      items: [makeEvent({ id: 'evt-001' }), makeEvent({ id: 'evt-002' })],
    })
    render(React.createElement(OpportunityEventsPage))
    await waitFor(function () {
      expect(screen.getByTestId('event-card-evt-001')).toBeTruthy()
    })
    expect(screen.getByTestId('event-card-evt-002')).toBeTruthy()
  })

  it('renders a summary card for the filtered event set', async function () {
    mockApiFetch.mockResolvedValue({
      status: 'ok',
      filters: {},
      items: [makeEvent({ id: 'evt-001' }), makeEvent({ id: 'evt-002' })],
    })
    render(React.createElement(OpportunityEventsPage))
    await waitFor(function () {
      expect(screen.getByTestId('events-summary-card')).toBeTruthy()
    })
    expect(screen.getByTestId('events-summary-card').textContent).toContain('2 events')
    expect(screen.getByTestId('events-summary-status').getAttribute('role')).toBe('status')
  })

  it('renders event type with underscores replaced by spaces', async function () {
    mockApiFetch.mockResolvedValue({
      status: 'ok',
      filters: {},
      items: [makeEvent({ event_type: 'distress_signal_crossed', severity: 'high' })],
    })
    render(React.createElement(OpportunityEventsPage))
    await waitFor(function () {
      expect(screen.getByTestId('event-type-evt-001')).toBeTruthy()
    })
    expect(screen.getByTestId('event-type-evt-001').textContent).toContain('distress signal crossed')
    expect(screen.getByTestId('event-type-evt-001').textContent).toContain('high')
  })

  it('renders event address', async function () {
    mockApiFetch.mockResolvedValue({
      status: 'ok',
      filters: {},
      items: [makeEvent({ address: '145 N High St' })],
    })
    render(React.createElement(OpportunityEventsPage))
    await waitFor(function () {
      expect(screen.getByText('145 N High St')).toBeTruthy()
    })
  })

  it('re-fetches when days input changes', async function () {
    mockApiFetch.mockResolvedValue({ status: 'ok', filters: {}, items: [] })
    render(React.createElement(OpportunityEventsPage))
    await waitFor(function () {
      expect(mockApiFetch).toHaveBeenCalledTimes(1)
    })

    const daysInput = screen.getByLabelText(/lookback days/i)
    fireEvent.change(daysInput, { target: { value: '7' } })

    await waitFor(function () {
      expect(mockApiFetch).toHaveBeenCalledTimes(2)
    })
    const lastCall = mockApiFetch.mock.calls[1][0] as string
    expect(lastCall).toContain('days=7')
  })

  it('marks the event list busy while loading', function () {
    mockApiFetch.mockReturnValue(new Promise(function () { return }))
    render(React.createElement(OpportunityEventsPage))
    expect(screen.getByTestId('events-list').getAttribute('aria-busy')).toBe('true')
  })

  it('re-fetches when severity filter changes', async function () {
    mockApiFetch.mockResolvedValue({ status: 'ok', filters: {}, items: [] })
    render(React.createElement(OpportunityEventsPage))
    await waitFor(function () {
      expect(mockApiFetch).toHaveBeenCalledTimes(1)
    })

    const severityInput = screen.getByLabelText(/event severity filter/i)
    fireEvent.change(severityInput, { target: { value: 'high' } })

    await waitFor(function () {
      expect(mockApiFetch).toHaveBeenCalledTimes(2)
    })
    const lastCall = mockApiFetch.mock.calls[1][0] as string
    expect(lastCall).toContain('severity=high')
  })

  it('returns null when not authenticated', async function () {
    mockUseRequireAuth.mockReturnValue({ status: 'loading' })
    const { container } = render(React.createElement(OpportunityEventsPage))
    expect(container.firstChild).toBeNull()
    await act(async () => {})
  })
})
