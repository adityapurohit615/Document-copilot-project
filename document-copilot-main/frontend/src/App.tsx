import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import {
  streamChatResponse,
  fetchUserThreads,
  fetchThreadMessages,
  type ChatMessage,
  type ThreadSummary,
} from './lib/api'
import type { User } from '@supabase/supabase-js'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loadingUser, setLoadingUser] = useState(true)

  // Auth form state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)

  // Chat & Thread state
  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [currentThreadId, setCurrentThreadId] = useState(() => crypto.randomUUID())
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)

  // 1. Auth listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoadingUser(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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
    setCurrentThreadId(threadId)
    const history = await fetchThreadMessages(threadId)
    setMessages(history)
  }

  // Handle creating a new thread
  const handleNewChat = () => {
    if (isStreaming) return
    setCurrentThreadId(crypto.randomUUID())
    setMessages([])
    setInput('')
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthLoading(true)
    setAuthError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthError(error.message)
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
      await streamChatResponse(currentThreadId, textToSend, (chunk) => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId ? { ...msg, content: msg.content + chunk } : msg
          )
        )
      })
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
      <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-500 font-sans">
        Loading Document Copilot...
      </div>
    )
  }

  // --- LOGIN VIEW ---
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 font-sans text-slate-900">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Document Copilot</h1>
            <p className="mt-1 text-sm text-slate-500">Sign in to access your SEC research corpus</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="analyst@firm.com"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {authError && (
              <div className="rounded-lg bg-red-50 p-3 text-xs text-red-600">{authError}</div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {authLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // --- MAIN APP WITH SIDEBAR ---
  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      {/* Left Sidebar */}
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="p-4">
          <button
            onClick={handleNewChat}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            + New Research Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Recent Threads
          </p>
          <div className="mt-2 space-y-1">
            {threads.length === 0 ? (
              <p className="px-2 text-xs text-slate-400">No previous chats yet.</p>
            ) : (
              threads.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleSelectThread(t.id)}
                  className={`w-full truncate rounded-lg px-3 py-2 text-left text-xs transition ${
                    t.id === currentThreadId
                      ? 'bg-blue-50 font-medium text-blue-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {t.title}
                </button>
              ))
            )}
          </div>
        </div>

        {/* User Footer */}
        <div className="border-t border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <div className="truncate text-xs">
              <p className="truncate font-medium text-slate-800">{user.email}</p>
              <p className="text-[10px] text-slate-400">Analyst</p>
            </div>
            <button
              onClick={handleLogout}
              className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Chat Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            <span className="text-xs font-semibold text-slate-800">Document Copilot</span>
            <span className="text-xs text-slate-400">• SEC 10-K Grounded Research</span>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden p-6">
          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <h2 className="text-2xl font-bold tracking-tight text-slate-800">
                What would you like to research?
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Grounded answers from official SEC 10-K filings.
              </p>

              <div className="mt-8 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() =>
                    handleSendMessage('What were Apple total net sales and iPhone revenue in 2025?')
                  }
                  className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-400 hover:shadow"
                >
                  <p className="text-xs font-semibold text-blue-600">AAPL 10-K</p>
                  <p className="mt-1 text-sm font-medium text-slate-800">Apple 2025 Net Sales</p>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleSendMessage('How did Microsoft cloud and Azure revenue grow?')
                  }
                  className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-400 hover:shadow"
                >
                  <p className="text-xs font-semibold text-blue-600">MSFT 10-K</p>
                  <p className="mt-1 text-sm font-medium text-slate-800">Microsoft Cloud Growth</p>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 space-y-4 overflow-y-auto pr-2">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed shadow-sm ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'border border-slate-200 bg-white text-slate-800 whitespace-pre-wrap'
                    }`}
                  >
                    {msg.content || (isStreaming ? 'Researching SEC filings...' : '')}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Input Bar */}
          <div className="mt-4 border-t border-slate-200 pt-4">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSendMessage()
              }}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500"
            >
              <input
                type="text"
                value={input}
                disabled={isStreaming}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about Apple or Microsoft filings..."
                className="flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-slate-400"
              />
              <button
                type="submit"
                disabled={!input.trim() || isStreaming}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-40"
              >
                {isStreaming ? 'Searching...' : 'Send'}
              </button>
            </form>
          </div>
        </main>
      </div>
    </div>
  )
}