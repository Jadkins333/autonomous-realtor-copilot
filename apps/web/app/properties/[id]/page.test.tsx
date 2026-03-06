import React from 'react'

import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockUseRequireAuth = vi.fn()
const mockUseSession = vi.fn()
const mockApiFetch = vi.fn()
const mockUseParams = vi.fn()

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

vi.mock('@/components/ui/badge', function () {
  return {
    Badge: function Badge(props: React.HTMLAttributes<HTMLSpanElement>) {
      return React.createElement('span', props, props.children)
    },
  }
})

vi.mock('@/components/property-map', function () {
  return {
    PropertyMap: function PropertyMap({ lat, lon }: { lat: number; lon: number }) {
      return React.createElement('div', { 'data-testid': 'property-map', 'data-lat': lat, 'data-lon': lon })
    },
  }
})

vi.mock('@/components/provenance-drawer', function () {
  return {
    ProvenanceDrawer: function ProvenanceDrawer() {
      return React.createElement('div', { 'data-testid': 'provenance-drawer' })
    },
  }
})

vi.mock('next/navigation', function () {
  return { useParams: () => mockUseParams() }
})

vi.mock('next-auth/react', function () {
  return { useSession: () => mockUseSession() }
})

vi.mock('@/lib/api', function () {
  return { apiFetch: (...args: unknown[]) => mockApiFetch(...args) }
})

const { default: PropertyDetailPage } = await import('./page')

const SESSION = {
  apiToken: 'test-token',
  user: { id: 'u1', email: 'agent@demo.local', role: 'agent' },
  expires: '2099-01-01',
}

function makeParcel(overrides: Record<string, unknown> = {}) {
  return {
    address: '123 Main St',
    parcel_number: '010-001',
    city: 'Columbus',
    state: 'OH',
    zip: '43215',
    attributes_json: { coordinates: [-82.9988, 39.9612] },
    permits_summary: { last_12_months_count: 3 },
    flood_zone: { intersects: false, zone_code: 'X' },
    transit_proximity: { score_0_100: 72 },
    nearby_pois: [],
    timeline: [],
    insights: {
      renovation_roi: { value: { roi_band: 'medium', guidance: 'Good bones.' }, formula_markdown: '# ROI', inputs: {}, provenance: {} },
      insurance_pressure: { value: { pressure_level: 'low', note: 'Low risk area.' } },
    },
    ...overrides,
  }
}

function setup() {
  mockUseRequireAuth.mockReturnValue({ status: 'authenticated' })
  mockUseSession.mockReturnValue({ data: SESSION, status: 'authenticated' })
  mockUseParams.mockReturnValue({ id: 'parcel-1' })
}

describe('PropertyDetailPage', function () {
  beforeEach(function () {
    vi.clearAllMocks()
    setup()
  })

  it('renders property detail header after load', async function () {
    mockApiFetch.mockResolvedValue(makeParcel())
    render(React.createElement(PropertyDetailPage))
    await waitFor(function () {
      expect(screen.getByTestId('property-detail-header')).toBeTruthy()
    })
    expect(screen.getByText('123 Main St')).toBeTruthy()
  })

  it('renders permits, flood, and transit badges', async function () {
    mockApiFetch.mockResolvedValue(makeParcel())
    render(React.createElement(PropertyDetailPage))
    await waitFor(function () {
      expect(screen.getByTestId('permits-badge')).toBeTruthy()
    })
    expect(screen.getByTestId('flood-intersects-badge')).toBeTruthy()
    expect(screen.getByTestId('flood-zone-badge')).toBeTruthy()
    expect(screen.getByTestId('transit-badge')).toBeTruthy()
  })

  it('shows permit count in badge', async function () {
    mockApiFetch.mockResolvedValue(makeParcel({ permits_summary: { last_12_months_count: 7 } }))
    render(React.createElement(PropertyDetailPage))
    await waitFor(function () {
      expect(screen.getByTestId('permits-badge').textContent).toContain('7')
    })
  })

  it('renders map card', async function () {
    mockApiFetch.mockResolvedValue(makeParcel())
    render(React.createElement(PropertyDetailPage))
    await waitFor(function () {
      expect(screen.getByTestId('map-card')).toBeTruthy()
    })
    expect(screen.getByTestId('property-map')).toBeTruthy()
  })

  it('shows POIs when present', async function () {
    mockApiFetch.mockResolvedValue(makeParcel({
      nearby_pois: [{ name: 'Coffee Shop', category: 'cafe', distance_meters: 120 }],
    }))
    render(React.createElement(PropertyDetailPage))
    await waitFor(function () {
      expect(screen.getByTestId('poi-item-Coffee Shop')).toBeTruthy()
    })
    expect(screen.getByText(/Coffee Shop/)).toBeTruthy()
  })

  it('shows POI empty state when no POIs', async function () {
    mockApiFetch.mockResolvedValue(makeParcel({ nearby_pois: [] }))
    render(React.createElement(PropertyDetailPage))
    await waitFor(function () {
      expect(screen.getByTestId('pois-empty')).toBeTruthy()
    })
  })

  it('renders renovation ROI insight card', async function () {
    mockApiFetch.mockResolvedValue(makeParcel())
    render(React.createElement(PropertyDetailPage))
    await waitFor(function () {
      expect(screen.getByTestId('insight-roi-card')).toBeTruthy()
    })
    expect(screen.getByText(/medium/)).toBeTruthy()
    expect(screen.getByText(/Good bones/)).toBeTruthy()
  })

  it('renders insurance pressure insight card', async function () {
    mockApiFetch.mockResolvedValue(makeParcel())
    render(React.createElement(PropertyDetailPage))
    await waitFor(function () {
      expect(screen.getByTestId('insight-insurance-card')).toBeTruthy()
    })
    expect(screen.getByText(/low/)).toBeTruthy()
    expect(screen.getByText(/Low risk area/)).toBeTruthy()
  })

  it('shows timeline events when present', async function () {
    mockApiFetch.mockResolvedValue(makeParcel({
      timeline: [
        { event_type: 'permit', occurred_at: '2025-06-01T00:00:00Z', title: 'Permit Issued', details: {} },
        { event_type: 'sale', occurred_at: '2024-01-01T00:00:00Z', title: 'Property Sale', details: {} },
      ],
    }))
    render(React.createElement(PropertyDetailPage))
    await waitFor(function () {
      expect(screen.getByTestId('timeline-event-permit')).toBeTruthy()
    })
    expect(screen.getByTestId('timeline-event-sale')).toBeTruthy()
    expect(screen.getByText('Permit Issued')).toBeTruthy()
    expect(screen.getByText('Property Sale')).toBeTruthy()
  })

  it('shows timeline empty state when no events', async function () {
    mockApiFetch.mockResolvedValue(makeParcel({ timeline: [] }))
    render(React.createElement(PropertyDetailPage))
    await waitFor(function () {
      expect(screen.getByTestId('timeline-empty')).toBeTruthy()
    })
  })

  it('uses default coordinates when attributes_json missing', async function () {
    mockApiFetch.mockResolvedValue(makeParcel({ attributes_json: null }))
    render(React.createElement(PropertyDetailPage))
    await waitFor(function () {
      const map = screen.getByTestId('property-map')
      expect(map.getAttribute('data-lon')).toBe('-82.9988')
    })
  })

  it('returns null when not authenticated', function () {
    mockUseRequireAuth.mockReturnValue({ status: 'loading' })
    const { container } = render(React.createElement(PropertyDetailPage))
    expect(container.firstChild).toBeNull()
  })
})
