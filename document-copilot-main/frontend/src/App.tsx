import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import {
  streamChatResponse,
  fetchUserThreads,
  fetchThreadMessages,
  extractCitations,
  type ChatMessage,
  type CitationItem,
  type ThreadSummary,
} from './lib/api'
import { CitationDrawer } from './components/CitationDrawer'
import type { User } from '@supabase/supabase-js'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loadingUser, setLoadingUser] = useState(true)

  // Auth form state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)

  // Navigation tab state (Insights | Sources | History)
  const [activeTab, setActiveTab] = useState<'insights' | 'sources' | 'history'>('insights')

  // Chat & Thread state
  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [currentThreadId, setCurrentThreadId] = useState<string>(() => crypto.randomUUID())
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [activeCitation, setActiveCitation] = useState<CitationItem | null>(null)

  // 1. Auth listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoadingUser(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // 2. Load threads when user is logged in
  useEffect(() => {
    if (user) {
      loadThreads()
    }
  }, [user])

  const loadThreads = async () => {
    const list = await fetchUserThreads()
    setThreads(list)
  }

  // Handle switching to an existing thread
  const handleSelectThread = async (threadId: string) => {
    if (isStreaming) return
    setActiveCitation(null)
    setCurrentThreadId(threadId)
    setActiveTab('insights')
    const history = await fetchThreadMessages(threadId)
    setMessages(history)
  }

  // Handle creating a new thread
  const handleNewChat = () => {
    if (isStreaming) return
    setActiveCitation(null)
    setCurrentThreadId(crypto.randomUUID())
    setMessages([])
    setInput('')
    setActiveTab('insights')
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthLoading(true)
    setAuthError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthError(error.message)
    setAuthLoading(false)
  }

  const handleGuestDemo = async () => {
    setAuthLoading(true)
    setAuthError(null)
    // 1. Try dedicated guest analyst account
    let { error } = await supabase.auth.signInWithPassword({
      email: 'guest.analyst@driftwood.com',
      password: 'GuestDemo2026!',
    })
    // 2. Fallback to analyst account if needed
    if (error) {
      const fallback = await supabase.auth.signInWithPassword({
        email: 'adityapurohit615@gmail.com',
        password: '12345',
      })
      if (fallback.error) {
        setAuthError(error.message)
      }
    }
    setAuthLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setMessages([])
    setThreads([])
  }

  const handleSendMessage = async (queryText?: string) => {
    const textToSend = queryText || input
    if (!textToSend.trim() || isStreaming) return

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: textToSend,
    }

    const assistantMsgId = crypto.randomUUID()
    const assistantPlaceholder: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
    }

    setMessages((prev) => [...prev, userMessage, assistantPlaceholder])
    setInput('')
    setIsStreaming(true)

    try {
      let receivedAnyChunk = false
      await streamChatResponse(currentThreadId, textToSend, (chunk) => {
        receivedAnyChunk = true
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId ? { ...msg, content: msg.content + chunk } : msg
          )
        )
      })

      if (!receivedAnyChunk) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId && !msg.content
              ? {
                  ...msg,
                  content:
                    '⚠️ The server closed the stream without returning any tokens. Please check your Railway backend logs or verify that GROQ_API_KEY / LLM credentials are configured.',
                }
              : msg
          )
        )
      }

      // Refresh sidebar threads list after turn finishes
      await loadThreads()
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId ? { ...msg, content: `⚠️ Error: ${err.message}` } : msg
        )
      )
    } finally {
      setIsStreaming(false)
    }
  }

  if (loadingUser) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0B0F17] text-slate-400 font-sans">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent"></div>
          <span className="text-sm font-medium tracking-wide text-slate-300">
            Initializing Document Copilot...
          </span>
        </div>
      </div>
    )
  }

  // --- LOGIN VIEW ---
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0F17] p-4 font-sans text-slate-100">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#111827]/90 p-8 shadow-2xl backdrop-blur-xl">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-500/40 bg-cyan-950/60 text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.25)]">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Document Copilot</h1>
            <p className="mt-1 text-xs text-slate-400">
              Audited SEC 10-K Research & Grounded Synthesis
            </p>
          </div>

          {/* 1-Click Instant Guest Demo Access */}
          <button
            type="button"
            onClick={handleGuestDemo}
            disabled={authLoading}
            className="group mb-5 flex w-full items-center justify-center gap-2.5 rounded-xl border border-cyan-500/50 bg-gradient-to-r from-cyan-950/80 via-blue-950/60 to-indigo-950/80 px-4 py-3.5 text-sm font-bold text-cyan-300 shadow-[0_0_25px_rgba(6,182,212,0.2)] transition hover:border-cyan-400 hover:from-cyan-900/80 hover:to-blue-900/80 hover:shadow-[0_0_35px_rgba(6,182,212,0.35)] disabled:opacity-50"
          >
            <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-pulse"></span>
            <span>{authLoading ? 'Entering Research Dashboard...' : '✨ Try Instant Demo (1-Click Access)'}</span>
          </button>

          <div className="relative mb-5 flex items-center justify-center">
            <div className="w-full border-t border-slate-800"></div>
            <span className="bg-[#111827] px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              or sign in with email
            </span>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="analyst@firm.com"
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              />
            </div>

            {authError && (
              <div className="rounded-xl border border-red-900/50 bg-red-950/40 p-3 text-xs text-red-300">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(6,182,212,0.3)] transition hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50"
            >
              {authLoading ? 'Signing in...' : 'Sign In as Analyst'}
            </button>
          </form>

          <div className="mt-5 flex items-center justify-between border-t border-slate-800/80 pt-4 text-xs text-slate-400">
            <span>Want to test credentials directly?</span>
            <button
              type="button"
              onClick={() => {
                setEmail('guest.analyst@driftwood.com')
                setPassword('GuestDemo2026!')
              }}
              className="font-semibold text-cyan-400 hover:text-cyan-300 transition underline underline-offset-2"
            >
              Auto-fill creds
            </button>
          </div>
        </div>
      </div>
    )
  }

  // --- MAIN APP WITH DARK OBSIDIAN THEME ---
  return (
    <div className="flex h-screen bg-[#0B0F17] font-sans text-slate-100 overflow-hidden">
      {/* Left Sidebar */}
      <aside className="flex w-64 flex-col border-r border-slate-800/80 bg-[#0D121F]">
        <div className="p-4 border-b border-slate-800/60">
          <div className="flex items-center gap-2.5 mb-4 px-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-500/40 bg-cyan-950/70 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.2)]">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">Document Copilot</h2>
              <p className="text-[10px] text-cyan-400 font-mono">HNSW • pgvector</p>
            </div>
          </div>

          <button
            onClick={handleNewChat}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 py-2.5 text-xs font-semibold text-white shadow-[0_0_15px_rgba(6,182,212,0.25)] transition hover:from-cyan-500 hover:to-blue-500"
          >
            <span className="text-base leading-none">+</span> New Research Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Recent Threads
          </p>
          <div className="mt-2 space-y-1">
            {threads.length === 0 ? (
              <p className="px-2 text-xs text-slate-500">No previous research chats yet.</p>
            ) : (
              threads.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleSelectThread(t.id)}
                  className={`w-full truncate rounded-lg px-3 py-2 text-left text-xs transition ${
                    t.id === currentThreadId
                      ? 'border border-cyan-500/40 bg-cyan-950/50 font-medium text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.15)]'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                  }`}
                >
                  {t.title}
                </button>
              ))
            )}
          </div>
        </div>

        {/* User Footer */}
        <div className="border-t border-slate-800/80 bg-[#0B0F17]/70 p-3">
          <div className="flex items-center justify-between">
            <div className="truncate text-xs">
              <p className="truncate font-medium text-slate-200">{user.email}</p>
              <p className="text-[10px] font-semibold text-cyan-400 tracking-wider">FINANCIAL ANALYST</p>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-slate-700/60 px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Navigation Header matching generated design */}
        <header className="flex h-16 items-center justify-between border-b border-slate-800/80 bg-[#0D121F]/80 px-6 backdrop-blur-md">
          <div className="flex items-center gap-6">
            <h1 className="text-sm font-bold tracking-tight text-white">
              Financial Research Dashboard
            </h1>

            {/* Navigation Tabs */}
            <nav className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('insights')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activeTab === 'insights'
                    ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.15)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                Insights
              </button>
              <button
                onClick={() => setActiveTab('sources')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activeTab === 'sources'
                    ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.15)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                Sources
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activeTab === 'history'
                    ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.15)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                History
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-3 py-1 text-[11px] font-medium text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Audited SEC Corpus • Live
            </div>
          </div>
        </header>

        {/* Tab 1: Sources View */}
        {activeTab === 'sources' && (
          <div className="flex-1 overflow-y-auto p-8 max-w-4xl mx-auto w-full">
            <h2 className="text-xl font-bold text-white mb-2">Ingested SEC 10-K Knowledge Base</h2>
            <p className="text-sm text-slate-400 mb-6">
              Official filings indexed with 600-token sliding windows and 384-dimensional HNSW vector graphs.
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-[#111827]/80 p-5 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <span className="rounded-md border border-cyan-500/40 bg-cyan-950/80 px-2.5 py-1 text-xs font-bold text-cyan-300">
                    AAPL
                  </span>
                  <span className="text-xs text-slate-400">Form 10-K (FY 2025)</span>
                </div>
                <h3 className="text-base font-semibold text-white">Apple Inc.</h3>
                <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                  Full annual report covering iPhone, Services, Wearables, and detailed financial statements.
                </p>
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                  <span>175 vector chunks</span>
                  <span className="text-emerald-400 font-medium">● Verified Grounded</span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-[#111827]/80 p-5 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <span className="rounded-md border border-cyan-500/40 bg-cyan-950/80 px-2.5 py-1 text-xs font-bold text-cyan-300">
                    MSFT
                  </span>
                  <span className="text-xs text-slate-400">Form 10-K (2021-2023)</span>
                </div>
                <h3 className="text-base font-semibold text-white">Microsoft Corporation</h3>
                <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                  Multi-year longitudinal filings covering Intelligent Cloud, Azure growth, and AI CapEx.
                </p>
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                  <span>522 vector chunks</span>
                  <span className="text-emerald-400 font-medium">● Verified Grounded</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: History View */}
        {activeTab === 'history' && (
          <div className="flex-1 overflow-y-auto p-8 max-w-4xl mx-auto w-full">
            <h2 className="text-xl font-bold text-white mb-2">Research Session History</h2>
            <p className="text-sm text-slate-400 mb-6">
              Saved threads backed by Supabase PostgreSQL chat persistence.
            </p>

            <div className="space-y-3">
              {threads.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleSelectThread(t.id)}
                  className="w-full flex items-center justify-between rounded-xl border border-slate-800 bg-[#111827]/80 p-4 text-left shadow-lg hover:border-cyan-500/40 hover:bg-slate-900 transition"
                >
                  <div>
                    <h3 className="text-sm font-semibold text-white">{t.title}</h3>
                    <p className="text-xs text-slate-500 mt-1">ID: {t.id}</p>
                  </div>
                  <span className="text-xs text-cyan-400 font-medium">Resume Chat →</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Insights (Main Chat & Research Canvas) */}
        {activeTab === 'insights' && (
          <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-hidden p-6">
            {messages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-500/30 bg-cyan-950/60 text-cyan-400 shadow-[0_0_30px_rgba(6,182,212,0.2)]">
                  <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-white">
                  What would you like to research?
                </h2>
                <p className="mt-2 text-sm text-slate-400 max-w-lg">
                  Audited financial synthesis powered by Hybrid Search (HNSW + pgvector) and
                  high-speed LLM inference.
                </p>

                <div className="mt-8 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleSendMessage('What were Apple total net sales and iPhone revenue in 2025?')
                    }
                    className="group rounded-2xl border border-slate-800 bg-[#111827]/70 p-4 text-left shadow-lg transition hover:border-cyan-500/40 hover:bg-slate-900/90"
                  >
                    <span className="rounded-md border border-cyan-500/40 bg-cyan-950/80 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
                      AAPL 10-K
                    </span>
                    <p className="mt-2 text-sm font-semibold text-white group-hover:text-cyan-300 transition">
                      Apple 2025 Net Sales & Segments
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Breakdown of iPhone, Mac, and Services revenue.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleSendMessage('How did Microsoft cloud and Azure revenue grow?')
                    }
                    className="group rounded-2xl border border-slate-800 bg-[#111827]/70 p-4 text-left shadow-lg transition hover:border-cyan-500/40 hover:bg-slate-900/90"
                  >
                    <span className="rounded-md border border-cyan-500/40 bg-cyan-950/80 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
                      MSFT 10-K
                    </span>
                    <p className="mt-2 text-sm font-semibold text-white group-hover:text-cyan-300 transition">
                      Microsoft Cloud & Azure Growth
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Intelligent Cloud performance and annual growth drivers.
                    </p>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 space-y-5 overflow-y-auto pr-2">
                {messages.map((msg) => {
                  if (msg.role === 'user') {
                    return (
                      <div key={msg.id} className="flex gap-3 justify-end">
                        <div className="max-w-[80%] rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-sm leading-relaxed text-white shadow-[0_4px_16px_rgba(37,99,235,0.25)] font-medium">
                          {msg.content}
                        </div>
                      </div>
                    )
                  }

                  // Assistant message handling
                  const { cleanText, citations: parsedCitations } = extractCitations(msg.content)
                  const citations =
                    msg.citations && msg.citations.length > 0 ? msg.citations : parsedCitations
                  const displayText =
                    cleanText ||
                    (isStreaming
                      ? 'Synthesizing SEC 10-K filings with Groq inference...'
                      : '⚠️ No response received from server. Please check backend logs.')
                  const isError = displayText.startsWith('⚠️')

                  return (
                    <div key={msg.id} className="flex gap-3 justify-start">
                      <div
                        className={`max-w-[90%] rounded-2xl border ${
                          isError
                            ? 'border-amber-500/40 bg-amber-950/30 text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                            : 'border-slate-800 bg-[#111827]/90 text-slate-200 shadow-xl'
                        } p-5 text-sm leading-relaxed backdrop-blur-sm`}
                      >
                        <div className="whitespace-pre-wrap">{displayText}</div>

                        {/* Interactive Glowing Citation Badges */}
                        {citations && citations.length > 0 && (
                          <div className="mt-5 border-t border-slate-800/80 pt-3.5">
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
                              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse"></span>
                              <span>Verified SEC Grounding Citations</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {citations.map((c, idx) => (
                                <button
                                  key={c.chunk_id + '-' + idx}
                                  type="button"
                                  onClick={() => setActiveCitation(c)}
                                  className="group inline-flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-950/40 px-3 py-1.5 text-xs text-cyan-300 transition hover:border-cyan-400 hover:bg-cyan-900/60 shadow-[0_0_12px_rgba(6,182,212,0.15)] text-left"
                                  title={`Inspect audited 10-K passage for ${c.ticker}`}
                                >
                                  <span className="font-bold text-cyan-400">
                                    [{idx + 1}] {c.ticker}
                                  </span>
                                  <span className="max-w-[200px] truncate text-[11px] text-slate-400 italic group-hover:text-cyan-200">
                                    "{c.snippet}"
                                  </span>
                                  <span className="text-[10px] text-cyan-400 opacity-60 group-hover:opacity-100 transition-opacity">
                                    ↗
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Input Bar */}
            <div className="mt-4 pt-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleSendMessage()
                }}
                className="flex items-center gap-2 rounded-2xl border border-slate-800 bg-[#111827]/90 p-2.5 shadow-2xl backdrop-blur-md focus-within:border-cyan-500/80 focus-within:ring-1 focus-within:ring-cyan-500/40 transition"
              >
                <input
                  type="text"
                  value={input}
                  disabled={isStreaming}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about Apple or Microsoft 10-K filings..."
                  className="flex-1 bg-transparent px-3 text-sm text-white outline-none placeholder:text-slate-500"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isStreaming}
                  className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2.5 text-xs font-semibold text-white shadow-[0_0_15px_rgba(6,182,212,0.3)] transition hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40"
                >
                  {isStreaming ? 'Searching...' : 'Send'}
                </button>
              </form>
            </div>
          </main>
        )}
      </div>

      {/* Slide-over Citation Drawer */}
      <CitationDrawer
        citation={activeCitation}
        onClose={() => setActiveCitation(null)}
      />
    </div>
  )
}