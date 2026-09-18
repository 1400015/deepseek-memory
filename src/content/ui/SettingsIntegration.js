/**
 * DeepSeek Settings Integration
 *
 * Injects a "Memory & Skills" entry into DeepSeek's native settings/user dropdown
 * (the menu that opens from the user/settings icon at the bottom of the sidebar or top of the page).
 * Clicking the entry dispatches a `dsm:open` event, which App.svelte
 * picks up to open our DSM drawer panel.
 *
 * Robust Multi-Language Support (fixes Issue #1):
 * - Checks comprehensive multi-lingual labels for "Download App", "Settings", and "Log out".
 * - Smart multi-tier fallback placement (after App Download, after Settings, or before Log out).
 * - Structural heuristics to ensure it only attaches to the user/settings dropdown.
 * - Dynamic entry label localization based on active language.
 */

const ENTRY_ID = "dsm-settings-entry";
const ENTRY_CLASS = "dsm-settings-entry";

// Multi-language keywords for the "Download mobile App" item
const APP_ANCHOR_KEYWORDS = [
  // English
  "download mobile app", "get app", "download app", "mobile app",
  // Japanese (Issue #1 fix)
  "モバイルアプリをダウンロード", "モバイルアプリ", "アプリを取得", "アプリのダウンロード", "アプリをダウンロード", "アプリ",
  // Chinese
  "下载手机 app", "下载移动端 app", "下载 app", "下载客户端", "下载手机", "移动端 app", "移动端", "手机 app",
  // Russian
  "скачать мобильное приложение", "скачать приложение", "мобильное приложение",
  // Turkish
  "mobil uygulamayı indir", "uygulamayı indirin", "uygulama indir", "mobil uygulama",
  // Spanish
  "descargar app móvil", "descargar aplicación", "obtener app", "app móvil",
  // French
  "télécharger l'application", "télécharger l'app", "application mobile",
  // German
  "mobile app herunterladen", "app herunterladen", "app holen",
  // Korean
  "모바일 앱 다운로드", "앱 다운로드", "모바일 앱", "앱 받기",
  // Bengali
  "মোবাইল অ্যাপ ডাউনলোড", "অ্যাপ ডাউনলোড", "মোবাইল অ্যাপ",
  // Portuguese & Italian
  "baixar aplicativo móvel", "baixar app", "scarica l'app", "app per dispositivi mobili"
];

// Multi-language keywords for "Settings" or "Profile"
const SETTINGS_ANCHOR_KEYWORDS = [
  "settings", "user settings", "preferences", "my profile", "profile", "account",
  "設定", "ユーザー設定", "環境設定", "マイプロフィール", "プロフィール", "アカウント",
  "设置", "系统设置", "偏好设置", "个人中心", "个人资料", "账号",
  "настройки", "параметры", "профиль", "аккаунт",
  "ayarlar", "tercihler", "profil", "hesap",
  "configuración", "ajustes", "perfil", "cuenta",
  "paramètres", "profil", "compte",
  "einstellungen", "profil", "konto",
  "설정", "환경설정", "프로필", "계정",
  "সেটিংস", "প্রোফাইল", "অ্যাকাউন্ট"
];

// Multi-language keywords for "Log out" / "Sign out" (we insert BEFORE logout)
const LOGOUT_ANCHOR_KEYWORDS = [
  "log out", "logout", "sign out", "signout",
  "ログアウト", "サインアウト",
  "退出登录", "退出",
  "выйти", "выход",
  "çıkış yap", "çıkış", "oturumu kapat",
  "cerrar sesión", "desconectar",
  "déconnexion",
  "abmelden", "ausloggen",
  "로그아웃",
  "লগআউট", "সাইনআউট"
];

// Keywords indicating this is a chat conversation context menu or model picker (DO NOT INJECT)
const EXCLUDED_MENU_KEYWORDS = [
  "rename", "delete", "pin", "unpin", "share",
  "重命名", "删除", "置顶", "分享",
  "名前の変更", "削除", "ピン留め", "共有",
  "переименовать", "удалить", "закрепить",
  "yeniden adlandır", "sil", "sabitle",
  "deepseek-v3", "deepseek-r1", "deepseek-chat"
];

// SVG icon (brain + bookmark glyph) sized for DeepSeek dropdown rows.
const ICON_SVG = `
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
     stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M9.5 2A2.5 2.5 0 0 0 7 4.5v.5a3 3 0 0 0-3 3v.5A2.5 2.5 0 0 0 2 11v2a2.5 2.5 0 0 0 2 2.5v.5a3 3 0 0 0 3 3v.5A2.5 2.5 0 0 0 9.5 22h5a2.5 2.5 0 0 0 2.5-2.5V19a3 3 0 0 0 3-3v-.5A2.5 2.5 0 0 0 22 13v-2a2.5 2.5 0 0 0-2-2.5V8a3 3 0 0 0-3-3v-.5A2.5 2.5 0 0 0 14.5 2h-5z"></path>
  <path d="M12 8v8"></path>
  <path d="M9 11h6"></path>
  <path d="M9 14h6"></path>
</svg>`;

let observerStarted = false;

/**
 * Public API used by content/index.js — starts the integration once and only once.
 */
export function initSettingsIntegration() {
  if (observerStarted) return;
  observerStarted = true;

  // Run once on init in case the dropdown is already mounted.
  scanAndInject();

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.classList && (node.classList.contains("ds-dropdown-menu") || node.classList.contains("ds-dropdown"))) {
          injectEntry(node);
          continue;
        }
        const nested = node.querySelector && node.querySelector(".ds-dropdown-menu, .ds-dropdown");
        if (nested) injectEntry(nested);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * Scan visible dropdowns once. Useful right after the content script boots.
 */
function scanAndInject() {
  const menus = document.querySelectorAll(".ds-dropdown-menu, .ds-dropdown");
  menus.forEach((menu) => injectEntry(menu));
}

/**
 * Inject the DSM entry into a settings dropdown menu.
 */
function injectEntry(menu) {
  if (!menu || menu.querySelector("." + ENTRY_CLASS)) return;

  const options = Array.from(menu.querySelectorAll(".ds-dropdown-menu-option, [class*='dropdown-menu-option'], [role='menuitem']"));
  if (options.length === 0) return;

  // Check if this menu should be excluded (e.g. chat rename/delete menu or model selector)
  const allMenuText = options.map((opt) => (opt.textContent || "").toLowerCase()).join(" ");
  if (EXCLUDED_MENU_KEYWORDS.some((kw) => allMenuText.includes(kw))) {
    return;
  }

  // Multi-tier placement strategy:
  // Tier 1: Match "Download App" option -> insert right after it
  const appOption = findOptionMatching(options, APP_ANCHOR_KEYWORDS);
  if (appOption) {
    const entry = buildEntry();
    appOption.parentNode.insertBefore(entry, appOption.nextSibling);
    return;
  }

  // Tier 2: Match "Settings" or "Profile" option -> insert right after it
  const settingsOption = findOptionMatching(options, SETTINGS_ANCHOR_KEYWORDS);
  if (settingsOption) {
    const entry = buildEntry();
    settingsOption.parentNode.insertBefore(entry, settingsOption.nextSibling);
    return;
  }

  // Tier 3: Match "Log out" / "Sign out" option -> insert right BEFORE it
  const logoutOption = findOptionMatching(options, LOGOUT_ANCHOR_KEYWORDS);
  if (logoutOption) {
    const entry = buildEntry();
    logoutOption.parentNode.insertBefore(entry, logoutOption);
    return;
  }

  // Tier 4: Fallback heuristic — if menu has >= 2 options and is in a popover/dropdown,
  // insert before the last option (which is typically logout) or at the end
  if (options.length >= 2) {
    const lastOpt = options[options.length - 1];
    const entry = buildEntry();
    lastOpt.parentNode.insertBefore(entry, lastOpt);
  }
}

/**
 * Find an option element whose text or title contains any of the given keywords.
 */
function findOptionMatching(options, keywords) {
  for (const opt of options) {
    const text = (opt.textContent || "").toLowerCase().trim();
    if (keywords.some((kw) => text.includes(kw))) {
      return opt;
    }
  }
  return null;
}

/**
 * Determine the localized label for the dropdown menu entry.
 */
function getLocalizedMenuLabel() {
  const lang = (
    document.documentElement.lang ||
    navigator.language ||
    "en"
  ).toLowerCase();

  if (lang.startsWith("ja")) return "メモリー＆スキル";
  if (lang.startsWith("zh")) return "记忆与技能";
  if (lang.startsWith("ru")) return "Память и навыки";
  if (lang.startsWith("tr")) return "Hafıza ve Beceriler";
  if (lang.startsWith("bn")) return "মেমরি ও স্কিলস";
  if (lang.startsWith("es")) return "Memoria y Habilidades";
  if (lang.startsWith("fr")) return "Mémoire et Compétences";
  if (lang.startsWith("de")) return "Gedächtnis & Fähigkeiten";
  if (lang.startsWith("ko")) return "메모리 및 스킬";

  return "Memory & Skills";
}

/**
 * Build the menu option DOM node using DeepSeek's own dropdown classes so it
 * blends in seamlessly with the native look.
 */
function buildEntry() {
  const opt = document.createElement("div");
  opt.id = ENTRY_ID;
  opt.className = "ds-dropdown-menu-option ds-dropdown-menu-option--none " + ENTRY_CLASS;
  opt.setAttribute("role", "menuitem");
  opt.setAttribute("tabindex", "0");

  const icon = document.createElement("div");
  icon.className = "ds-dropdown-menu-option__icon";
  icon.innerHTML = ICON_SVG;

  const label = document.createElement("div");
  label.className = "ds-dropdown-menu-option__label";
  label.textContent = getLocalizedMenuLabel();

  opt.appendChild(icon);
  opt.appendChild(label);

  // Hover styling fallback in case DeepSeek CSS scoping changes
  opt.addEventListener("mouseenter", () => {
    opt.classList.add("ds-dropdown-menu-option--hover");
  });
  opt.addEventListener("mouseleave", () => {
    opt.classList.remove("ds-dropdown-menu-option--hover");
  });

  opt.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Close the DeepSeek dropdown by clicking the body — lets React unmount it
    // naturally without ripping nodes out of the virtual DOM.
    document.body.click();

    // Ask App.svelte to open the settings modal.
    window.dispatchEvent(new CustomEvent("dsm:open"));
  });

  return opt;
}