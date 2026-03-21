import React from 'react'

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockUseRequireAuth = vi.fn()
const mockGetSession = vi.fn()
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

vi.mock('@/components/ui/input', function () {
  return {
    Input: function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
      return React.createElement('input', props)
    },
  }
})

vi.mock('@/components/ui/table', function () {
  return {
    Table: function Table(props: React.HTMLAttributes<HTMLTableElement>) {
      return React.createElement('table', props, props.children)
    },
    Th: function Th(props: React.ThHTMLAttributes<HTMLTableCellElement>) {
      return React.createElement('th', props, props.children)
    },
    Td: function Td(props: React.TdHTMLAttributes<HTMLTableCellElement>) {
      return React.createElement('td', props, props.children)
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
  return { getSession: () => mockGetSession() }
})

vi.mock('@/lib/api', function () {
  return { apiFetch: (...args: unknown[]) => mockApiFetch(...args) }
})

const { default: PropertiesPage } = await import('./page')

const SESSION = {
  apiToken: 'test-token',
  user: { id: 'u1', email: 'agent@demo.local', role: 'agent' },
  expires: '2099-01-01',
}

function makeRow(overrides: Partial<{ id: string; address: string; parcel_number: string; city: string; updated_at: string }> = {}) {
  return {
    id: overrides.id ?? 'row-1',
    address: overrides.address ?? '123 Main St',
    parcel_number: overrides.parcel_number ?? '010-001-001',
    city: overrides.city ?? 'Columbus',
    updated_at: overrides.updated_at ?? '2026-01-01T00:00:00Z',
  }
}

function setup() {
  mockUseRequireAuth.mockReturnValue({ status: 'authenticated' })
  mockGetSession.mockResolvedValue(SESSION)
}

describe('PropertiesPage', function () {
  beforeEach(function () {
    vi.clearAllMocks()
    setup()
  })

  it('renders search input and button', function () {
    render(React.createElement(PropertiesPage))
    expect(screen.getByTestId('property-search-input')).toBeTruthy()
    expect(screen.getByTestId('property-search-btn')).toBeTruthy()
  })

  it('shows Search button text by default', function () {
    render(React.createElement(PropertiesPage))
    expect(screen.getByTestId('property-search-btn').textContent).toContain('Search')
  })

  it('shows empty state row before search', function () {
    render(React.createElement(PropertiesPage))
    expect(screen.getByTestId('property-empty-state')).toBeTruthy()
  })

  it('renders result rows after successful search', async function () {
    const rows = [
      makeRow({ id: 'p1', address: '100 High St' }),
      makeRow({ id: 'p2', address: '200 Oak Ave' }),
    ]
    mockApiFetch.mockResolvedValue(rows)
    render(React.createElement(PropertiesPage))
    fireEvent.click(screen.getByTestId('property-search-btn'))
    await waitFor(function () {
      expect(screen.getByTestId('property-row-p1')).toBeTruthy()
    })
    expect(screen.getByTestId('property-row-p2')).toBeTruthy()
  })

  it('renders address, parcel, city for each row', async function () {
    mockApiFetch.mockResolvedValue([makeRow({ id: 'p3', address: '55 Elm Rd', parcel_number: '010-999', city: 'Dublin' })])
    render(React.createElement(PropertiesPage))
    fireEvent.click(screen.getByTestId('property-search-btn'))
    await waitFor(function () {
      expect(screen.getByTestId('property-row-p3')).toBeTruthy()
    })
    expect(screen.getByText('55 Elm Rd')).toBeTruthy()
    expect(screen.getByText('010-999')).toBeTruthy()
    expect(screen.getByText('Dublin')).toBeTruthy()
  })

  it('address is a link to /properties/[id]', async function () {
    mockApiFetch.mockResolvedValue([makeRow({ id: 'p4', address: '77 Pine Blvd' })])
    render(React.createElement(PropertiesPage))
    fireEvent.click(screen.getByTestId('property-search-btn'))
    await waitFor(function () {
      expect(screen.getByText('77 Pine Blvd')).toBeTruthy()
    })
    const link = screen.getByText('77 Pine Blvd').closest('a')
    expect(link?.getAttribute('href')).toBe('/properties/p4')
  })

  it('hides empty state when results returned', async function () {
    mockApiFetch.mockResolvedValue([makeRow({ id: 'p5' })])
    render(React.createElement(PropertiesPage))
    fireEvent.click(screen.getByTestId('property-search-btn'))
    await waitFor(function () {
      expect(screen.getByTestId('property-row-p5')).toBeTruthy()
    })
    expect(screen.queryByTestId('property-empty-state')).toBeNull()
  })

  it('calls apiFetch with encoded query string', async function () {
    mockApiFetch.mockResolvedValue([])
    render(React.createElement(PropertiesPage))
    fireEvent.change(screen.getByTestId('property-search-input'), { target: { value: 'High Street' } })
    fireEvent.click(screen.getByTestId('property-search-btn'))
    await waitFor(function () {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('High%20Street'),
        SESSION.apiToken,
      )
    })
  })

  it('returns null when not authenticated', async function () {
    mockUseRequireAuth.mockReturnValue({ status: 'loading' })
    const { container } = render(React.createElement(PropertiesPage))
    expect(container.firstChild).toBeNull()
    await act(async () => {})
  })
})
