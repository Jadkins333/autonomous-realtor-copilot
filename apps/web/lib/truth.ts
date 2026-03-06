export type TruthFreshness = {
 fetched_at: string | null
 ttl_seconds: number | null
 staleness: string | null
 is_stale: boolean | null
}

export type TruthInput = {
 value: unknown
 fields: string[]
 ids: string[]
}

export type TruthProvenanceItem = {
 source_id: string | null
 raw_url: string
 provenance_record_id?: string | null
 freshness: TruthFreshness
}

export type TruthCoverageSummary = {
 coverage_pct: number
 required_total: number
 required_present: number
 missing_required: string[]
}

export type TruthMetricResponse = {
 status: 'ok' | 'insufficient_data'
 insufficient_data: boolean
 formula_key: string
 formula_version: string
 formula_markdown: string
 computed_at: string
 value: Record<string, unknown>
 inputs: Record<string, TruthInput>
 provenance: { sources: TruthProvenanceItem[] }
 freshness: TruthFreshness
 coverage_summary: TruthCoverageSummary
 missing_inputs?: string[]
}

export function isTruthMetricResponse(payload: unknown): payload is TruthMetricResponse {
 if (!payload || typeof payload !== 'object') return false
 const row = payload as Record<string, unknown>
 const freshness = row.freshness as Record<string, unknown> | undefined
 const provenance = row.provenance as Record<string, unknown> | undefined
 const coverage = row.coverage_summary as Record<string, unknown> | undefined

 if (typeof row.formula_key !== 'string' || typeof row.formula_version !== 'string') return false
 if (typeof row.formula_markdown !== 'string' || typeof row.computed_at !== 'string') return false
 if (!freshness || typeof freshness !== 'object') return false
 if (!('fetched_at' in freshness) || !('ttl_seconds' in freshness) || !('is_stale' in freshness)) return false
 const sources = provenance?.sources
 if (!Array.isArray(sources)) return false
 if (!coverage || typeof coverage.coverage_pct !== 'number') return false

 return true
}
