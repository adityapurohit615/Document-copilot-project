import { useState } from 'react'

function App() {
  const [message, setMessage] = useState('')

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div>
            <h1 className="text-lg font-semibold">Document Copilot</h1>
            <p className="text-sm text-muted-foreground">
              Research assistant for SEC filings
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              Analyst
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-full border text-sm font-medium">
              A
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col px-6">
        <section className="flex flex-1 flex-col justify-center py-12">
          <div className="mx-auto w-full max-w-3xl">
            <div className="mb-10 text-center">
              <h2 className="text-3xl font-semibold tracking-tight">
                What would you like to research?
              </h2>
              <p className="mt-3 text-muted-foreground">
                Ask questions about the documents in your research corpus.
              </p>
            </div>

            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Ask a question about an SEC filing..."
                className="min-h-32 w-full resize-none bg-transparent p-2 text-sm outline-none placeholder:text-muted-foreground"
              />

              <div className="mt-3 flex items-center justify-between border-t pt-3">
                <span className="text-xs text-muted-foreground">
                  Answers are grounded in retrieved source passages.
                </span>

                <button
                  type="button"
                  disabled={!message.trim()}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:pointer-events-none disabled:opacity-50"
                >
                  Ask Copilot
                </button>
              </div>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <button
                type="button"
                className="rounded-lg border p-4 text-left transition hover:bg-muted"
                onClick={() =>
                  setMessage('What are the company’s main business risks?')
                }
              >
                <p className="text-sm font-medium">Business risks</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Explore risk factors
                </p>
              </button>

              <button
                type="button"
                className="rounded-lg border p-4 text-left transition hover:bg-muted"
                onClick={() =>
                  setMessage('How did revenue change year over year?')
                }
              >
                <p className="text-sm font-medium">Revenue trends</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Compare financial performance
                </p>
              </button>

              <button
                type="button"
                className="rounded-lg border p-4 text-left transition hover:bg-muted"
                onClick={() =>
                  setMessage('What are the key management priorities?')
                }
              >
                <p className="text-sm font-medium">Management priorities</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Review management discussion
                </p>
              </button>
            </div>
          </div>
        </section>

        <footer className="border-t py-4 text-center text-xs text-muted-foreground">
          Document Copilot • Grounded research only
        </footer>
      </main>
    </div>
  )
}

export default App
