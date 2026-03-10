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

const { default: SequencesPage } = await import('./page')

const SESSION = {
  apiToken: 'token-agent',
  user: { id: 'u1', email: 'agent@demo.local', role: 'agent' },
  expires: '2099-01-01',
}

function makeSequence(overrides: Partial<{
  id: string
  key: string
  name: string
  description: string
  is_enabled: boolean
  sandbox_only: boolean
  steps: unknown[]
}> = {}) {
  return {
    id: overrides.id ?? 'seq-1',
    key: overrides.key ?? 'welcome',
    name: overrides.name ?? 'Welcome Sequence',
    description: overrides.description ?? 'Intro drip for new contacts',
    is_enabled: overrides.is_enabled !== undefined ? overrides.is_enabled : true,
    sandbox_only: overrides.sandbox_only !== undefined ? overrides.sandbox_only : true,
    steps: overrides.steps ?? [
      {
        id: 'step-1',
        step_order: 1,
        delay_minutes: 0,
        channel: 'email',
        template_subject: 'Welcome!',
        template_body: 'Thanks for connecting.',
        stop_on_reply: true,
      },
    ],
  }
}

function setup() {
  mockUseRequireAuth.mockReturnValue({ status: 'authenticated' })
  mockUseSession.mockReturnValue({ data: SESSION, status: 'authenticated' })
}

describe('SequencesPage', function () {
  beforeEach(function () {
    vi.clearAllMocks()
  })

  it('returns null when not authenticated', async function () {
    mockUseRequireAuth.mockReturnValue({ status: 'loading' })
    mockUseSession.mockReturnValue({ data: null, status: 'loading' })
    mockApiFetch.mockReturnValue(new Promise(() => {}))
    const { container } = render(React.createElement(SequencesPage))
    expect(container.firstChild).toBeNull()
    await act(async () => {})
  })

  it('shows loading skeleton while fetching', async function () {
    setup()
    mockApiFetch.mockReturnValue(new Promise(() => {}))
    render(React.createElement(SequencesPage))
    await waitFor(() => {
      expect(screen.getByTestId('sequences-loading')).toBeTruthy()
    })
  })

  it('renders sequence cards', async function () {
    setup()
    mockApiFetch.mockResolvedValue([makeSequence()])
    render(React.createElement(SequencesPage))
    await waitFor(() => {
      expect(screen.getByTestId('sequence-card-welcome')).toBeTruthy()
      expect(screen.getByText('Welcome Sequence')).toBeTruthy()
    })
  })

  it('shows sandbox badge for sandbox_only sequences', async function () {
    setup()
    mockApiFetch.mockResolvedValue([makeSequence({ sandbox_only: true })])
    render(React.createElement(SequencesPage))
    await waitFor(() => {
      expect(screen.getByText('Sandbox')).toBeTruthy()
    })
  })

  it('explains that sandbox-only sequences still depend on server send authority', async function () {
    setup()
    mockApiFetch.mockResolvedValue([makeSequence({ id: 'seq-sandbox-note', sandbox_only: true })])
    render(React.createElement(SequencesPage))
    await waitFor(() => {
      expect(screen.getByTestId('sequence-note-seq-sandbox-note')).toBeTruthy()
    })
    expect(screen.getByTestId('sequence-note-seq-sandbox-note').textContent).toContain(
      'server send mode and provider availability',
    )
  })

  it('shows disabled badge for disabled sequences', async function () {
    setup()
    mockApiFetch.mockResolvedValue([makeSequence({ is_enabled: false })])
    render(React.createElement(SequencesPage))
    await waitFor(() => {
      expect(screen.getByText('Disabled')).toBeTruthy()
    })
  })

  it('shows empty state when no sequences', async function () {
    setup()
    mockApiFetch.mockResolvedValue([])
    render(React.createElement(SequencesPage))
    await waitFor(() => {
      expect(screen.getByTestId('empty-sequences')).toBeTruthy()
    })
  })

  it('expands steps when show-steps button clicked', async function () {
    setup()
    const seq = makeSequence({ id: 'seq-expand', key: 'expand-test' })
    mockApiFetch.mockResolvedValue([seq])
    render(React.createElement(SequencesPage))
    await waitFor(() => expect(screen.getByTestId('sequence-card-expand-test')).toBeTruthy())

    const stepsEl = screen.getByTestId('sequence-steps-seq-expand')
    // Initially collapsed (opacity-0 / max-h-0)
    expect(stepsEl.className).toContain('max-h-0')

    const toggleBtn = screen.getByText(/show steps/i)
    fireEvent.click(toggleBtn)
    expect(stepsEl.className).toContain('max-h-[600px]')
  })

  it('opens enroll form and lazy-loads contacts', async function () {
    setup()
    const seq = makeSequence({ id: 'seq-enroll', key: 'enroll-test' })
    // First call: sequences; second call: contacts (lazy)
    mockApiFetch
      .mockResolvedValueOnce([seq])
      .mockResolvedValueOnce([{ id: 'c1', name: 'Alice', email: 'alice@test.com' }])
    render(React.createElement(SequencesPage))
    await waitFor(() => expect(screen.getByTestId('enroll-btn-seq-enroll')).toBeTruthy())

    fireEvent.click(screen.getByTestId('enroll-btn-seq-enroll'))
    await waitFor(() => {
      expect(screen.getByTestId('enroll-confirm-seq-enroll')).toBeTruthy()
      expect(screen.getByText(/alice/i)).toBeTruthy()
    })
  })

  it('shows enroll error result on API failure', async function () {
    setup()
    const seq = makeSequence({ id: 'seq-err', key: 'err-test' })
    mockApiFetch
      .mockResolvedValueOnce([seq])
      .mockResolvedValueOnce([{ id: 'c1', name: 'Bob', email: null }])
      .mockRejectedValueOnce(new Error('Enrollment failed'))
    render(React.createElement(SequencesPage))
    await waitFor(() => expect(screen.getByTestId('enroll-btn-seq-err')).toBeTruthy())

    fireEvent.click(screen.getByTestId('enroll-btn-seq-err'))
    await waitFor(() => expect(screen.getByTestId('enroll-confirm-seq-err')).toBeTruthy())

    // Select a contact
    const sel = screen.getByTestId('enroll-contact-select-seq-err') as HTMLSelectElement
    fireEvent.change(sel, { target: { value: 'c1' } })

    // Confirm
    const confirmBtn = screen.getByText(/confirm enroll/i)
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(screen.getByTestId('enroll-result-seq-err')).toBeTruthy()
      expect(screen.getByText(/error/i)).toBeTruthy()
    })
  })

  it('shows success result after enroll', async function () {
    setup()
    const seq = makeSequence({ id: 'seq-ok', key: 'ok-test' })
    mockApiFetch
      .mockResolvedValueOnce([seq])
      .mockResolvedValueOnce([{ id: 'c2', name: 'Carol', email: 'carol@test.com' }])
      .mockResolvedValueOnce({ enrollment_id: 'e1', state: 'active' })
    render(React.createElement(SequencesPage))
    await waitFor(() => expect(screen.getByTestId('enroll-btn-seq-ok')).toBeTruthy())

    fireEvent.click(screen.getByTestId('enroll-btn-seq-ok'))
    await waitFor(() => expect(screen.getByTestId('enroll-confirm-seq-ok')).toBeTruthy())

    const sel = screen.getByTestId('enroll-contact-select-seq-ok') as HTMLSelectElement
    fireEvent.change(sel, { target: { value: 'c2' } })
    fireEvent.click(screen.getByText(/confirm enroll/i))

    await waitFor(() => {
      expect(screen.getByTestId('enroll-result-seq-ok')).toBeTruthy()
      expect(screen.getByText(/enrolled successfully/i)).toBeTruthy()
    })
  })
})
