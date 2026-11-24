// LLM provider abstraction for the G2 bridge.
// Default provider is Gemini free tier (gemini-flash-lite-latest), zero-cost for the POC.
// Mirrors the multi-provider pattern from crm-niar-atendimento/api/src/ai/index.js,
// but trimmed for a single short-answer call.

const GLASSES_SYSTEM = `You are NIAR, an assistant by Futurize IA, speaking through Even Realities
G2 smart glasses. THE SCREEN IS TINY (576x288 px, monochrome).
RESPONSE RULES (mandatory):
- Reply in the SAME language the user asked in (English if they ask in English, Portuguese if in Portuguese).
- AT MOST 2 short lines (about 140 characters total).
- Get straight to the point. No greeting, no emoji, no markdown, no long lists.
- If you don't know, say so in one short line.`;

async function gemini({ apiKey, model, userMessage, extraSystem }) {
  const m = model || 'gemini-flash-lite-latest';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
  const system = GLASSES_SYSTEM + (extraSystem ? `\n${extraSystem}` : '');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: { maxOutputTokens: 120, temperature: 0.4 },
    }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

async function openai({ apiKey, model, userMessage, extraSystem }) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      max_tokens: 120,
      messages: [
        { role: 'system', content: GLASSES_SYSTEM + (extraSystem ? `\n${extraSystem}` : '') },
        { role: 'user', content: userMessage },
      ],
    }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

async function anthropic({ apiKey, model, userMessage, extraSystem }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model || 'claude-3-5-haiku-latest',
      max_tokens: 120,
      system: GLASSES_SYSTEM + (extraSystem ? `\n${extraSystem}` : ''),
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.content?.[0]?.text?.trim() || '';
}

const PROVIDERS = { gemini, openai, anthropic };

// Trim hard so the lens never overflows even if the model rambles.
function clampForLens(text, max = 160) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

export async function askLLM(userMessage, { extraSystem } = {}) {
  const provider = process.env.LLM_PROVIDER || 'gemini';
  const fn = PROVIDERS[provider];
  if (!fn) throw new Error(`unknown LLM_PROVIDER: ${provider}`);

  const apiKey =
    provider === 'gemini' ? process.env.GEMINI_API_KEY
    : provider === 'openai' ? process.env.OPENAI_API_KEY
    : process.env.ANTHROPIC_API_KEY;
  const model =
    provider === 'gemini' ? process.env.GEMINI_MODEL
    : provider === 'openai' ? process.env.OPENAI_MODEL
    : process.env.ANTHROPIC_MODEL;

  if (!apiKey) throw new Error(`missing API key for provider ${provider}`);

  const raw = await fn({ apiKey, model, userMessage, extraSystem });
  return clampForLens(raw);
}
