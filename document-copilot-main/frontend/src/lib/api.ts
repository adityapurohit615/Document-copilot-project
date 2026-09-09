import { env } from './env'
import { getAccessToken } from './supabase'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export async function streamChatResponse(
  threadId: string,
  userMessage: string,
  onChunk: (chunk: string) => void,
): Promise<void> {
  const token = await getAccessToken()
  if (!token) {
    throw new Error('Not authenticated. Please sign in first.')
  }

  const response = await fetch(`${env.API_BASE_URL}/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      thread_id: threadId,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Server error (${response.status}): ${errorText}`)
  }

  if (!response.body) {
    throw new Error('No response body received from server')
  }

  // Stream reader for live chunks
  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    onChunk(chunk)
  }
}


export interface ThreadSummary {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export async function fetchUserThreads(): Promise<ThreadSummary[]> {
  const token = await getAccessToken()
  if (!token) return []

  const response = await fetch(`${env.API_BASE_URL}/chat/threads`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) return []
  return response.json()
}

export async function fetchThreadMessages(threadId: string): Promise<ChatMessage[]> {
  const token = await getAccessToken()
  if (!token) return []

  const response = await fetch(`${env.API_BASE_URL}/chat/threads/${threadId}/messages`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) return []
  return response.json()
}