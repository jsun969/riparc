import { MAX_CYCLE_SIZE, MIN_CYCLE_SIZE, getCycleSize, setCycleSize } from "./settings.js";

const sizeInput = document.querySelector<HTMLInputElement>("#cycle-size")!;
const shortcutButton = document.querySelector<HTMLButtonElement>("#shortcut")!;

sizeInput.min = String(MIN_CYCLE_SIZE);
sizeInput.max = String(MAX_CYCLE_SIZE);
sizeInput.value = String(await getCycleSize());
sizeInput.addEventListener("change", async () => {
  sizeInput.value = String(await setCycleSize(sizeInput.valueAsNumber));
});

const commands = await chrome.commands.getAll();
shortcutButton.textContent =
  commands.find((c) => c.name === "cycle-recent-tab")?.shortcut || "Not set";
shortcutButton.addEventListener("click", () => {
  const scheme = navigator.userAgent.includes(" Edg/") ? "edge" : "chrome";
  void chrome.tabs.create({ url: `${scheme}://extensions/shortcuts` });
});
