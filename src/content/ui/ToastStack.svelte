<script>
  let { toasts = [] } = $props();
</script>

<div id="dsm-toast-stack">
  {#each toasts as toast (toast.id)}
    <div class="dsm-toast">{toast.message}</div>
  {/each}
</div>
