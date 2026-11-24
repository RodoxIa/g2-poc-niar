// Companion UI (the phone/webview panel). The actual glasses output is the LVGL
// text container in main.ts; this panel is for dev/debug + simulator text input.

type Status = 'connecting' | 'listening' | 'error'

let statusEl: HTMLDivElement
let finalEl: HTMLSpanElement
let interimEl: HTMLSpanElement
let simInput: HTMLInputElement | null = null
let simHandler: ((text: string) => void) | null = null

export function mountUi(simTextMode: boolean) {
  const app = document.querySelector<HTMLDivElement>('#app')!
  app.innerHTML = `
    <main class="panel">
      <header>
        <h1>NIAR Assistant <span class="brand">· Futurize IA</span></h1>
        <div id="status" class="status status-connecting">Connecting…</div>
      </header>
      <section class="transcript" aria-live="polite">
        <span id="final"></span><span id="interim" class="interim"></span>
      </section>
      ${simTextMode ? `
      <form id="simform" class="simbar">
        <input id="siminput" type="text" placeholder="Type a question (simulator mode)…" autocomplete="off" />
        <button type="submit">Ask</button>
      </form>` : ''}
      <footer>${simTextMode ? 'Simulator mode (no mic). Double-tap = exit.' : 'Speak and pause. Double-tap the temple = exit.'}</footer>
    </main>
  `
  statusEl = app.querySelector<HTMLDivElement>('#status')!
  finalEl = app.querySelector<HTMLSpanElement>('#final')!
  interimEl = app.querySelector<HTMLSpanElement>('#interim')!

  if (simTextMode) {
    simInput = app.querySelector<HTMLInputElement>('#siminput')
    const form = app.querySelector<HTMLFormElement>('#simform')!
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      const v = simInput?.value?.trim()
      if (v && simHandler) { simHandler(v); if (simInput) simInput.value = '' }
    })
  }
  injectStyles()
}

// Register the callback that runs when a sim text command is submitted.
export function onSimText(handler: (text: string) => void) {
  simHandler = handler
  // Also expose a programmatic hook for the automation harness (headless).
  ;(window as unknown as { __niarAsk?: (t: string) => void }).__niarAsk = handler
}

export function setStatus(kind: Status, text: string) {
  if (!statusEl) return
  statusEl.className = `status status-${kind}`
  statusEl.textContent = text
}

export function setTranscript(finalText: string, interimText: string) {
  if (!finalEl) return
  finalEl.textContent = finalText
  interimEl.textContent = interimText
}

function injectStyles() {
  const css = `
    :root { color-scheme: dark; }
    html, body { margin: 0; height: 100%; background: #232323; color: #E5E5E5;
      font: 16px/1.4 -apple-system, BlinkMacSystemFont, 'Helvetica Neue', system-ui, sans-serif;
      touch-action: manipulation; -webkit-text-size-adjust: 100%; overscroll-behavior: none; }
    #app { display: flex; height: 100%; }
    .panel { display: flex; flex-direction: column; gap: 16px;
      width: 100%; max-width: 640px; margin: 0 auto; padding: 24px; box-sizing: border-box; }
    header { display: flex; align-items: center; justify-content: space-between; }
    h1 { font-size: 18px; font-weight: 600; margin: 0; letter-spacing: 0.02em; }
    h1 .brand { color: #3CFA44; font-weight: 500; }
    .status { font-size: 12px; padding: 4px 10px; border-radius: 999px;
      border: 1px solid transparent; letter-spacing: 0.04em; text-transform: uppercase; }
    .status-connecting { color: #A7A7A7; border-color: #3E3E3E; }
    .status-listening  { color: #3CFA44; border-color: #3CFA44; background: rgba(60,250,68,0.08); }
    .status-error      { color: #FF453A; border-color: #FF453A; background: rgba(255,69,58,0.08); }
    .transcript { flex: 1; overflow: auto; background: #2E2E2E; border: 1px solid #3E3E3E;
      color: #E5E5E5; border-radius: 12px; padding: 20px; font-size: 18px; line-height: 1.5;
      min-height: 140px; white-space: pre-wrap; word-break: break-word; }
    .interim { color: #919191; }
    .simbar { display: flex; gap: 8px; }
    .simbar input { flex: 1; background: #2E2E2E; border: 1px solid #3E3E3E; color: #E5E5E5;
      border-radius: 10px; padding: 12px 14px; font-size: 16px; outline: none; }
    .simbar input:focus { border-color: #3CFA44; }
    .simbar button { background: #3CFA44; color: #0c1f0d; border: none; border-radius: 10px;
      padding: 0 18px; font-size: 15px; font-weight: 600; cursor: pointer; }
    footer { font-size: 12px; color: #7B7B7B; text-align: center; }
  `
  const style = document.createElement('style')
  style.textContent = css
  document.head.appendChild(style)
}
