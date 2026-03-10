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

vi.mock('@/components/ui/badge', function () {
  return {
    Badge: function Badge({
      children,
      ...rest
    }: React.HTMLAttributes<HTMLSpanElement> & { variant?: string }) {
      return React.createElement('span', rest, children)
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

const { default: OpportunitiesPage } = await import('./page')

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SESSION = {
  apiToken: 'test-token',
  user: { id: 'u1', email: 'agent@demo.local', role: 'agent' },
  expires: '2099-01-01',
}

function makeItem(overrides: Partial<{
  parcel_id: string
  address: string
  heat: number
  distress: number
  flags: string[]
  status: string
}> = {}) {
  return {
    parcel_id: overrides.parcel_id ?? 'parcel-001',
    address: overrides.address ?? '123 Main St',
    parcel_number: '010-001-001',
    city: 'Columbus',
    state: 'OH',
    zip: '43215',
    opportunity_flags: overrides.flags ?? ['vacant_land'],
    status: overrides.status ?? 'ok',
    missing_inputs: [],
    event_signal: { count_30d: 2, latest: null },
    neighborhood_heat: { value: { score_0_100: overrides.heat ?? 72 } },
    distress_likelihood: { value: { score_0_1: overrides.distress ?? 0.58 } },
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

describe('OpportunitiesPage', function () {
  beforeEach(function () {
    vi.clearAllMocks()
    setup()
  })

  it('shows loading state while data is fetching', function () {
    mockApiFetch.mockReturnValue(new Promise(function () { return }))
    render(React.createElement(OpportunitiesPage))
    expect(screen.getByTestId('opportunities-loading')).toBeTruthy()
  })

  it('describes deterministic opportunity scoring in the page header', async function () {
    mockApiFetch.mockResolvedValue({ status: 'ok', model_version: 'v1', items: [] })
    render(React.createElement(OpportunitiesPage))
    await waitFor(function () {
      expect(screen.getByText(/ai does not score these parcels/i)).toBeTruthy()
    })
  })

  it('shows empty state when no items pass the filter', async function () {
    mockApiFetch.mockResolvedValue({ status: 'ok', model_version: 'v1', items: [] })
    render(React.createElement(OpportunitiesPage))
    await waitFor(function () {
      expect(screen.getByTestId('no-opportunities')).toBeTruthy()
    })
  })

  it('renders an opportunity card for each item', async function () {
    mockApiFetch.mockResolvedValue({
      status: 'ok',
      model_version: 'v1',
      items: [makeItem({ parcel_id: 'parcel-001' }), makeItem({ parcel_id: 'parcel-002' })],
    })
    render(React.createElement(OpportunitiesPage))
    await waitFor(function () {
      expect(screen.getByTestId('opportunity-card-parcel-001')).toBeTruthy()
    })
    expect(screen.getByTestId('opportunity-card-parcel-002')).toBeTruthy()
  })

  it('renders heat and distress badges', async function () {
    mockApiFetch.mockResolvedValue({
      status: 'ok',
      model_version: 'v1',
      items: [makeItem({ parcel_id: 'parcel-001', heat: 80, distress: 0.7 })],
    })
    render(React.createElement(OpportunitiesPage))
    await waitFor(function () {
      expect(screen.getByTestId('heat-badge-parcel-001')).toBeTruthy()
    })
    expect(screen.getByTestId('heat-badge-parcel-001').textContent).toContain('80')
    expect(screen.getByTestId('distress-badge-parcel-001').textContent).toContain('70%')
  })

  it('renders address and parcel info', async function () {
    mockApiFetch.mockResolvedValue({
      status: 'ok',
      model_version: 'v1',
      items: [makeItem({ address: '145 N High St' })],
    })
    render(React.createElement(OpportunitiesPage))
    await waitFor(function () {
      expect(screen.getByText('145 N High St')).toBeTruthy()
    })
  })

  it('heat filter slider hides items below threshold', async function () {
    mockApiFetch.mockResolvedValue({
      status: 'ok',
      model_version: 'v1',
      items: [
        makeItem({ parcel_id: 'low', heat: 20 }),
        makeItem({ parcel_id: 'high', heat: 90 }),
      ],
    })
    render(React.createElement(OpportunitiesPage))
    await waitFor(function () {
      expect(screen.getByTestId('opportunity-card-low')).toBeTruthy()
    })

    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '50' } })

    expect(screen.getByTestId('heat-filter-output').textContent).toContain('50')
    expect(screen.queryByTestId('opportunity-card-low')).toBeNull()
    expect(screen.getByTestId('opportunity-card-high')).toBeTruthy()
  })

  it('renders a summary card for the filtered opportunity set', async function () {
    mockApiFetch.mockResolvedValue({
      status: 'ok',
      model_version: 'v1',
      items: [makeItem({ parcel_id: 'parcel-001' }), makeItem({ parcel_id: 'parcel-002' })],
    })
    render(React.createElement(OpportunitiesPage))
    await waitFor(function () {
      expect(screen.getByTestId('opportunities-summary-card')).toBeTruthy()
    })
    expect(screen.getByTestId('opportunities-summary-card').textContent).toContain('2 shown')
  })

  it('shows opportunity flags as badges', async function () {
    mockApiFetch.mockResolvedValue({
      status: 'ok',
      model_version: 'v1',
      items: [makeItem({ flags: ['vacant_land', 'tax_lien'] })],
    })
    render(React.createElement(OpportunitiesPage))
    await waitFor(function () {
      expect(screen.getByText('vacant land')).toBeTruthy()
    })
    expect(screen.getByText('tax lien')).toBeTruthy()
  })

  it('shows partial-signal warning for insufficient_data items', async function () {
    const item = { ...makeItem(), status: 'insufficient_data', missing_inputs: ['flood_zone'] }
    mockApiFetch.mockResolvedValue({ status: 'ok', model_version: 'v1', items: [item] })
    render(React.createElement(OpportunitiesPage))
    await waitFor(function () {
      expect(screen.getByText(/Partial signal/)).toBeTruthy()
    })
    expect(screen.getByText(/flood_zone/)).toBeTruthy()
  })

  it('shows latest event trigger when present', async function () {
    const item = {
      ...makeItem(),
      event_signal: {
        count_30d: 1,
        latest: {
          event_type: 'distress_signal_crossed',
          severity: 'high',
          created_at: '2026-03-01T00:00:00Z',
        },
      },
    }
    mockApiFetch.mockResolvedValue({ status: 'ok', model_version: 'v1', items: [item] })
    render(React.createElement(OpportunitiesPage))
    await waitFor(function () {
      expect(screen.getByText(/distress signal crossed/)).toBeTruthy()
    })
  })

  it('returns null when not authenticated', async function () {
    mockUseRequireAuth.mockReturnValue({ status: 'loading' })
    const { container } = render(React.createElement(OpportunitiesPage))
    expect(container.firstChild).toBeNull()
    await act(async () => {})
  })
})
