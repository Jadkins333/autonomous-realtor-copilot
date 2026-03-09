import React from 'react'

import { act, render, screen, waitFor } from '@testing-library/react'
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

const { default: CopilotAgentsPage } = await import('./page')

const SESSION = {
  apiToken: 'test-token',
  user: { id: 'u1', email: 'agent@demo.local', role: 'agent' },
  expires: '2099-01-01',
}

function setup() {
  mockUseRequireAuth.mockReturnValue({ status: 'authenticated' })
  mockUseSession.mockReturnValue({ data: SESSION, status: 'authenticated' })
}

describe('CopilotAgentsPage', function () {
  beforeEach(function () {
    vi.clearAllMocks()
    setup()
  })

  it('renders an agent card for each agent', async function () {
    mockApiFetch.mockResolvedValue([
      { key: 'market_agent', name: 'Market Agent', description: 'Market snapshots', mission: 'Help with market data', sample_prompts: ['columbus market snapshot'] },
      { key: 'outreach_agent', name: 'Outreach Agent', description: 'Draft messages', mission: 'Help with outreach', sample_prompts: [] },
    ])
    render(React.createElement(CopilotAgentsPage))
    await waitFor(function () {
      expect(screen.getByTestId('agent-card-market_agent')).toBeTruthy()
    })
    expect(screen.getByTestId('agent-card-outreach_agent')).toBeTruthy()
  })

  it('renders agent name, description, and mission', async function () {
    mockApiFetch.mockResolvedValue([
      { key: 'agent_x', name: 'Agent X', description: 'Does X', mission: 'Mission X', sample_prompts: [] },
    ])
    render(React.createElement(CopilotAgentsPage))
    await waitFor(function () {
      expect(screen.getByText('Agent X')).toBeTruthy()
    })
    expect(screen.getByText('Does X')).toBeTruthy()
    expect(screen.getByText('Mission X')).toBeTruthy()
  })

  it('renders sample prompts when present', async function () {
    mockApiFetch.mockResolvedValue([
      { key: 'agent_y', name: 'Agent Y', description: 'Desc', mission: 'Mission', sample_prompts: ['try this', 'try that'] },
    ])
    render(React.createElement(CopilotAgentsPage))
    await waitFor(function () {
      expect(screen.getByText('• try this')).toBeTruthy()
    })
    expect(screen.getByText('• try that')).toBeTruthy()
  })

  it('shows empty agents grid when no agents returned', async function () {
    mockApiFetch.mockResolvedValue([])
    render(React.createElement(CopilotAgentsPage))
    await waitFor(function () {
      expect(screen.getByTestId('agents-grid')).toBeTruthy()
    })
    expect(screen.queryByTestId(/^agent-card-/)).toBeNull()
  })

  it('handles API error gracefully (empty grid)', async function () {
    mockApiFetch.mockRejectedValue(new Error('network error'))
    render(React.createElement(CopilotAgentsPage))
    await waitFor(function () {
      expect(screen.getByTestId('agents-grid')).toBeTruthy()
    })
    expect(screen.queryByTestId(/^agent-card-/)).toBeNull()
  })

  it('returns null when not authenticated', async function () {
    mockUseRequireAuth.mockReturnValue({ status: 'loading' })
    const { container } = render(React.createElement(CopilotAgentsPage))
    expect(container.firstChild).toBeNull()
    await act(async () => {})
  })
})
