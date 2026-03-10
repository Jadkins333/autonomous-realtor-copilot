import React from 'react'

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

vi.mock('next/link', function () {
  return {
    default: function Link({ href, children, ...rest }: { href: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
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

const { default: DashboardPage } = await import('./page')

const SESSION = {
  apiToken: 'test-token',
  user: { id: 'u1', email: 'agent@demo.local', role: 'agent' },
  expires: '2099-01-01',
}

function setup() {
  mockUseRequireAuth.mockReturnValue({ status: 'authenticated' })
  mockUseSession.mockReturnValue({ data: SESSION, status: 'authenticated' })
}

describe('DashboardPage', function () {
  beforeEach(function () {
    vi.clearAllMocks()
    setup()
    localStorage.clear()
  })

  it('shows tour card when tour not dismissed', async function () {
    mockApiFetch.mockResolvedValue({
      overview: { verified_label: 'Deterministic digest', parcels: 42, messages: 12, drafts: 3 },
      urgent_tasks: [],
      market_shift: { status: 'ok', score_0_100: 61.5, freshness: { staleness: 'fresh' }, drivers: [] },
      client_milestones: [],
      follow_up_opportunities: [],
      conversation_starters: { label: 'Verified talking points', verified_facts: [], variants: [], ai_generated: false },
    })
    render(React.createElement(DashboardPage))
    await waitFor(function () {
      expect(screen.getByTestId('tour-card')).toBeTruthy()
    })
  })

  it('hides tour card after dismiss click', async function () {
    mockApiFetch.mockResolvedValue({
      overview: { verified_label: 'Deterministic digest', parcels: 42, messages: 12, drafts: 3 },
      urgent_tasks: [],
      market_shift: { status: 'ok', score_0_100: 61.5, freshness: { staleness: 'fresh' }, drivers: [] },
      client_milestones: [],
      follow_up_opportunities: [],
      conversation_starters: { label: 'Verified talking points', verified_facts: [], variants: [], ai_generated: false },
    })
    render(React.createElement(DashboardPage))
    await waitFor(function () {
      expect(screen.getByTestId('dismiss-tour-btn')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('dismiss-tour-btn'))
    expect(screen.queryByTestId('tour-card')).toBeNull()
    expect(localStorage.getItem('tour_mode_dismissed')).toBe('true')
  })

  it('hides tour card when already dismissed in localStorage', async function () {
    localStorage.setItem('tour_mode_dismissed', 'true')
    mockApiFetch.mockResolvedValue({
      overview: { verified_label: 'Deterministic digest', parcels: 42, messages: 12, drafts: 3 },
      urgent_tasks: [],
      market_shift: { status: 'ok', score_0_100: 61.5, freshness: { staleness: 'fresh' }, drivers: [] },
      client_milestones: [],
      follow_up_opportunities: [],
      conversation_starters: { label: 'Verified talking points', verified_facts: [], variants: [], ai_generated: false },
    })
    render(React.createElement(DashboardPage))
    await waitFor(function () {
      expect(screen.getByTestId('daily-digest-card')).toBeTruthy()
    })
    expect(screen.queryByTestId('tour-card')).toBeNull()
  })

  it('renders the proactive daily digest and trust framing', async function () {
    mockApiFetch.mockResolvedValue({
      generated_at: '2026-03-10T14:00:00Z',
      verified_at: '2026-03-10T14:00:00Z',
      overview: { verified_label: 'Deterministic digest', parcels: 42, messages: 12, drafts: 3 },
      urgent_tasks: [{ title: '1 source requires review', detail: 'franklin_auditor is stale', href: '/sources', severity: 'warning' }],
      market_shift: {
        status: 'ok',
        score_0_100: 61.5,
        freshness: { staleness: 'fresh', fetched_at: '2026-03-10T13:50:00Z' },
        drivers: [{ label: 'Permit momentum', value: 'moderate' }],
      },
      client_milestones: [],
      follow_up_opportunities: [],
      conversation_starters: {
        label: 'Verified talking points',
        verified_facts: ['Permit momentum is moderate.'],
        variants: [{ tone: 'email', text: 'We are seeing moderate permit momentum in your area this month.' }],
        ai_generated: false,
      },
    })
    render(React.createElement(DashboardPage))
    await waitFor(function () {
      expect(screen.getByTestId('daily-digest-card')).toBeTruthy()
    })
    expect(screen.getByTestId('market-shift-card')).toBeTruthy()
    expect(screen.getByTestId('conversation-starters-card')).toBeTruthy()
    expect(screen.getByText(/deterministic digest/i)).toBeTruthy()
  })

  it('renders urgent tasks and opportunity follow-ups', async function () {
    mockApiFetch.mockResolvedValue({
      overview: { verified_label: 'Deterministic digest', parcels: 42, messages: 12, drafts: 3 },
      urgent_tasks: [{ title: '1 source requires review', detail: 'franklin_auditor is stale', href: '/sources', severity: 'warning' }],
      market_shift: { status: 'ok', score_0_100: 61.5, freshness: { staleness: 'fresh' }, drivers: [] },
      client_milestones: [{ contact_id: 'c1', contact_name: 'Ava Agent', detail: 'Reply is waiting', href: '/contacts/c1', kind: 'reply_needed' }],
      follow_up_opportunities: [{ parcel_id: 'p1', address: '145 N High St', heat_score: 72, distress_score: 0.58, href: '/properties/p1' }],
      conversation_starters: { label: 'Verified talking points', verified_facts: [], variants: [], ai_generated: false },
    })
    render(React.createElement(DashboardPage))
    await waitFor(function () {
      expect(screen.getByTestId('urgent-tasks-card')).toBeTruthy()
    })
    expect(screen.getByTestId('follow-up-opportunities-card')).toBeTruthy()
    expect(screen.getByText('145 N High St')).toBeTruthy()
  })

  it('renders verified talking points with facts', async function () {
    mockApiFetch.mockResolvedValue({
      overview: { verified_label: 'Deterministic digest', parcels: 42, messages: 12, drafts: 3 },
      urgent_tasks: [],
      market_shift: { status: 'ok', score_0_100: 61.5, freshness: { staleness: 'fresh' }, drivers: [] },
      client_milestones: [],
      follow_up_opportunities: [],
      conversation_starters: {
        label: 'Verified talking points',
        verified_facts: ['Permit momentum is moderate.', 'Two opportunity rows are above the current heat threshold.'],
        variants: [{ tone: 'email', text: 'We are seeing moderate permit momentum in your area this month.' }],
        ai_generated: false,
      },
    })
    render(React.createElement(DashboardPage))
    await waitFor(function () {
      expect(screen.getByTestId('conversation-starters-card')).toBeTruthy()
    })
    expect(screen.getByText(/permit momentum is moderate/i)).toBeTruthy()
    expect(screen.getByText(/we are seeing moderate permit momentum/i)).toBeTruthy()
  })

  it('returns null when not authenticated', async function () {
    mockUseRequireAuth.mockReturnValue({ status: 'loading' })
    const { container } = render(React.createElement(DashboardPage))
    expect(container.firstChild).toBeNull()
    await act(async () => {})
  })
})
