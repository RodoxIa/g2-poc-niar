// Client for the g2-agent-bridge (NIAR/OpenClaw).
// One call: send recognized text, get a short reply for the lens.

// Public NIAR bridge (whitelisted in app.json). Overridable via VITE_AGENT_URL for local dev.
const AGENT_URL = (import.meta.env.VITE_AGENT_URL as string) || 'https://eveng2.futurizeia.com'

// Network calls can hang on flaky BLE/phone tethering; cap them so the lens never freezes.
const TIMEOUT_MS = 12000
function withTimeout(): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  return { signal: ctrl.signal, clear: () => clearTimeout(id) }
}

export interface AgentReply {
  reply: string
  command: string
}

export async function askAgent(text: string): Promise<AgentReply> {
  const t = withTimeout()
  let res: Response
  try {
    res = await fetch(`${AGENT_URL}/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: t.signal,
    })
  } catch (err) {
    throw new Error(t.signal.aborted ? 'timeout' : `network: ${(err as Error)?.message ?? err}`)
  } finally {
    t.clear()
  }
  if (!res.ok) {
    const msg = await res.text().catch(() => '')
    throw new Error(`agent ${res.status}: ${msg.slice(0, 120)}`)
  }
  return (await res.json()) as AgentReply
}

// Send raw mic PCM to the bridge -> Whisper -> text. Used on real glasses.
export async function transcribePcm(pcm: Uint8Array): Promise<string> {
  // Copy into a fresh ArrayBuffer so fetch always gets a plain BodyInit
  // even when `pcm` is a typed-array view over a larger SDK buffer.
  const body = pcm.slice().buffer
  const t = withTimeout()
  let res: Response
  try {
    res = await fetch(`${AGENT_URL}/stt`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body,
      signal: t.signal,
    })
  } catch (err) {
    throw new Error(t.signal.aborted ? 'timeout' : `network: ${(err as Error)?.message ?? err}`)
  } finally {
    t.clear()
  }
  if (!res.ok) throw new Error(`stt ${res.status}`)
  const data = (await res.json()) as { text?: string }
  return data.text || ''
}
