# NIAR Assistant — POC para Even Realities G2

POC: falar um comando nos óculos G2 → ASR vira texto → backend NIAR responde curto → aparece na lente.

## Estrutura
- `backend/` — `g2-agent-bridge` (Express, porta 3050). `POST /ask {text} -> {reply, command}`.
  Roteador de comandos extensível: `ask` (Q&A livre via Gemini free tier) funcionando;
  `agenda`, `leads`, `email`, `whatsapp` são stubs prontos pra ligar.
  `POST /stt` (PCM bruto) repassa pro Whisper no your Whisper host.
- `glasses-app/` — app Even Hub (template `asr` adaptado). Vite + TS + `@evenrealities/even_hub_sdk`.
  - Real glasses: mic PCM → `/stt` (Whisper) → `/ask` → render na lente.
  - Simulador/dev: `VITE_SIM_TEXT_MODE=1` mostra caixa de texto que dispara o mesmo fluxo (VPS não tem mic).
  - Hook headless: `window.__niarAsk("texto")`.

## Rodar o backend
    cd backend && npm install && npm start   # usa backend/.env (Gemini free tier)

## Rodar o app (dev)
    cd glasses-app && npm install && npm run dev   # http://localhost:5173

## Empacotar pro G2
    cd glasses-app && npm run build
    node node_modules/@evenrealities/evenhub-cli/main.js pack app.json dist -o niar-assistant.ehpk

## Sideload no G2 físico (companion app)
    cd glasses-app && npm run dev
    node node_modules/@evenrealities/evenhub-cli/main.js qr --url http://<YOUR_DEV_HOST_IP>:5173
    # escanear o QR no app Even Hub do celular pareado com o G2

## Hardware G2 (referência)
- Tela: 576x288, 4-bit greyscale (verde). **Sem alto-falante → sem TTS no device.** Saída = texto.
- Mic: PCM s16le 16kHz mono. Input: touchpad + anel R1. Double-tap = sair.

## Pendências / próximos passos
- Render LVGL: validar no simulador GUI (precisa GTK/WebKit+display; bloqueado por sudo na VPS)
  or directly on your Even G2 glasses.
- Ligar comandos reais: agenda (Google OAuth), leads (CRM Postgres), email (Gmail), WhatsApp (Evolution/WABA).
- Subir Whisper service no your Whisper host em :9100 pro caminho de voz real (faster_whisper já instalado lá).
- Caddy: expor o bridge em g2.futurizeia.com (whitelist já no app.json).

## Simulador GUI na VPS (DESTRAVADO) + vídeo demo
O simulador (`@evenrealities/sim-linux-x64`, app Tauri/WebKitGTK) roda headless na
VPS sob Xvfb. Deps de sistema instaladas via apt (grátis):

    sudo apt-get install -y libgtk-3-0 libwebkit2gtk-4.1-0 libsoup-3.0-0 \
      libjavascriptcoregtk-4.1-0 xvfb dbus-x11 xdotool   # ffmpeg já existia

Rodar:

    Xvfb :99 -screen 0 1280x900x24 -ac &
    cd glasses-app && npm run dev &                       # Vite :5173
    cd backend && npm start &                             # bridge :3050
    export DISPLAY=:99 WEBKIT_DISABLE_COMPOSITING_MODE=1 \
      WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1 GDK_BACKEND=x11
    dbus-launch node_modules/@evenrealities/sim-linux-x64/bin/evenhub-simulator \
      http://localhost:5173 --automation-port 9898

Automation API (v0.7+): `GET /api/screenshot/glasses` devolve a lente RGBA 576x288
(texto = alpha 255, fundo = alpha 0), `GET /api/console`, `POST /api/input`.
Comandos disparados digitando na webview companion via `xdotool`.

CORS: o bridge ganhou headers `Access-Control-Allow-*` (server.js). Sem isso o
WebKitGTK barra o fetch no preflight ("Load failed") antes de ler o body.

Vídeo demo gerado: compositor `/tmp/g2_compose.py` monta um MP4 vertical 1080x1920
(branding + lente do G2 estilizada) a partir das capturas reais da lente.
Saída: `output/g2_demo.mp4` (18.4s, 3 comandos).

## Publicar na loja Even Hub (estado 2026-06-16)
App publicável pronto. Build limpo + pacote gerado:

    cd glasses-app && npm run build          # usa .env.production (endpoint público, mic real)
    node node_modules/@evenrealities/evenhub-cli/main.js pack app.json dist -o niar-assistant.ehpk

Pacote: `glasses-app/niar-assistant.ehpk` (~32 KB, header `EHPK`).
- Build production aponta pro endpoint público `https://eveng2.futurizeia.com` (whitelisted no app.json).
- `.env.development.local` (SIM panel) só carrega em `npm run dev`; o build de loja nunca leva o painel de simulador.
- O bridge responde no MESMO idioma da pergunta (review da loja é em inglês).

A CLI oficial (v0.1.13) NÃO publica — só `login`, `init`, `pack`, `qr`. Upload é MANUAL no
Portal web `https://hub.evenrealities.com`:
1. Logar no Portal com a conta do app Even (mesma do mobile). Conta dev = candidatura ao
   (interactive step: the human operator does this manually).
2. Criar app no Portal, subir `niar-assistant.ehpk`, anexar ícone MONOCROMÁTICO/greyscale,
   screenshots reais da lente, descrição e URL de política de privacidade (cobrir mic + network).
   (interactive step: the human operator does this manually).
3. Review manual da Even (sem prazo oficial publicado).
Sem taxa de developer documentada (não existe Apple-style US$99). Se o Portal pedir
   If any paid step appears during signup/submit: STOP and confirm with the human operator first.

## Custo
Zero. SDK/CLI/simulador são npm público grátis. LLM usa Gemini free tier.
Deps GTK/WebKit/Xvfb/ffmpeg/xdotool via apt (grátis). Publicar na loja Even Hub
(review) não foi feito.
