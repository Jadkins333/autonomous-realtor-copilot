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

vi.mock('next-auth/react', function () {
  return { useSession: () => mockUseSession() }
})

vi.mock('@/lib/api', function () {
  return { apiFetch: (...args: unknown[]) => mockApiFetch(...args) }
})

const { default: SourcesPage } = await import('./page')

const SESSION_ADMIN = {
  apiToken: 'token-admin',
  user: { id: 'u1', email: 'admin@demo.local', role: 'admin' },
  expires: '2099-01-01',
}

const SESSION_AGENT = {
  apiToken: 'token-agent',
  user: { id: 'u2', email: 'agent@demo.local', role: 'agent' },
  expires: '2099-01-01',
}

function makeSource(overrides: Partial<{
  source_name: string
  state: string
  mode: string
  is_stale: boolean
  drift_detected: boolean
  drift_reason: string | null
  dlq_count: number
  last_error: string | null
  paused_reason: string | null
  reachable: boolean | null
}> = {}) {
  return {
    source_name: overrides.source_name ?? 'franklin_auditor',
    mode: overrides.mode ?? 'fixture',
    state: overrides.state ?? 'ok',
    reachable: overrides.reachable !== undefined ? overrides.reachable : null,
    is_stale: overrides.is_stale ?? false,
    last_run_started_at: null,
    last_run_finished_at: null,
    last_success_at: null,
    last_error: overrides.last_error ?? null,
    drift_detected: overrides.drift_detected ?? false,
    drift_reason: overrides.drift_reason ?? null,
    dlq_count: overrides.dlq_count ?? 0,
    paused_reason: overrides.paused_reason ?? null,
    updated_at: '2026-03-01T00:00:00Z',
  }
}

function setupAdmin() {
  mockUseRequireAuth.mockReturnValue({ status: 'authenticated' })
  mockUseSession.mockReturnValue({ data: SESSION_ADMIN, status: 'authenticated' })
}

function setupAgent() {
  mockUseRequireAuth.mockReturnValue({ status: 'authenticated' })
  mockUseSession.mockReturnValue({ data: SESSION_AGENT, status: 'authenticated' })
}

describe('SourcesPage', function () {
  beforeEach(function () {
    vi.clearAllMocks()
  })

  it('shows loading card while fetching', function () {
    setupAdmin()
    mockApiFetch.mockReturnValue(new Promise(function () { return }))
    render(React.createElement(SourcesPage))
    expect(screen.getByTestId('loading-card')).toBeTruthy()
  })

  it('renders source cards after load', async function () {
    setupAdmin()
    mockApiFetch.mockResolvedValue({ items: [makeSource()] })
    render(React.createElement(SourcesPage))
    await waitFor(function () {
      expect(screen.getByTestId('source-card-franklin_auditor')).toBeTruthy()
    })
    expect(screen.getByLabelText(/admin actions for franklin_auditor/i)).toBeTruthy()
  })

  it('shows state badge for each source', async function () {
    setupAdmin()
    mockApiFetch.mockResolvedValue({ items: [makeSource({ state: 'partial' })] })
    render(React.createElement(SourcesPage))
    await waitFor(function () {
      expect(screen.getByTestId('state-badge-partial')).toBeTruthy()
    })
  })

  it('shows stale badge when is_stale is true', async function () {
    setupAdmin()
    mockApiFetch.mockResolvedValue({ items: [makeSource({ is_stale: true })] })
    render(React.createElement(SourcesPage))
    await waitFor(function () {
      expect(screen.getByTestId('stale-badge')).toBeTruthy()
    })
  })

  it('shows DLQ badge when dlq_count > 0', async function () {
    setupAdmin()
    mockApiFetch.mockResolvedValue({ items: [makeSource({ dlq_count: 3 })] })
    render(React.createElement(SourcesPage))
    await waitFor(function () {
      expect(screen.getByTestId('dlq-badge')).toBeTruthy()
    })
    expect(screen.getByTestId('dlq-badge').textContent).toContain('3')
  })

  it('shows per-card drift banner when source has drift', async function () {
    setupAdmin()
    mockApiFetch.mockResolvedValue({
      items: [makeSource({ drift_detected: true, drift_reason: 'schema changed' })],
    })
    render(React.createElement(SourcesPage))
    await waitFor(function () {
      expect(screen.getByTestId('drift-banner')).toBeTruthy()
    })
    expect(screen.getByTestId('drift-banner').textContent).toContain('schema changed')
  })

  it('shows global drift banner when any source has drift', async function () {
    setupAdmin()
    mockApiFetch.mockResolvedValue({
      items: [makeSource({ drift_detected: true })],
    })
    render(React.createElement(SourcesPage))
    await waitFor(function () {
      expect(screen.getByTestId('global-drift-banner')).toBeTruthy()
    })
  })

  it('shows admin role badge for admin session', async function () {
    setupAdmin()
    mockApiFetch.mockResolvedValue({ items: [] })
    render(React.createElement(SourcesPage))
    await waitFor(function () {
      expect(screen.getByTestId('role-badge-admin')).toBeTruthy()
    })
  })

  it('shows read-only role badge for agent session', async function () {
    setupAgent()
    mockApiFetch.mockResolvedValue({ items: [] })
    render(React.createElement(SourcesPage))
    await waitFor(function () {
      expect(screen.getByTestId('role-badge-readonly')).toBeTruthy()
    })
  })

  it('shows inline pause form when Pause is clicked', async function () {
    setupAdmin()
    mockApiFetch.mockResolvedValue({ items: [makeSource()] })
    render(React.createElement(SourcesPage))
    await waitFor(function () {
      expect(screen.getByTestId('pause-btn')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('pause-btn'))
    expect(screen.getByTestId('pause-form')).toBeTruthy()
    expect(screen.getByTestId('pause-submit')).toBeTruthy()
    expect(screen.getByTestId('pause-cancel')).toBeTruthy()
    expect(screen.getByLabelText(/pause reason/i)).toBeTruthy()
  })

  it('hides pause form on cancel without calling API', async function () {
    setupAdmin()
    mockApiFetch.mockResolvedValue({ items: [makeSource()] })
    render(React.createElement(SourcesPage))
    await waitFor(function () {
      expect(screen.getByTestId('pause-btn')).toBeTruthy()
    })
    mockApiFetch.mockClear()
    mockApiFetch.mockResolvedValue({ items: [makeSource()] })

    fireEvent.click(screen.getByTestId('pause-btn'))
    fireEvent.click(screen.getByTestId('pause-cancel'))
    expect(screen.queryByTestId('pause-form')).toBeNull()
    expect(mockApiFetch).not.toHaveBeenCalled()
  })

  it('shows replay two-step confirm', async function () {
    setupAdmin()
    mockApiFetch.mockResolvedValue({ items: [makeSource()] })
    render(React.createElement(SourcesPage))
    await waitFor(function () {
      expect(screen.getByTestId('replay-btn')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('replay-btn'))
    expect(screen.getByTestId('replay-confirm')).toBeTruthy()
    expect(screen.getByTestId('replay-cancel')).toBeTruthy()
  })

  it('cancels replay confirm without calling API', async function () {
    setupAdmin()
    mockApiFetch.mockResolvedValue({ items: [makeSource()] })
    render(React.createElement(SourcesPage))
    await waitFor(function () {
      expect(screen.getByTestId('replay-btn')).toBeTruthy()
    })
    mockApiFetch.mockClear()
    mockApiFetch.mockResolvedValue({ items: [makeSource()] })

    fireEvent.click(screen.getByTestId('replay-btn'))
    fireEvent.click(screen.getByTestId('replay-cancel'))
    expect(screen.queryByTestId('replay-confirm')).toBeNull()
    expect(mockApiFetch).not.toHaveBeenCalled()
  })

  it('calls resume API and shows action message', async function () {
    setupAdmin()
    mockApiFetch.mockResolvedValueOnce({ items: [makeSource({ state: 'paused' })] })
    mockApiFetch.mockResolvedValueOnce({}) // resume
    mockApiFetch.mockResolvedValueOnce({ items: [makeSource()] }) // reload

    render(React.createElement(SourcesPage))
    await waitFor(function () {
      expect(screen.getByTestId('resume-btn')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('resume-btn'))

    await waitFor(function () {
      expect(screen.getByTestId('action-message')).toBeTruthy()
    })
    expect(screen.getByTestId('action-message').textContent).toContain('resumed')
    expect(screen.getByTestId('action-message').getAttribute('aria-live')).toBe('polite')
  })

  it('shows last-error text when present', async function () {
    setupAdmin()
    mockApiFetch.mockResolvedValue({
      items: [makeSource({ last_error: 'connection refused' })],
    })
    render(React.createElement(SourcesPage))
    await waitFor(function () {
      expect(screen.getByTestId('last-error')).toBeTruthy()
    })
    expect(screen.getByTestId('last-error').textContent).toContain('connection refused')
  })

  it('shows empty state when no sources', async function () {
    setupAdmin()
    mockApiFetch.mockResolvedValue({ items: [] })
    render(React.createElement(SourcesPage))
    await waitFor(function () {
      expect(screen.getByText('No sources found.')).toBeTruthy()
    })
  })

  it('returns null when not authenticated', async function () {
    mockUseRequireAuth.mockReturnValue({ status: 'loading' })
    mockUseSession.mockReturnValue({ data: null, status: 'loading' })
    const { container } = render(React.createElement(SourcesPage))
    expect(container.firstChild).toBeNull()
    await act(async () => {})
  })
})
