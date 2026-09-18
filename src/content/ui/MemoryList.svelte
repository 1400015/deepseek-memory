<script>
  import appState from "../state.js";
  import { normalizeMemories, saveMemoriesToStorage, deleteSingleMemory } from "../storage.js";
  import { pushConfigToPage } from "../bridge.js";
  import { onMount } from "svelte";
  import { t } from "../../lib/i18n.svelte.js";
  import MemoryImportModal from "./MemoryImport.svelte";

  let entries = $state(
    Object.entries(appState.memories).sort((a, b) => a[0].localeCompare(b[0]))
  );

  const DISPLAY_LIMIT = 5;
  let fileInput = $state(null);
  let showMemoryImport = $state(false);
  let showPopup = $state(false);
  let confirmActive = $state(false);
  let popupRef = $state(null);

  // Search filter
  let searchQuery = $state("");
  let filteredEntries = $derived(
    entries.filter(([key, item]) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return key.toLowerCase().includes(q) || String(item.value || "").toLowerCase().includes(q);
    })
  );

  // Edit memory state
  let editingKey = $state(null);
  let editingValue = $state("");
  let editingImportance = $state("called");

  // Add new memory state
  let showAddModal = $state(false);
  let newKey = $state("");
  let newValue = $state("");
  let newImportance = $state("always");

  export function refresh() {
    entries = Object.entries(appState.memories).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
  }

  function exportMemories() {
    const data = JSON.stringify(appState.memories, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dsm_memories.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function triggerImport() {
    fileInput && fileInput.click();
  }

  async function handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const raw = JSON.parse(e.target.result);
        const normalized = normalizeMemories(raw);

        // Save to storage (IndexedDB or chrome.storage)
        await saveMemoriesToStorage(normalized);

        // Update local state
        appState.memories = normalized;
        refresh();
        pushConfigToPage();

        if (appState.ui) {
          appState.ui.showToast(t('memoryList.importSuccess'));
        }
      } catch (err) {
        if (appState.ui) {
          appState.ui.showToast(t('memoryList.importFailed'));
        }
      }
      event.target.value = "";
    };
    reader.readAsText(file);
  }

  async function deleteMemory(key) {
    if (!appState.settings?.skipDeletionConfirmation) {
      if (!window.confirm(`Delete memory "${key}"?`)) return;
    }
    delete appState.memories[key];
    await deleteSingleMemory(key);
    refresh();
    pushConfigToPage();
    if (appState.ui) {
      appState.ui.showToast(t('memoryList.deleted', { key }));
    }
  }

  function startEdit(key, item) {
    editingKey = key;
    editingValue = item.value;
    editingImportance = item.importance;
  }

  function cancelEdit() {
    editingKey = null;
    editingValue = "";
    editingImportance = "called";
  }

  async function saveEdit() {
    if (!editingKey || !editingValue.trim()) return;
    appState.memories[editingKey].value = editingValue.trim();
    appState.memories[editingKey].importance = editingImportance;
    appState.memories[editingKey].updatedAt = Date.now();
    await saveMemoriesToStorage(appState.memories);
    refresh();
    pushConfigToPage();
    if (appState.ui) {
      appState.ui.showToast(t('memoryList.saved', { key: editingKey }));
    }
    cancelEdit();
  }

  function openAddModal() {
    newKey = "";
    newValue = "";
    newImportance = "always";
    showAddModal = true;
  }

  function closeAddModal() {
    showAddModal = false;
    newKey = "";
    newValue = "";
  }

  async function saveNewMemory() {
    const cleanKey = String(newKey || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    const cleanVal = String(newValue || "").trim();

    if (!cleanKey || !cleanVal) return;

    appState.memories[cleanKey] = {
      value: cleanVal,
      importance: newImportance === "always" ? "always" : "called",
      updatedAt: Date.now(),
    };

    await saveMemoriesToStorage(appState.memories);
    refresh();
    pushConfigToPage();

    if (appState.ui) {
      appState.ui.showToast(t('memoryList.saved', { key: cleanKey }));
    }
    closeAddModal();
  }

  function closePopup() {
    showPopup = false;
  }

  function handleKeydown(e) {
    if (e.key === "Escape" && !confirmActive) {
      if (showAddModal) closeAddModal();
      else if (editingKey) cancelEdit();
      else showPopup = false;
    }
  }

  onMount(() => {
    function handleClick(e) {
      if (showPopup && !confirmActive && popupRef && !popupRef.contains(e.target)) {
        showPopup = false;
      }
    }
    window.addEventListener("click", handleClick, true);
    return () => window.removeEventListener("click", handleClick, true);
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="dsm-section-title">
  <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; flex-wrap: wrap; gap: 8px;">
    <div style="display: flex; align-items: center; gap: 6px;">
      <span class="dsm-icon-inline">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M11.0307 5.46369C11.0305 3.78995 9.6734 2.43357 7.99961 2.43357C6.32601 2.43379 4.96972 3.79009 4.96949 5.46369C4.96949 7.13748 6.32587 8.49455 7.99961 8.49477C9.67354 8.49477 11.0307 7.13762 11.0307 5.46369ZM12.3163 5.46369C12.3163 7.84777 10.3837 9.78042 7.99961 9.78042C5.61572 9.7802 3.68288 7.84763 3.68288 5.46369C3.6831 3.07993 5.61586 1.14718 7.99961 1.14695C10.3836 1.14695 12.3161 3.0798 12.3163 5.46369Z" fill="currentColor"></path>
          <path d="M8.00002 10.3316C11.7343 10.3316 14.1864 11.8997 15.0387 14.4445L14.4292 14.6483L13.8197 14.8531C13.1955 12.9893 11.3673 11.6182 8.00002 11.6182C4.63277 11.6182 2.80455 12.9893 2.18031 14.8531L1.5708 14.6483L0.961304 14.4445C1.81368 11.8997 4.26579 10.3316 8.00002 10.3316Z" fill="currentColor"></path>
        </svg>
      </span>
      <span>{t('memoryList.title')}</span>
      <span style="font-size: 11px; opacity: 0.5;">({entries.length})</span>
    </div>
    
    <div style="display: flex; gap: 6px; align-items: center;">
      <button type="button" class="dsm-btn dsm-btn-xs" onclick={openAddModal} style="font-weight: 500;">
        + {t('common.add') || 'Add Memory'}
      </button>
      <button type="button" class="dsm-btn-outlined dsm-btn-xs" onclick={exportMemories}>
        {t('memoryList.export')}
      </button>
      <button type="button" class="dsm-btn-outlined dsm-btn-xs" onclick={triggerImport}>
        {t('memoryList.import')}
      </button>
      <input 
        id="dsm-memory-upload"
        type="file" 
        accept=".json" 
        style="display: none;" 
        bind:this={fileInput} 
        onchange={handleImport}
      />
    </div>
  </div>
</div>

{#if entries.length > 3}
  <div style="margin-bottom: 12px;">
    <input
      type="text"
      class="dsm-search-input"
      placeholder="Search memory..."
      bind:value={searchQuery}
      style="width: 100%; height: 32px; padding: 0 10px; font-size: 13px; border-radius: 8px; border: 1px solid var(--dsm-border); background: var(--dsm-bg-input); color: var(--dsm-text-primary);"
    />
  </div>
{/if}

<div id="dsm-memory-list" class="dsm-list">
  {#if filteredEntries.length === 0}
    <p class="dsm-empty">{searchQuery ? 'No matching memories.' : t('memoryList.empty')}</p>
  {:else}
    {#each filteredEntries.slice(0, DISPLAY_LIMIT) as [key, item] (key)}
      <div class="dsm-memory-item">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
          <div style="display: grid; gap: 4px; flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <strong style="color: var(--dsm-text-primary); font-size: 13px;">{key}</strong>
              <span style="font-size: 10px; padding: 1px 6px; border-radius: 4px; background: {item.importance === 'always' ? 'rgba(77, 107, 254, 0.15)' : 'var(--dsm-bg-hover)'}; color: {item.importance === 'always' ? 'var(--dsm-accent)' : 'var(--dsm-text-secondary)'}; font-weight: 500; text-transform: uppercase;">
                {item.importance}
              </span>
            </div>
            <span style="font-size: 12px; color: var(--dsm-text-secondary); line-height: 1.4;">{item.value}</span>
          </div>
          <div style="display: flex; gap: 4px; align-items: flex-start;">
            <button type="button" class="dsm-btn-outlined dsm-btn-xs" onclick={() => startEdit(key, item)}>
              {t('memoryList.edit')}
            </button>
            <button type="button" class="dsm-btn-danger" onclick={() => deleteMemory(key)}>
              {t('memoryList.delete')}
            </button>
          </div>
        </div>
      </div>
    {/each}

    {#if filteredEntries.length > DISPLAY_LIMIT}
      <button
        type="button"
        class="dsm-memory-more-badge"
        onclick={() => showPopup = true}
      >
        {t('memoryList.more', { count: filteredEntries.length - DISPLAY_LIMIT })}
      </button>
    {/if}
  {/if}
</div>

{#if showPopup}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="dsm-memory-popup-backdrop" onclick={closePopup} role="presentation">
    <div
      bind:this={popupRef}
      class="dsm-memory-popup"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
      <div class="dsm-memory-popup-header">
        <span class="dsm-memory-popup-title">{t('memoryList.title')}<span class="dsm-memory-popup-count"> ({entries.length})</span></span>
        <div class="dsm-memory-popup-actions">
          <button type="button" class="dsm-btn dsm-btn-xs" onclick={openAddModal}>
            + {t('common.add') || 'Add'}
          </button>
          <button type="button" class="dsm-btn-outlined dsm-btn-xs" onclick={exportMemories}>
            {t('memoryList.export')}
          </button>
          <button type="button" class="dsm-btn-outlined dsm-btn-xs" onclick={triggerImport}>
            {t('memoryList.import')}
          </button>
          <button
            type="button"
            class="dsm-memory-popup-close"
            onclick={closePopup}
            aria-label={t('common.close')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="dsm-memory-popup-body">
        {#if entries.length === 0}
          <p class="dsm-memory-popup-empty">{t('memoryList.empty')}</p>
        {:else}
          {#each entries as [key, item] (key)}
            <div class="dsm-memory-popup-item">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                <div style="display: grid; gap: 4px; flex: 1; min-width: 0;">
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <strong>{key}</strong>
                    <span style="font-size: 10px; padding: 1px 6px; border-radius: 4px; background: {item.importance === 'always' ? 'rgba(77, 107, 254, 0.15)' : 'var(--dsm-bg-hover)'}; color: {item.importance === 'always' ? 'var(--dsm-accent)' : 'var(--dsm-text-secondary)'}; font-weight: 500;">
                      {item.importance}
                    </span>
                  </div>
                  <span style="font-size: 12px; color: var(--dsm-text-secondary);">{item.value}</span>
                </div>
                <div style="display: flex; gap: 4px; align-items: flex-start;">
                  <button type="button" class="dsm-btn-outlined dsm-btn-xs" onclick={() => startEdit(key, item)}>
                    {t('memoryList.edit')}
                  </button>
                  <button type="button" class="dsm-btn-danger" onclick={() => deleteMemory(key)}>
                    {t('memoryList.delete')}
                  </button>
                </div>
              </div>
            </div>
          {/each}
        {/if}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="dsm-memory-popup-import-label" onclick={() => { closePopup(); showMemoryImport = true; }}>
          <span>{t('memoryImport.title')}</span>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Edit Memory Modal -->
{#if editingKey}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="dsm-edit-overlay" onclick={cancelEdit} role="presentation">
    <div
      class="dsm-edit-modal"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
      <div class="dsm-edit-header">
        <span>{t('memoryList.editTitle')}</span>
        <button
          type="button"
          class="dsm-edit-close"
          onclick={cancelEdit}
          aria-label={t('common.close')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="dsm-edit-body">
        <div class="dsm-edit-field">
          <label class="dsm-edit-label" for="dsm-edit-key">Key</label>
          <input id="dsm-edit-key" class="dsm-edit-input" value={editingKey} disabled />
        </div>
        <div class="dsm-edit-field">
          <label class="dsm-edit-label" for="dsm-edit-value">Value</label>
          <textarea id="dsm-edit-value" class="dsm-edit-textarea" bind:value={editingValue}></textarea>
        </div>
        <div class="dsm-edit-field">
          <label class="dsm-edit-label" for="dsm-edit-importance">Importance</label>
          <select id="dsm-edit-importance" class="dsm-edit-select" bind:value={editingImportance}>
            <option value="always">Always (Core Identity & Directives)</option>
            <option value="called">Called (Contextual Projects & Facts)</option>
          </select>
        </div>
      </div>
      <div class="dsm-edit-footer">
        <button type="button" class="dsm-btn-outlined" onclick={cancelEdit}>{t('common.cancel')}</button>
        <button type="button" class="dsm-btn" onclick={saveEdit}>{t('common.save')}</button>
      </div>
    </div>
  </div>
{/if}

<!-- Add Memory Modal -->
{#if showAddModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="dsm-edit-overlay" onclick={closeAddModal} role="presentation">
    <div
      class="dsm-edit-modal"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
      <div class="dsm-edit-header">
        <span>Add Persistent Memory</span>
        <button
          type="button"
          class="dsm-edit-close"
          onclick={closeAddModal}
          aria-label={t('common.close')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="dsm-edit-body">
        <div class="dsm-edit-field">
          <label class="dsm-edit-label" for="dsm-add-key">Key (e.g. user_title, directive_tone)</label>
          <input id="dsm-add-key" class="dsm-edit-input" placeholder="e.g. user_role" bind:value={newKey} />
        </div>
        <div class="dsm-edit-field">
          <label class="dsm-edit-label" for="dsm-add-value">Value / Instruction</label>
          <textarea id="dsm-add-value" class="dsm-edit-textarea" placeholder="Enter memory value or formal assistant directive..." bind:value={newValue}></textarea>
        </div>
        <div class="dsm-edit-field">
          <label class="dsm-edit-label" for="dsm-add-importance">Importance</label>
          <select id="dsm-add-importance" class="dsm-edit-select" bind:value={newImportance}>
            <option value="always">Always (Core Identity & Directives)</option>
            <option value="called">Called (Contextual Projects & Facts)</option>
          </select>
        </div>
      </div>
      <div class="dsm-edit-footer">
        <button type="button" class="dsm-btn-outlined" onclick={closeAddModal}>{t('common.cancel')}</button>
        <button type="button" class="dsm-btn" onclick={saveNewMemory}>{t('common.save')}</button>
      </div>
    </div>
  </div>
{/if}

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="dsm-memory-import-label" onclick={() => showMemoryImport = true}>
  <span>{t('memoryImport.title')}</span>
</div>

{#if showMemoryImport}
  <MemoryImportModal onclose={() => showMemoryImport = false} />
{/if}
