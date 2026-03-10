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

vi.mock('@/components/provenance-drawer', function () {
  return {
    ProvenanceDrawer: function ProvenanceDrawer() {
      return React.createElement('div', { 'data-testid': 'provenance-drawer' }, 'Provenance')
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

vi.mock('@/components/ui/input', function () {
  return {
    Input: function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
      return React.createElement('input', props)
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

vi.mock('@/lib/commands', function () {
  return { COPILOT_COMMANDS: ['columbus market snapshot', 'draft outreach to Ava'] }
})

const { default: CopilotPage } = await import('./page')

const SESSION = {
  apiToken: 'test-token',
  user: { id: 'u1', email: 'agent@demo.local', role: 'agent' },
  expires: '2099-01-01',
}

function setup() {
  mockUseRequireAuth.mockReturnValue({ status: 'authenticated' })
  mockUseSession.mockReturnValue({ data: SESSION, status: 'authenticated' })
}

describe('CopilotPage', function () {
  beforeEach(function () {
    vi.clearAllMocks()
    setup()
    // agents sidebar fetch
    mockApiFetch.mockResolvedValue([])
  })

  it('renders input and Run button', async function () {
    render(React.createElement(CopilotPage))
    await waitFor(function () {
      expect(screen.getByTestId('copilot-input')).toBeTruthy()
    })
    expect(screen.getByTestId('copilot-run-btn')).toBeTruthy()
  })

  it('shows empty chat state initially', async function () {
    render(React.createElement(CopilotPage))
    await waitFor(function () {
      expect(screen.getByTestId('chat-empty')).toBeTruthy()
    })
  })

  it('pre-fills query with first preset command', async function () {
    render(React.createElement(CopilotPage))
    await waitFor(function () {
      const input = screen.getByTestId('copilot-input') as HTMLInputElement
      expect(input.value).toBe('columbus market snapshot')
    })
  })

  it('updates query when preset button is clicked', async function () {
    render(React.createElement(CopilotPage))
    await waitFor(function () {
      expect(screen.getByTestId('copilot-input')).toBeTruthy()
    })
    // Second preset command button
    const buttons = screen.getAllByRole('button')
    const presetBtn = buttons.find((b) => b.textContent === 'draft outreach to Ava')
    expect(presetBtn).toBeTruthy()
    fireEvent.click(presetBtn!)
    expect((screen.getByTestId('copilot-input') as HTMLInputElement).value).toBe('draft outreach to Ava')
  })

  it('appends user message and assistant response on Run', async function () {
    mockApiFetch
      .mockResolvedValueOnce([]) // agents
      .mockResolvedValueOnce({
        status: 'ok',
        text: 'Market snapshot result',
        trace: { selected_agent: 'market_snapshot_agent' },
      })

    render(React.createElement(CopilotPage))
    await waitFor(function () {
      expect(screen.getByTestId('copilot-run-btn')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('copilot-run-btn'))

    await waitFor(function () {
      expect(screen.getByTestId('chat-msg-user-0')).toBeTruthy()
    })
    expect(screen.getByTestId('chat-msg-assistant-1')).toBeTruthy()
    expect(screen.getByText('Market snapshot result')).toBeTruthy()
  })

  it('shows agent badge when trace has selected_agent', async function () {
    mockApiFetch
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({
        status: 'ok',
        text: 'Done',
        trace: { selected_agent: 'market_snapshot_agent' },
      })

    render(React.createElement(CopilotPage))
    await waitFor(function () {
      expect(screen.getByTestId('copilot-run-btn')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('copilot-run-btn'))

    await waitFor(function () {
      expect(screen.getByTestId('agent-badge')).toBeTruthy()
    })
    expect(screen.getByTestId('agent-badge').textContent).toContain('market_snapshot_agent')
  })

  it('shows trace details section when trace present', async function () {
    mockApiFetch
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({
        status: 'ok',
        text: 'Done',
        trace: { selected_agent: 'agent_x', steps: [] },
      })

    render(React.createElement(CopilotPage))
    await waitFor(function () {
      expect(screen.getByTestId('copilot-run-btn')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('copilot-run-btn'))

    await waitFor(function () {
      expect(screen.getByTestId('trace-details')).toBeTruthy()
    })
  })

  it('renders agents sidebar when agents are returned', async function () {
    mockApiFetch.mockResolvedValue([
      { key: 'market_agent', name: 'Market Agent', description: 'Snapshots' },
    ])
    render(React.createElement(CopilotPage))
    await waitFor(function () {
      expect(screen.getByTestId('sidebar-agent-market_agent')).toBeTruthy()
    })
    expect(screen.getByText('Market Agent')).toBeTruthy()
  })

  it('shows error message when API throws', async function () {
    mockApiFetch
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('API down'))

    render(React.createElement(CopilotPage))
    await waitFor(function () {
      expect(screen.getByTestId('copilot-run-btn')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('copilot-run-btn'))

    await waitFor(function () {
      expect(screen.getByText('API down')).toBeTruthy()
    })
  })

  it('returns null when not authenticated', async function () {
    mockUseRequireAuth.mockReturnValue({ status: 'loading' })
    const { container } = render(React.createElement(CopilotPage))
    expect(container.firstChild).toBeNull()
    await act(async () => {})
  })

  it('shows ai_narration panel when response includes it', async function () {
    mockApiFetch
      .mockResolvedValueOnce([]) // agents
      .mockResolvedValueOnce({
        status: 'ok',
        text: 'Market score is 72.',
        trace: { selected_agent: 'market_analyst', llm_used: true, llm_provider: 'ollama/llama3.2' },
        ai_narration: 'The market score of 72 indicates strong seller conditions.',
      })

    render(React.createElement(CopilotPage))
    await waitFor(function () {
      expect(screen.getByTestId('copilot-run-btn')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('copilot-run-btn'))

    await waitFor(function () {
      expect(screen.getByTestId('ai-narration')).toBeTruthy()
    })
    expect(screen.getByText('The market score of 72 indicates strong seller conditions.')).toBeTruthy()
    // deterministic text still present
    expect(screen.getByText('Market score is 72.')).toBeTruthy()
  })

  it('does not show ai_narration panel when narration is null', async function () {
    mockApiFetch
      .mockResolvedValueOnce([]) // agents
      .mockResolvedValueOnce({
        status: 'ok',
        text: 'Market score is 72.',
        trace: { selected_agent: 'market_analyst', llm_used: false },
        ai_narration: null,
      })

    render(React.createElement(CopilotPage))
    await waitFor(function () {
      expect(screen.getByTestId('copilot-run-btn')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('copilot-run-btn'))

    await waitFor(function () {
      expect(screen.getByTestId('chat-msg-assistant-1')).toBeTruthy()
    })
    expect(screen.queryByTestId('ai-narration')).toBeNull()
  })
})
