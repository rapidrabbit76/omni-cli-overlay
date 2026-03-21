<p align="center">
  <img src="image.png" width="140" alt="OCO Logo" />
</p>

<h1 align="center">OCO</h1>

<p align="center">
  <strong>OpenAI Codex Overlay</strong> — A floating desktop overlay for <a href="https://github.com/openai/codex">OpenAI Codex CLI</a>
</p>

<p align="center">
  <a href="#motivation">Motivation</a> ·
  <a href="#installation">Installation</a> ·
  <a href="#features">Features</a> ·
  <a href="#keyboard-shortcuts">Shortcuts</a> ·
  <a href="#slash-commands">Commands</a> ·
  <a href="#development">Development</a> ·
  <a href="README.ko.md">한국어</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20·%20Windows-blue" alt="Platform" />
  <img src="https://img.shields.io/badge/electron-35-47848F?logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/react-19-61DAFB?logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
</p>

<br />

<p align="center">
  <img src="docs/screenshot/overlay.2.png" width="560" alt="OCO Overlay" />
</p>

---

## What is OCO?

OCO is an **always-on-top, click-through overlay** that wraps OpenAI's Codex CLI in a modern desktop interface. It floats above your editor, terminal, or any app — giving you instant access to AI without switching windows.

Think of it as a **HUD for AI coding** — transparent when idle, responsive when needed.

## Motivation

OCO was heavily inspired by [Clui CC](https://github.com/lcoutodemos/clui-cc), a polished Claude Code overlay that wraps `claude -p` with NDJSON streaming. While Clui CC spawns individual CLI processes per tab, OCO takes a different architectural approach — it connects directly to the [Codex CLI app-server](https://github.com/openai/codex) via WebSocket JSON-RPC, enabling native integration with the Codex runtime without shell-level process management.

The goal was simple: bring the same floating-overlay UX to the Codex ecosystem, built Codex-native from the ground up.

## Features

### Core

- **Transparent overlay** — Click-through when not in use; interacts only where UI elements exist
- **Multi-tab conversations** — Run parallel Codex sessions in separate tabs
- **Session persistence** — Browse, search, and resume past conversations
- **Live streaming** — Real-time token streaming with tool call visualization

<p align="center">
  <img src="docs/screenshot/overlay.1.png" width="480" alt="OCO Collapsed" />
  <br />
  <em>Collapsed view — minimal footprint on your screen</em>
</p>

### Interface

- **Glassmorphism UI** — Semi-transparent surfaces with backdrop blur and smooth animations
- **Draggable window** — Grab any non-interactive area to reposition
- **Auto-resize** — Window height adapts to content automatically
- **Command palette** — Quick switchers for models, reasoning levels, and session history
- **Dark & Light themes** — Follows system appearance

<p align="center">
  <img src="docs/screenshot/overlay.3.png" width="480" alt="OCO Settings Popover" />
  <br />
  <em>Quick settings popover — toggle theme, width, and notifications inline</em>
</p>

### Integrations

- **File attachments** — Attach code files and images directly to prompts
- **Screenshot capture** — Region-select screenshot → automatic attachment
- **Clipboard paste** — Paste images directly into the input
- **Open in Terminal** — Resume any session in a native terminal window
- **Skill autocompletion** — Type `$` to browse and insert Codex skills
- **Voice input** — Push-to-talk transcription via local Whisper (WhisperKit or whisper-cpp)

### Customization

- **Global hotkeys** — Toggle overlay with `Alt+Space` or `⌘+Shift+K` (configurable)
- **Adjustable opacity** — Dial overlay transparency from settings
- **Font presets** — Choose from multiple font families and sizes
- **Custom keybindings** — Remap every shortcut from the settings window
- **Default model & reasoning** — Persist your preferred model and reasoning level

<p align="center">
  <img src="docs/screenshot/settings.1.png" width="420" alt="OCO Settings — General" />
  <br />
  <em>Settings — defaults, appearance, opacity, and global shortcuts</em>
</p>

## Installation

### Homebrew (Recommended)

```bash
brew tap rapidrabbit76/tap
brew install --cask oco
```

### Download

Grab the latest pre-built binary from the [Releases](https://github.com/rapidrabbit76/OpenAI-Codex-Overlay/releases/latest) page:

| Platform | Download |
|---|---|
| macOS (Apple Silicon) | [**OCO-arm64.dmg**](https://github.com/rapidrabbit76/OpenAI-Codex-Overlay/releases/latest/download/OCO-arm64.dmg) |

> **Quick start:** Download the DMG → drag `OCO.app` to Applications → launch → toggle with `Alt+Space`.

### Prerequisites

- **macOS** 12+ (Apple Silicon / Intel)
- **OpenAI Codex CLI** — [Install guide](https://github.com/openai/codex#getting-started)

### From Source

If you prefer building from source:

```bash
git clone https://github.com/rapidrabbit76/OpenAI-Codex-Overlay.git
cd OpenAI-Codex-Overlay
pnpm install
pnpm dev
```

## Keyboard Shortcuts

<p align="center">
  <img src="docs/screenshot/settings.2.png" width="420" alt="OCO Settings — Shortcuts" />
  <br />
  <em>All shortcuts are fully customizable from Settings → Shortcuts</em>
</p>

### Global

| Shortcut | Action |
|---|---|
| `Alt+Space` | Toggle overlay |
| `⌘+Shift+K` | Toggle overlay (secondary) |
| `⌘+,` | Open settings |

### Tabs

| Shortcut | Action |
|---|---|
| `⌘+T` | New tab |
| `⌘+W` | Close tab |
| `⌘+[` / `⌘+]` | Previous / Next tab |
| `⌘+1`–`⌘+9` | Switch to tab N |

### Navigation

| Shortcut | Action |
|---|---|
| `⌘+E` | Toggle expanded view |
| `⌘+K` | Clear conversation |
| `⌘+L` | Focus input |
| `Escape` | Hide window |
| `Ctrl+H` | Open session history |

### Chord Shortcuts

Press `Ctrl+X` first (chord prefix), then:

| Key | Action |
|---|---|
| `M` | Switch model |
| `T` | Switch reasoning level |

## Slash Commands

Type `/` in the input bar to access built-in commands:

| Command | Description |
|---|---|
| `/clear` | Clear conversation history |
| `/new` | Start a new conversation tab |
| `/model` | Show or switch active model |
| `/resume` | Open session history picker |
| `/fork` | Fork current conversation to new tab |
| `/cost` | Show token usage and cost |
| `/copy` | Copy latest assistant response |
| `/status` | Show session and app status |
| `/diff` | Ask Codex for git diff |
| `/mention` | Attach files to prompt |
| `/compact` | Ask Codex to compact context |
| `/review` | Ask Codex to review changes |
| `/plan` | Ask Codex to enter plan mode |
| `/init` | Ask Codex to generate AGENTS.md |
| `/fast` | Toggle fast preset (gpt-5.4 + low reasoning) |
| `/personality` | Show communication personality options |
| `/permissions` | Show approval policy settings |
| `/mcp` | Show MCP server configuration hint |
| `/exit` | Hide OCO window |
| `/quit` | Hide OCO window |
| `/help` | Show all commands |

## Architecture

### How It Works

1. **Main process** spawns a Codex CLI app-server as a child process
2. **WebSocket transport** connects to the app-server's JSON-RPC interface
3. **Control plane** manages multiple tab sessions with a request queue
4. **Renderer** receives normalized events via IPC and renders the streaming conversation
5. **Click-through** is managed by tracking mouse position over UI elements in real-time

## Configuration

Settings are stored at `~/.config/oco/settings.json`:

```jsonc
{
  "defaultModel": "gpt-5.4",
  "defaultReasoning": "medium",
  "defaultDirectory": "~",
  "overlayOpacity": 1,
  "rememberPosition": false,
  "fontFamily": "-apple-system, BlinkMacSystemFont, ...",
  "micEnabled": true,
  "voiceLanguage": "",
  "voiceKey": "Alt"
}
```

Global shortcuts are stored separately at `~/Library/Application Support/OCO/shortcut-settings.json`.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | [Electron](https://www.electronjs.org/) 35 |
| Build | [electron-vite](https://electron-vite.org/) + [Vite](https://vitejs.dev/) 6 |
| UI | [React](https://react.dev/) 19 + [TypeScript](https://www.typescriptlang.org/) 5 |
| Styling | [Tailwind CSS](https://tailwindcss.com/) 4 |
| State | [Zustand](https://github.com/pmndrs/zustand) 5 |
| Animation | [Framer Motion](https://www.framer.com/motion/) 12 |
| Icons | [Phosphor Icons](https://phosphoricons.com/) |
| Markdown | [react-markdown](https://github.com/remarkjs/react-markdown) + [remark-gfm](https://github.com/remarkjs/remark-gfm) |

## Development

```bash
# Development mode with hot reload
pnpm dev

# Build for production
pnpm build

# Package as macOS DMG
pnpm dist:dmg

# Package as Windows EXE
pnpm dist:win

# Run diagnostics
pnpm doctor
```

Debug mode:

```bash
OCO_DEBUG=1 pnpm dev
```

## Troubleshooting

- **Overlay not appearing** — Check that `Alt+Space` isn't captured by another app
- **"Cannot connect" errors** — Ensure Codex CLI is installed and `codex` is in your PATH
- **macOS permission dialogs** — Grant accessibility permissions for global shortcuts

## License

[MIT](LICENSE) © rapidrabbit76 (yslee.dev@gmail.com)
