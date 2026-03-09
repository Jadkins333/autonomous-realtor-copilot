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
    mockApiFetch.mockResolvedValue({})
    render(React.createElement(DashboardPage))
    await waitFor(function () {
      expect(screen.getByTestId('tour-card')).toBeTruthy()
    })
  })

  it('hides tour card after dismiss click', async function () {
    mockApiFetch.mockResolvedValue({})
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
    mockApiFetch.mockResolvedValue({})
    render(React.createElement(DashboardPage))
    await waitFor(function () {
      expect(screen.getByTestId('sources-health-card')).toBeTruthy()
    })
    expect(screen.queryByTestId('tour-card')).toBeNull()
  })

  it('renders three feature info cards', async function () {
    mockApiFetch.mockResolvedValue({})
    render(React.createElement(DashboardPage))
    await waitFor(function () {
      expect(screen.getByTestId('demo-mode-card')).toBeTruthy()
    })
    expect(screen.getByTestId('connectors-card')).toBeTruthy()
    expect(screen.getByTestId('truth-layer-card')).toBeTruthy()
  })

  it('renders sources health card', async function () {
    mockApiFetch.mockResolvedValue({})
    render(React.createElement(DashboardPage))
    await waitFor(function () {
      expect(screen.getByTestId('sources-health-card')).toBeTruthy()
    })
  })

  it('shows ok/partial/failed/stale badges from sources status', async function () {
    mockApiFetch
      .mockResolvedValueOnce({}) // /metrics
      .mockResolvedValueOnce({
        items: [
          { source_name: 'a', state: 'ok', drift_detected: false, is_stale: false },
          { source_name: 'b', state: 'partial', drift_detected: false, is_stale: true },
          { source_name: 'c', state: 'failed', drift_detected: false, is_stale: false },
        ],
      })
    render(React.createElement(DashboardPage))
    await waitFor(function () {
      expect(screen.getByTestId('ok-badge')).toBeTruthy()
    })
    expect(screen.getByTestId('partial-badge')).toBeTruthy()
    expect(screen.getByTestId('failed-badge')).toBeTruthy()
    expect(screen.getByTestId('stale-badge')).toBeTruthy()
  })

  it('shows drift alert when a source has drift', async function () {
    mockApiFetch
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        items: [
          { source_name: 'franklin_auditor', state: 'partial', drift_detected: true, is_stale: false },
        ],
      })
    render(React.createElement(DashboardPage))
    await waitFor(function () {
      expect(screen.getByTestId('drift-alert')).toBeTruthy()
    })
    expect(screen.getByTestId('drift-alert').textContent).toContain('franklin_auditor')
  })

  it('shows no-sources message when items list is empty', async function () {
    mockApiFetch
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ items: [] })
    render(React.createElement(DashboardPage))
    await waitFor(function () {
      expect(screen.getByTestId('no-sources')).toBeTruthy()
    })
  })

  it('renders metrics card', async function () {
    mockApiFetch
      .mockResolvedValueOnce({ total_parcels: 42 })
      .mockResolvedValueOnce({ items: [] })
    render(React.createElement(DashboardPage))
    await waitFor(function () {
      expect(screen.getByTestId('metrics-card')).toBeTruthy()
    })
  })

  it('returns null when not authenticated', async function () {
    mockUseRequireAuth.mockReturnValue({ status: 'loading' })
    const { container } = render(React.createElement(DashboardPage))
    expect(container.firstChild).toBeNull()
    await act(async () => {})
  })
})
