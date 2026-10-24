import { SETTING_BOUNDS, type SettingKey, getSettings, setSetting } from "./settings.js";

const settings = await getSettings();

for (const input of document.querySelectorAll<HTMLInputElement>("input[data-setting]")) {
  const key = input.dataset.setting as SettingKey;
  const { min, max, step } = SETTING_BOUNDS[key];
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(settings[key]);
  input.addEventListener("change", async () => {
    input.value = String(await setSetting(key, input.valueAsNumber));
  });
}

const shortcutButton = document.querySelector<HTMLButtonElement>("#shortcut")!;
const commands = await chrome.commands.getAll();
shortcutButton.textContent =
  commands.find((c) => c.name === "cycle-recent-tab")?.shortcut || "Not set";
shortcutButton.addEventListener("click", () => {
  const scheme = navigator.userAgent.includes(" Edg/") ? "edge" : "chrome";
  void chrome.tabs.create({ url: `${scheme}://extensions/shortcuts` });
});
