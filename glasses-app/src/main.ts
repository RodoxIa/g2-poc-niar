// NIAR Assistant for Even Realities G2 — POC.
//
// Flow: speak -> ASR text -> POST /ask to the NIAR bridge -> render short reply on the lens.
//
// Two input paths:
//   1) Real glasses: mic PCM frames accumulate; on a short silence we POST the buffered
//      PCM to /stt (Whisper on your Whisper host) to get text, then /ask.
//   2) Simulator/dev (VITE_SIM_TEXT_MODE=1): a text box drives /ask directly, because a
//      headless VPS simulator has no microphone. Same agent path, same lens rendering.
//
// Double-tap the temple to exit.

import {
  waitForEvenAppBridge,
  TextContainerProperty,
  CreateStartUpPageContainer,
  TextContainerUpgrade,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import { askAgent, transcribePcm } from './agent/agent'
import { mountUi, setStatus, setTranscript, onSimText } from './ui'

const SIM_TEXT_MODE = (import.meta.env.VITE_SIM_TEXT_MODE as string) === '1'

mountUi(SIM_TEXT_MODE)

const bridge = await waitForEvenAppBridge()

// Single full-screen text container on the lens.
const screen = new TextContainerProperty({
  xPosition: 0,
  yPosition: 0,
  width: 576,
  height: 288,
  borderWidth: 0,
  borderColor: 5,
  paddingLength: 6,
  containerID: 1,
  containerName: 'niar',
  content: 'NIAR Assistant\nSpeak to ask.',
  isEventCapture: 1,
})

const created = await bridge.createStartUpPageContainer(
  new CreateStartUpPageContainer({ containerTotalNum: 1, textObject: [screen] }),
)
if (created !== 0) {
  setStatus('error', `createStartUpPageContainer failed: ${created}`)
  console.error('createStartUpPageContainer failed', created)
} else {
  console.log('APP_READY') // automation harness polls for this
}

// Lens copy. Single source of truth so every state reads consistently on the device.
const LENS = {
  ready: 'NIAR Assistant\nSpeak to ask.',
  thinking: 'Thinking...',
  noReply: 'No answer. Try again.',
  offline: 'NIAR is offline.\nTry again in a moment.',
  slow: 'Took too long.\nAsk again.',
} as const

// Debounced lens writes — the BLE render queue is slow.
let lastRender = ''
let pending: string = LENS.ready
let timer: number | null = null
function renderLens(text: string) {
  pending = text.slice(0, 220) // ~fits 576x288 at default font
  if (timer !== null) return
  timer = window.setTimeout(async () => {
    timer = null
    if (pending === lastRender) return
    lastRender = pending
    await bridge.textContainerUpgrade(
      new TextContainerUpgrade({ containerID: 1, containerName: 'niar', content: pending }),
    )
  }, 120)
}

// Core: text -> agent -> lens.
let busy = false
async function handleUtterance(text: string) {
  const clean = text.trim()
  if (!clean || busy) return
  busy = true
  setTranscript(clean, '')
  setStatus('listening', `Asking: ${clean.slice(0, 40)}`)
  renderLens(LENS.thinking)
  try {
    const { reply } = await askAgent(clean)
    setStatus('listening', 'Ready')
    setTranscript(clean, '')
    renderLens(shapeReply(reply))
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err)
    // Friendly, short lens text per failure class; full detail stays in the console.
    renderLens(msg === 'timeout' ? LENS.slow : LENS.offline)
    setStatus('error', msg)
    console.error('handleUtterance error', msg)
  } finally {
    busy = false
  }
}

// Keep lens text short and clean: collapse whitespace, drop empties, cap length.
function shapeReply(reply: string): string {
  const r = (reply || '').replace(/\s+/g, ' ').trim()
  if (!r) return LENS.noReply
  return r.length > 200 ? r.slice(0, 197).trimEnd() + '...' : r
}

// ── Path 1: real glasses mic ────────────────────────────────────────────────
// Accumulate PCM; flush to Whisper after ~900ms without new audio frames.
let pcmChunks: Uint8Array[] = []
let silenceTimer: number | null = null
function feedPcm(chunk: Uint8Array) {
  pcmChunks.push(chunk)
  if (silenceTimer !== null) window.clearTimeout(silenceTimer)
  silenceTimer = window.setTimeout(flushPcm, 900)
}
async function flushPcm() {
  if (!pcmChunks.length || busy) return
  const total = pcmChunks.reduce((n, c) => n + c.length, 0)
  const buf = new Uint8Array(total)
  let off = 0
  for (const c of pcmChunks) { buf.set(c, off); off += c.length }
  pcmChunks = []
  if (total < 6400) return // <0.2s, ignore noise
  setStatus('listening', 'Transcribing...')
  renderLens(LENS.thinking)
  try {
    const text = await transcribePcm(buf)
    if (text) await handleUtterance(text)
    else { renderLens(LENS.ready); setStatus('listening', 'Listening') }
  } catch (err) {
    renderLens(LENS.offline)
    setStatus('error', `STT: ${(err as Error)?.message ?? err}`)
  }
}

if (!SIM_TEXT_MODE) {
  await bridge.audioControl(true)
  setStatus('listening', 'Mic on · speak and pause')
} else {
  setStatus('listening', 'Simulator · type a question')
  onSimText(handleUtterance) // text box drives the same flow
}

// ── Event routing ───────────────────────────────────────────────────────────
let cleanedUp = false
function cleanup() {
  if (cleanedUp) return
  cleanedUp = true
  if (!SIM_TEXT_MODE) bridge.audioControl(false)
  unsubscribe()
}

const unsubscribe = bridge.onEvenHubEvent((event) => {
  const pcm = event.audioEvent?.audioPcm
  if (pcm && !SIM_TEXT_MODE) feedPcm(pcm)

  const sysType = event.sysEvent?.eventType ?? null
  const textType = event.textEvent?.eventType ?? null

  if (sysType === OsEventTypeList.DOUBLE_CLICK_EVENT || textType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
    bridge.shutDownPageContainer(1)
    return
  }
  if (sysType === OsEventTypeList.SYSTEM_EXIT_EVENT || sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
    cleanup()
  }
})

window.addEventListener('beforeunload', cleanup)
