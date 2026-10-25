import {
  type BooleanSettingKey,
  NUMBER_BOUNDS,
  type NumberSettingKey,
  getSettings,
  setBooleanSetting,
  setNumberSetting,
} from "./settings.js";

const settings = await getSettings();

for (const input of document.querySelectorAll<HTMLInputElement>("input[data-setting]")) {
  if (input.type === "checkbox") {
    const key = input.dataset.setting as BooleanSettingKey;
    input.checked = settings[key];
    input.addEventListener("change", () => void setBooleanSetting(key, input.checked));
    continue;
  }
  const key = input.dataset.setting as NumberSettingKey;
  const { min, max, step } = NUMBER_BOUNDS[key];
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(settings[key]);
  input.addEventListener("change", async () => {
    input.value = String(await setNumberSetting(key, input.valueAsNumber));
  });
}

// Extension shortcuts can only be changed on the browser's own shortcut page.
const expandButton = document.querySelector<HTMLButtonElement>("#expand-peek-shortcut")!;
const commands = await chrome.commands.getAll();
expandButton.textContent = commands.find((c) => c.name === "expand-peek")?.shortcut || "Not set";
expandButton.addEventListener("click", () => {
  const scheme = navigator.userAgent.includes(" Edg/") ? "edge" : "chrome";
  void chrome.tabs.create({ url: `${scheme}://extensions/shortcuts` });
});
