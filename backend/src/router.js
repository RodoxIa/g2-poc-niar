// Extensible command router for the G2 agent bridge.
//
// The glasses send a single free-text utterance (from ASR). We classify it into
// a "command" and dispatch. Adding a new command later = add one entry here.
//
// For the POC only `ask` (free Q&A) is fully implemented. The others are
// intentionally stubs that return a short placeholder, so the end-to-end
// voice->lens flow is testable today and the wiring points are obvious.

import { askLLM } from './llm.js';

// Each command: { match(text) -> bool, run(text, ctx) -> string (<=2 lines) }
// Order matters: first match wins. `ask` is the catch-all fallback.
const COMMANDS = [
  {
    name: 'agenda',
    match: (t) => /\b(agenda|compromisso|reuni(ã|a)o|calend(á|a)rio|hoje tenho|pr(ó|o)ximo evento)\b/i.test(t),
    run: async () => {
      // TODO: optional Google Calendar integration (bring your own OAuth credentials).
      return 'Agenda ainda nao conectada nesta POC.';
    },
  },
  {
    name: 'leads',
    match: (t) => /\b(lead|leads|funil|pipeline|crm|negocia(ç|c)(ã|a)o)\b/i.test(t),
    run: async () => {
      // TODO: consultar crm-niar-atendimento (Postgres) por leads em negociação.
      return 'Leads do CRM ainda nao conectados nesta POC.';
    },
  },
  {
    name: 'email',
    match: (t) => /\b(e-?mail|caixa de entrada|inbox|resumo de e-?mail)\b/i.test(t),
    run: async () => {
      // TODO: Gmail OAuth (rodolfon@gmail.com) -> resumir últimos não lidos.
      return 'Resumo de email ainda nao conectado nesta POC.';
    },
  },
  {
    name: 'whatsapp',
    match: (t) => /\b(whats?app|manda mensagem|envia (pra|para))\b/i.test(t),
    run: async () => {
      // TODO: enviar via Evolution/Meta WABA do stack FuturizeIA. Exige confirmação.
      return 'Envio de WhatsApp ainda nao conectado nesta POC.';
    },
  },
  {
    // Catch-all: free question -> NIAR/LLM, short answer.
    name: 'ask',
    match: () => true,
    run: async (text) => askLLM(text),
  },
];

export async function route(text) {
  const clean = (text || '').trim();
  if (!clean) return { command: 'empty', reply: "Didn't catch that. Try again." };
  for (const cmd of COMMANDS) {
    if (cmd.match(clean)) {
      const reply = await cmd.run(clean);
      return { command: cmd.name, reply };
    }
  }
  return { command: 'ask', reply: await askLLM(clean) };
}

export const COMMAND_NAMES = COMMANDS.map((c) => c.name);
