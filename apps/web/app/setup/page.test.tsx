import React from 'react'

import { render, screen, waitFor } from '@testing-library/react'
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

vi.mock('@/components/ui/button', function () {
  return {
    Button: function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
      return React.createElement('button', props, props.children)
    },
  }
})

vi.mock('next-auth/react', function () {
  return { useSession: () => mockUseSession() }
})

vi.mock('@/lib/api', function () {
  return { apiFetch: (...args: unknown[]) => mockApiFetch(...args) }
})

const { default: SetupPage } = await import('./page')

const SESSION = {
  apiToken: 'test-token',
  user: { id: 'u1', email: 'admin@demo.local', role: 'admin' },
  expires: '2099-01-01',
}

function makeDiag(overrides: Record<string, unknown> = {}) {
  return {
    env_checklist: {
      SANDBOX_MODE: true,
      DATABASE_URL: true,
      REDIS_URL: false,
      JWT_SECRET: true,
      NEXTAUTH_URL: true,
      NEXT_PUBLIC_API_URL: true,
      EXPO_PUBLIC_API_BASE_URL: false,
      DEFAULT_LOCALE: true,
    },
    default_locale: 'columbus_oh',
    locale_notice: 'Locale fixtures are currently static.',
    ...overrides,
  }
}

function makeSource(name: string, state = 'ok') {
  return {
    source_name: name,
    mode: 'fixture',
    state,
    drift_detected: false,
    dlq_count: 0,
    last_error: null,
    last_run_finished_at: null,
  }
}

function setup() {
  mockUseRequireAuth.mockReturnValue({ status: 'authenticated' })
  mockUseSession.mockReturnValue({ data: SESSION, status: 'authenticated' })
}

describe('SetupPage', function () {
  beforeEach(function () {
    vi.clearAllMocks()
    setup()
  })

  it('renders copy buttons for each command', async function () {
    mockApiFetch.mockResolvedValueOnce(makeDiag())
    mockApiFetch.mockResolvedValueOnce({ items: [] })
    render(React.createElement(SetupPage))
    await waitFor(function () {
      expect(screen.getByTestId('copy-cmd-project:setup')).toBeTruthy()
    })
    expect(screen.getByTestId('copy-cmd-project:doctor')).toBeTruthy()
    expect(screen.getByTestId('copy-cmd-smoke')).toBeTruthy()
  })

  it('renders env key checklist items', async function () {
    mockApiFetch.mockResolvedValueOnce(makeDiag())
    mockApiFetch.mockResolvedValueOnce({ items: [] })
    render(React.createElement(SetupPage))
    await waitFor(function () {
      expect(screen.getByTestId('env-key-SANDBOX_MODE')).toBeTruthy()
    })
    expect(screen.getByTestId('env-key-DATABASE_URL')).toBeTruthy()
    expect(screen.getByTestId('env-key-JWT_SECRET')).toBeTruthy()
  })

  it('shows configured/missing status for env keys', async function () {
    mockApiFetch.mockResolvedValueOnce(makeDiag())
    mockApiFetch.mockResolvedValueOnce({ items: [] })
    render(React.createElement(SetupPage))
    await waitFor(function () {
      expect(screen.getByTestId('env-key-SANDBOX_MODE')).toBeTruthy()
    })
    // SANDBOX_MODE=true → configured
    const sandboxCard = screen.getByTestId('env-key-SANDBOX_MODE')
    expect(sandboxCard.textContent).toContain('configured')
    // REDIS_URL=false → missing
    const redisCard = screen.getByTestId('env-key-REDIS_URL')
    expect(redisCard.textContent).toContain('missing')
  })

  it('renders source rows when sources returned', async function () {
    mockApiFetch.mockResolvedValueOnce(makeDiag())
    mockApiFetch.mockResolvedValueOnce({ items: [makeSource('franklin_auditor'), makeSource('permits_api')] })
    render(React.createElement(SetupPage))
    await waitFor(function () {
      expect(screen.getByTestId('source-row-franklin_auditor')).toBeTruthy()
    })
    expect(screen.getByTestId('source-row-permits_api')).toBeTruthy()
  })

  it('shows no source status rows text when empty', async function () {
    mockApiFetch.mockResolvedValueOnce(makeDiag())
    mockApiFetch.mockResolvedValueOnce({ items: [] })
    render(React.createElement(SetupPage))
    await waitFor(function () {
      expect(screen.getByText('No source status rows found.')).toBeTruthy()
    })
  })

  it('renders diagnostics pre block', async function () {
    mockApiFetch.mockResolvedValueOnce(makeDiag({ default_locale: 'columbus_oh' }))
    mockApiFetch.mockResolvedValueOnce({ items: [] })
    render(React.createElement(SetupPage))
    await waitFor(function () {
      expect(screen.getByTestId('diagnostics-pre')).toBeTruthy()
    })
  })

  it('shows error card when API fails', async function () {
    mockApiFetch.mockRejectedValue(new Error('network error'))
    render(React.createElement(SetupPage))
    await waitFor(function () {
      expect(screen.getByTestId('setup-error')).toBeTruthy()
    })
  })

  it('shows last_error for source when present', async function () {
    mockApiFetch.mockResolvedValueOnce(makeDiag())
    mockApiFetch.mockResolvedValueOnce({
      items: [{ ...makeSource('bad_source'), last_error: 'connection refused' }],
    })
    render(React.createElement(SetupPage))
    await waitFor(function () {
      expect(screen.getByTestId('source-row-bad_source')).toBeTruthy()
    })
    expect(screen.getByText(/connection refused/)).toBeTruthy()
  })

  it('returns null when not authenticated', function () {
    mockUseRequireAuth.mockReturnValue({ status: 'loading' })
    const { container } = render(React.createElement(SetupPage))
    expect(container.firstChild).toBeNull()
  })
})
