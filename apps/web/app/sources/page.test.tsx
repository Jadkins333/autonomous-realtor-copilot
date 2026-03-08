/**
 * Unit tests for the Sources admin page.
 *
 * Strategy: mock apiFetch, next-auth session, auth-guard, and UI primitives
 * so the component renders in a jsdom environment without a real API or router.
 */

import React from 'react'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/components/auth-guard', () => ({
  useRequireAuth: () => ({ status: 'authenticated' }),
}))

vi.mock('@/components/site-shell', () => ({
  SiteShell: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'site-shell' }, children),
}))

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className, ...rest }: React.HTMLAttributes<HTMLSpanElement>) =>
    React.createElement('span', { className, ...rest }, children),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement('button', { onClick, disabled, ...rest }, children),
}))

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement('div', { 'data-testid': 'card', ...rest }, children),
  CardTitle: ({ children }: React.HTMLAttributes<HTMLHeadingElement>) =>
    React.createElement('h3', null, children),
  CardDescription: ({ children }: React.HTMLAttributes<HTMLParagraphElement>) =>
    React.createElement('p', null, children),
}))

const mockApiFetch = vi.fn()
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

const mockUseSession = vi.fn()
vi.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}))

function agentSession() {
  return {
    data: { apiToken: 'tok', user: { email: 'a@b.com', role: 'agent' } },
    status: 'authenticated',
  }
}

function adminSession() {
  return {
    data: { apiToken: 'tok', user: { email: 'a@b.com', role: 'admin' } },
    status: 'authenticated',
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    source_name: 'franklin_auditor',
    mode: 'fixture',
    state: 'partial',
    reachable: null,
    is_stale: true,
    last_run_started_at: null,
    last_run_finished_at: null,
    last_success_at: null,
    last_error: 'Live source unavailable',
    drift_detected: false,
    drift_reason: null,
    dlq_count: 0,
    paused_reason: null,
    updated_at: '2026-03-07T00:00:00+00:00',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Lazy-import so mocks are registered before the module loads.
async function importPage() {
  const mod = await import('./page')
  return mod.default
}

describe('SourcesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSession.mockReturnValue(agentSession())
  })

  it('renders source cards when API returns items', async () => {
    mockApiFetch.mockResolvedValue({ items: [makeItem()] })
    const Page = await importPage()
    render(React.createElement(Page))

    await waitFor(() => {
      expect(screen.getByTestId('source-card-franklin_auditor')).toBeTruthy()
    })
    expect(screen.getByText('franklin_auditor')).toBeTruthy()
  })

  it('shows stale badge when is_stale=true', async () => {
    mockApiFetch.mockResolvedValue({ items: [makeItem({ is_stale: true })] })
    const Page = await importPage()
    render(React.createElement(Page))

    await waitFor(() => {
      expect(screen.getByTestId('stale-badge')).toBeTruthy()
    })
  })

  it('shows DLQ badge when dlq_count > 0', async () => {
    mockApiFetch.mockResolvedValue({ items: [makeItem({ dlq_count: 5 })] })
    const Page = await importPage()
    render(React.createElement(Page))

    await waitFor(() => {
      expect(screen.getByTestId('dlq-badge')).toBeTruthy()
    })
    expect(screen.getByTestId('dlq-badge').textContent).toContain('5')
  })

  it('shows per-card drift banner when drift_detected=true', async () => {
    mockApiFetch.mockResolvedValue({
      items: [makeItem({ drift_detected: true, drift_reason: 'schema mismatch' })],
    })
    const Page = await importPage()
    render(React.createElement(Page))

    await waitFor(() => {
      expect(screen.getByTestId('drift-banner')).toBeTruthy()
    })
    expect(screen.getByTestId('drift-banner').textContent).toContain('schema mismatch')
  })

  it('shows global drift banner when any source has drift', async () => {
    mockApiFetch.mockResolvedValue({
      items: [makeItem({ drift_detected: true })],
    })
    const Page = await importPage()
    render(React.createElement(Page))

    await waitFor(() => {
      expect(screen.getByTestId('global-drift-banner')).toBeTruthy()
    })
  })

  it('shows read-only badge for agent role', async () => {
    mockApiFetch.mockResolvedValue({ items: [] })
    const Page = await importPage()
    render(React.createElement(Page))

    await waitFor(() => {
      expect(screen.getByTestId('role-badge-readonly')).toBeTruthy()
    })
  })

  it('shows admin badge for admin role', async () => {
    mockUseSession.mockReturnValue(adminSession())
    mockApiFetch.mockResolvedValue({ items: [] })
    const Page = await importPage()
    render(React.createElement(Page))

    await waitFor(() => {
      expect(screen.getByTestId('role-badge-admin')).toBeTruthy()
    })
  })

  it('pause button is disabled for non-admin', async () => {
    mockApiFetch.mockResolvedValue({ items: [makeItem()] })
    const Page = await importPage()
    render(React.createElement(Page))

    await waitFor(() => {
      expect(screen.getByTestId('pause-btn')).toBeTruthy()
    })
    expect((screen.getByTestId('pause-btn') as HTMLButtonElement).disabled).toBe(true)
  })

  it('clicking Pause shows inline form for admin', async () => {
    mockUseSession.mockReturnValue(adminSession())
    mockApiFetch.mockResolvedValue({ items: [makeItem()] })
    const Page = await importPage()
    render(React.createElement(Page))

    await waitFor(() => {
      expect(screen.getByTestId('pause-btn')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('pause-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('pause-form')).toBeTruthy()
    })
    expect(screen.getByTestId('pause-submit')).toBeTruthy()
    expect(screen.getByTestId('pause-cancel')).toBeTruthy()
  })

  it('clicking Cancel on pause form hides it', async () => {
    mockUseSession.mockReturnValue(adminSession())
    mockApiFetch.mockResolvedValue({ items: [makeItem()] })
    const Page = await importPage()
    render(React.createElement(Page))

    await waitFor(() => {
      expect(screen.getByTestId('pause-btn')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('pause-btn'))
    await waitFor(() => {
      expect(screen.getByTestId('pause-form')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('pause-cancel'))

    await waitFor(() => {
      expect(screen.queryByTestId('pause-form')).toBeNull()
    })
  })

  it('clicking Replay DLQ shows confirm step', async () => {
    mockUseSession.mockReturnValue(adminSession())
    mockApiFetch.mockResolvedValue({ items: [makeItem()] })
    const Page = await importPage()
    render(React.createElement(Page))

    await waitFor(() => {
      expect(screen.getByTestId('replay-btn')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('replay-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('replay-confirm')).toBeTruthy()
      expect(screen.getByTestId('replay-cancel')).toBeTruthy()
    })
  })

  it('shows "No sources found" when items is empty', async () => {
    mockApiFetch.mockResolvedValue({ items: [] })
    const Page = await importPage()
    render(React.createElement(Page))

    await waitFor(() => {
      expect(screen.getByText('No sources found.')).toBeTruthy()
    })
  })

  it('shows error message when apiFetch rejects', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'))
    const Page = await importPage()
    render(React.createElement(Page))

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeTruthy()
    })
  })
})
