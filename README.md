# DeepSeek Memory

A Chrome extension that adds **persistent memory** and **custom skills** to [DeepSeek](https://chat.deepseek.com). All data stays local and private.

> This is an unofficial, community-driven project. Not affiliated with DeepSeek.

1.

<img width="1366" height="640" alt="image" src="https://github.com/user-attachments/assets/ead72b36-68c8-4548-ace7-8b5cff49264a" />

2.

<img width="1366" height="643" alt="image" src="https://github.com/user-attachments/assets/25c8c3aa-7439-4845-8870-9315b5197261" />



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