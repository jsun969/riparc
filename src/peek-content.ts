// Content script (classic script, not a module): turns Shift+click on a link
// into a peek popup and lets Esc close a peek.
//
// Wrapped in a block because the script can be injected twice into the same
// isolated world (manifest + reinjection after an extension reload), and
// top-level let/const would collide.
{
  // Mirrors DEFAULT_SETTINGS.peekEnabled in settings.ts.
  let peekEnabled = true;
  void chrome.storage.sync.get({ peekEnabled: true }).then((items) => {
    peekEnabled = Boolean(items.peekEnabled);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.peekEnabled) peekEnabled = Boolean(changes.peekEnabled.newValue);
  });

  // Capture phase on window: runs before the page's own handlers, so SPA
  // routers don't also navigate.
  window.addEventListener(
    "click",
    (event) => {
      // After the extension is reloaded, scripts left in open pages lose their
      // runtime; they step aside so the browser default (or a freshly injected
      // copy) handles the click.
      if (!peekEnabled || chrome.runtime?.id === undefined) return;
      if (!event.shiftKey || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey) return;
      const link = event
        .composedPath()
        .find(
          (el): el is HTMLAnchorElement | HTMLAreaElement =>
            (el instanceof HTMLAnchorElement || el instanceof HTMLAreaElement) && el.href !== "",
        );
      if (!link || link.hasAttribute("download")) return;
      const url = new URL(link.href);
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void chrome.runtime.sendMessage({ type: "peek", url: url.href }).catch(() => {});
    },
    true,
  );

  // Bubble phase, so pages that use Esc themselves (closing a modal) win.
  // Only popup windows lack a location bar; the worker checks it's a peek.
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || window.locationbar.visible) return;
    if (chrome.runtime?.id === undefined) return;
    void chrome.runtime.sendMessage({ type: "close-peek" }).catch(() => {});
  });
}
