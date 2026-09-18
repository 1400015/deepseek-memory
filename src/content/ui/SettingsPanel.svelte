<script>
  import { onMount } from "svelte";
  import appState from "../state.js";
  import { pushConfigToPage } from "../bridge.js";
  import { STORAGE_KEYS } from "../../lib/constants.js";
  import { t, i18n, availableLocaleCodes } from "../../lib/i18n.svelte.js";

  let { onimportdata } = $props();

  let disableMemory = $state(Boolean(appState.settings.disableMemory));
  let locale = $state(appState.settings.locale || availableLocaleCodes[0] || "en");
  let syncLocale = $state(Boolean(appState.settings.syncLocale));
  let persistentMemory = $state(!appState.settings.disableMemory);

  // Auto-save when any toggle changes
  let _initDone = false;
  $effect(() => {
    // Track all reactive values
    const _ = persistentMemory;
    const __ = syncLocale;
    const ___ = locale;
    if (!_initDone) { _initDone = true; return; }
    disableMemory = !persistentMemory;
    autoSave();
  });

  export function refresh() {
    disableMemory = Boolean(appState.settings.disableMemory);
    persistentMemory = !disableMemory;
    locale = appState.settings.locale || availableLocaleCodes[0] || "en";
    syncLocale = Boolean(appState.settings.syncLocale);
  }

  export function checkBeforeClose() {
    return Promise.resolve(true);
  }

  async function autoSave() {
    appState.settings.disableMemory = disableMemory;
    appState.settings.locale = locale;
    appState.settings.syncLocale = syncLocale;
    await chrome.storage.local.set({
      [STORAGE_KEYS.settings]: appState.settings,
    });
    if (!syncLocale) {
      i18n.setLocale(locale);
    }
    pushConfigToPage();
  }

  onMount(() => {
    refresh();
  });
</script>

<div class="dsm-settings-container">
  <div class="dsm-toggle-row">
    <div class="dsm-toggle-info">
      <span class="dsm-toggle-label">{t('settings.persistentMemory')}</span>
      <span class="dsm-toggle-hint">{t('settings.persistentMemoryHint')}</span>
    </div>
    <label class="dsm-switch">
      <input id="dsm-persistent-memory" type="checkbox" bind:checked={persistentMemory} />
      <span class="dsm-switch-track"></span>
    </label>
  </div>

  <div class="dsm-toggle-row">
    <div class="dsm-toggle-info">
      <span class="dsm-toggle-label">{t('settings.syncLocale')}</span>
    </div>
    <label class="dsm-switch">
      <input type="checkbox" bind:checked={syncLocale} />
      <span class="dsm-switch-track"></span>
    </label>
  </div>

  {#if !syncLocale}
    <div class="dsm-toggle-row">
      <div class="dsm-toggle-info">
        <span class="dsm-toggle-label">{t('settings.selectLanguage')}</span>
      </div>
      <div class="dsm-select-wrapper">
        <select class="dsm-select" bind:value={locale}>
          {#each availableLocaleCodes as code}
            <option value={code}>{i18n.getNativeName(code)}</option>
          {/each}
        </select>
        <svg class="dsm-select-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </div>
    </div>
  {/if}

  <div class="dsm-settings-footer">
    <a class="dsm-github-link" href="https://github.com/logicwahid/deepseek-memory" target="_blank" rel="noopener noreferrer">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
      <span>DeepSeek Memory v1.6.0</span>
    </a>
  </div>
</div>