# DeepSeek Memory

A lightweight Chrome extension that adds **persistent memory** and a **skill system** to [DeepSeek](https://chat.deepseek.com). All data stays local and private on your device.

> DeepSeek Memory is an unofficial, independent, and community-driven open-source extension. It is NOT affiliated with, endorsed by, sponsored by, or officially connected to DeepSeek or DeepSeek AI in any way.

## Features

### Persistent Memory
DeepSeek forgets everything between sessions. This extension fixes that. It lets DeepSeek store and recall facts about you across conversations — your name, preferences, projects, language, and anything else you share. Memories are automatically injected into every new chat so DeepSeek always remembers who you are.

- **Auto-save**: Important facts are extracted from conversations and saved automatically.
- **Language-agnostic**: Works with any language — Bengali, English, Chinese, Turkish, and more.
- **Full control**: View, edit, delete, export, and import your memories from the settings panel.

### Skill System
Upload markdown files that define custom instructions, behaviors, or workflows. Skills are injected into every conversation and can be toggled on or off individually.

- Upload `.md` files as skills
- Enable/disable skills with a single toggle
- Skills are sent to DeepSeek with every request

### Settings Panel
A clean, native-feeling settings modal — integrated directly into DeepSeek's own settings dropdown. Three tabs:

- **General**: Toggle persistent memory on/off, sync language settings.
- **Skills**: Manage your uploaded skills.
- **Memory**: Browse, search, edit, and delete stored memories.

## Installation

### From Source (Developer Mode)

**Prerequisites**: Node.js 18+, npm

```bash
git clone https://github.com/logicwahid/deepseek-memory.git
cd deepseek-memory
npm install
npm run build
```

The `dist/` folder will contain the unpacked extension.

**Load in Chrome**:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `dist/` folder

The extension is now active on `chat.deepseek.com`.

## How It Works

1. Visit [chat.deepseek.com](https://chat.deepseek.com)
2. Open DeepSeek's settings dropdown (click your profile icon)
3. Click **Memory & Skills** to open the extension panel
4. Enable **Persistent Memory** and start chatting — DeepSeek will remember you

When DeepSeek identifies important information in your messages, it writes them to memory using `<DSM:memory_write>` tags. These tags are invisible in the chat UI — the extension handles them silently in the background.

## Privacy

DeepSeek Memory does **not** collect, transmit, distribute, or sell any of your personal data, chat logs, or browsing history to any external servers or third parties.

- **Local storage only**: All data — settings, memories, and skills — is stored strictly on your device using `chrome.storage.local`.
- **No external calls**: The extension never contacts any server other than `chat.deepseek.com` (which you are already using).
- **No tracking**: No analytics, telemetry, or fingerprinting of any kind.
- **Permissions**: `storage` (local settings) and `host_permissions` for `chat.deepseek.com` (to inject memory/skills into chat requests).

> DeepSeek Memory operates on `chat.deepseek.com`. Please refer to DeepSeek's own privacy policy regarding how they handle your chat data.

## Development

```bash
npm run dev    # Development build with watch mode
npm run build  # Production build
```

After making changes, rebuild and reload the extension from `chrome://extensions`.

### Project Structure

```
src/
├── background/        # Service worker
├── content/           # Content script (runs on DeepSeek page)
│   ├── parser/        # Tag parsing (memory, skills)
│   ├── ui/            # Svelte 5 components (settings modal, lists)
│   └── index.js       # Entry point
├── injected/          # MAIN-world script (fetch/XHR interception)
├── lib/               # Shared utilities and constants
├── locales/           # i18n translations
└── styles/            # CSS
static/
└── manifest.json      # Chrome extension manifest (MV3)
```

## Changelog

### v1.1.0
- Fixed chat history showing raw injected tags (MEMORY\_SYSTEM, DSM:memory\_calls, dsmemory) in user messages
- System prompt now injects only on the first message of each conversation
- Added triple-layer defense: API-level stripping, DOM-level scanner, and CSS fallback
- Removed Firefox support — Chromium-only for cleaner codebase
- Removed unused `dsm:sd` custom event dispatch

### v1.0.0
- Initial release
- Persistent memory with auto-save
- Skill system for custom instructions
- Settings panel integrated into DeepSeek UI
- Multi-language support

## Tech Stack

- **Svelte 5** (runes: `$state`, `$effect`, `$props`)
- **Vite** multi-target build system
- **Chrome Extension Manifest V3**
- `chrome.storage.local` for persistent storage
- `MutationObserver` for DOM scanning and tag cleanup

## Disclaimer

Use at your own risk. DeepSeek Memory is an independent project and is not affiliated with DeepSeek.

## Credits

Developed by [logicwahid](https://github.com/logicwahid)

Repository: [https://github.com/logicwahid/deepseek-memory](https://github.com/logicwahid/deepseek-memory)

## License

MIT
