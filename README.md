# DeepSeek Memory

A Chrome extension that adds **persistent memory** and **custom skills** to [DeepSeek](https://chat.deepseek.com). All data stays local and private.

> This is an unofficial, community-driven project. Not affiliated with DeepSeek.

<img width="1366" height="616" alt="name" src="https://github.com/user-attachments/assets/fad585a9-d672-4d2a-ab5a-19745e9c7b7f" />

<img width="1366" height="616" alt="name" src="https://github.com/user-attachments/assets/9c590cac-a23b-4553-94d5-d6aad2836c74" />

<img width="1366" height="619" alt="model" src="https://github.com/user-attachments/assets/e73e5b69-a690-49ca-8214-277329587e4c" />


## Install

### Microsoft Edge (Recommended)

Install directly from the Edge Add-ons Store:

**[DeepSeek Memory on Edge Store](https://microsoftedge.microsoft.com/addons/detail/deepseek-memory/cbcgjipiofodmhmhfgobniohnpjdlfoi)**

### Chrome / Other Chromium Browsers

1. Download or clone this repo
2. Go to `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the `dist/` folder from this repo

## Features

- **Persistent Memory** — DeepSeek remembers your name, preferences, projects across conversations
- **Skill System** — Upload `.md` files as custom instructions
- **Settings Panel** — Integrated into DeepSeek's native UI
- **Multi-language** — Works with any language

## Usage

1. Visit [chat.deepseek.com](https://chat.deepseek.com)
2. Open DeepSeek settings dropdown
3. Click **Memory & Skills**
4. Enable **Persistent Memory** and start chatting

## Privacy

- All data stored locally via `chrome.storage.local`
- No external servers, no tracking, no analytics

## Development

```bash
git clone https://github.com/logicwahid/deepseek-memory.git
cd deepseek-memory
npm install
npm run build
```

Reload the extension from `chrome://extensions` after each build.

## License

MIT — Developed by [logicwahid](https://github.com/logicwahid)
