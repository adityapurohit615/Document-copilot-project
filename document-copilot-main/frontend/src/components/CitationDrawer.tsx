import { useEffect, useState } from 'react'
import { fetchChunkDetail, type ChunkDetail, type CitationItem } from '../lib/api'

interface CitationDrawerProps {
  citation: CitationItem | null
  onClose: () => void
}

export function CitationDrawer({ citation, onClose }: CitationDrawerProps) {
  const [detail, setDetail] = useState<ChunkDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  // Handle ESC key press to close drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Fetch full chunk details when citation changes
  useEffect(() => {
    if (!citation?.chunk_id) {
      setDetail(null)
      return
    }

    let isMounted = true
    setLoading(true)

    fetchChunkDetail(citation.chunk_id)
      .then((data) => {
        if (isMounted) setDetail(data)
      })
      .catch((err) => {
        console.error('Failed to load chunk detail:', err)
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [citation?.chunk_id])

  if (!citation) return null

  const handleCopyChunkId = () => {
    navigator.clipboard.writeText(citation.chunk_id)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Panel */}
      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <aside className="w-screen max-w-lg transform bg-white shadow-2xl transition-transform duration-300 ease-in-out flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700">
                {citation.ticker}
              </span>
              <div>
                <h3 className="text-sm font-semibold text-slate-800">
                  {detail?.company_name || citation.company_name || 'SEC Filing'}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {detail ? `Form ${detail.filing_type} • Filed ${detail.filing_date}` : 'Grounded Passage'}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              aria-label="Close drawer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Cited Snippet Card */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
                  Verified Quoted Snippet
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                  Grounded Evidence
                </span>
              </div>
              <div className="rounded-xl border-l-4 border-amber-500 bg-amber-50/50 p-4 shadow-sm">
                <p className="text-sm italic leading-relaxed text-slate-800">
                  "{citation.snippet}"
                </p>
              </div>
            </div>

            {/* Full Filing Passage Context */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Full Passage Context {detail ? `(Chunk #${detail.chunk_index})` : ''}
                </span>
                {detail && (
                  <span className="text-[10px] text-slate-400">
                    {detail.token_count} tokens
                  </span>
                )}
              </div>

              {loading ? (
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200"></div>
                  <div className="h-4 w-full animate-pulse rounded bg-slate-200"></div>
                  <div className="h-4 w-5/6 animate-pulse rounded bg-slate-200"></div>
                  <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200"></div>
                </div>
              ) : detail ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-700 max-h-72 overflow-y-auto whitespace-pre-wrap select-text">
                  {detail.chunk_text}
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
                  Retrieving chunk passage context...
                </div>
              )}
            </div>

            {/* Filing Details Card */}
            {detail && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Filing Information
                </p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-slate-400">Ticker</p>
                    <p className="font-semibold text-slate-800">{detail.ticker}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Filing Type</p>
                    <p className="font-semibold text-slate-800">Form {detail.filing_type}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Filing Date</p>
                    <p className="font-semibold text-slate-800">{detail.filing_date}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Accession</p>
                    <p className="font-semibold text-slate-800 truncate" title={detail.accession_number}>
                      {detail.accession_number}
                    </p>
                  </div>
                </div>

                {detail.source_url && (
                  <div className="pt-2 border-t border-slate-100">
                    <a
                      href={detail.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      <span>View Official SEC EDGAR Filing</span>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[11px] text-slate-400 font-mono truncate max-w-[240px]">
                ID: {citation.chunk_id}
              </span>
              <button
                onClick={handleCopyChunkId}
                className="rounded px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 transition"
              >
                {copied ? 'Copied!' : 'Copy Chunk ID'}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

