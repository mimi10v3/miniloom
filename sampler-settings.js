// TODO: Use a preload
const { ipcRenderer } = require("electron");
const samplerOptionMenu = document.getElementById("menu-host");
const menuHost = samplerOptionMenu;
let samplerSettingsStore = {};

function baseSamplerMenu() {
  samplerOptionMenu.innerHTML = "";

  const settingsNameLabel = document.createElement("label");
  settingsNameLabel.for = "setting-settings-name";
  settingsNameLabel.textContent = "Settings Name";
  const settingsName = document.createElement("input");
  settingsName.type = "text";
  settingsName.id = "setting-settings-name";
  settingsName.name = "setting-settings-name";
  settingsName.classList.add("settingsNameType");
  settingsName.value = "Default";

  const apiUrlLabel = document.createElement("label");
  apiUrlLabel.for = "api-url";
  apiUrlLabel.textContent = "API URL";
  const apiUrl = document.createElement("input");
  apiUrl.type = "text";
  apiUrl.id = "api-url";
  apiUrl.name = "api-url";
  apiUrl.classList.add("URLType");
  apiUrl.value = "http://localhost:5000/";

  const outputBranchesLabel = document.createElement("label");
  outputBranchesLabel.for = "output-branches";
  outputBranchesLabel.classList.add("first-sampler-menu-item");
  outputBranchesLabel.textContent = "Output Branches";
  const outputBranches = document.createElement("input");
  outputBranches.type = "text";
  outputBranches.id = "output-branches";
  outputBranches.name = "output-branches";
  outputBranches.classList.add("intType");
  outputBranches.value = "2";

  const tokensPerBranchLabel = document.createElement("label");
  tokensPerBranchLabel.for = "tokens-per-branch";
  tokensPerBranchLabel.textContent = "Tokens Per Branch";
  const tokensPerBranch = document.createElement("input");
  tokensPerBranch.type = "text";
  tokensPerBranch.id = "tokens-per-branch";
  tokensPerBranch.name = "tokens-per-branch";
  tokensPerBranch.classList.add("intType");
  tokensPerBranch.value = "256";

  const temperatureLabel = document.createElement("label");
  temperatureLabel.for = "temperature";
  temperatureLabel.textContent = "Temperature";
  const temperature = document.createElement("input");
  temperature.type = "text";
  temperature.id = "temperature";
  temperature.name = "temperature";
  temperature.classList.add("floatType");
  temperature.value = "0.9";

  const topPLabel = document.createElement("label");
  topPLabel.for = "top-p";
  topPLabel.textContent = "Top-P";
  const topP = document.createElement("input");
  topP.type = "text";
  topP.id = "top-p";
  topP.name = "top-p";
  topP.classList.add("floatType");
  topP.value = "1";

  const topKLabel = document.createElement("label");
  topKLabel.for = "top-k";
  topKLabel.textContent = "Top-K";
  const topK = document.createElement("input");
  topK.type = "text";
  topK.id = "top-k";
  topK.name = "top-k";
  topK.classList.add("intType");
  topK.value = "100";

  const repetitionPenaltyLabel = document.createElement("label");
  repetitionPenaltyLabel.for = "repetition-penalty";
  repetitionPenaltyLabel.textContent = "Repetition Penalty";
  const repetitionPenalty = document.createElement("input");
  repetitionPenalty.type = "text";
  repetitionPenalty.id = "repetition-penalty";
  repetitionPenalty.name = "repetition-penalty";
  repetitionPenalty.classList.add("floatType");
  repetitionPenalty.value = "1";

  const apiKeyLabel = document.createElement("label");
  apiKeyLabel.for = "api-key";
  apiKeyLabel.textContent = "API Key";
  const apiKey = document.createElement("input");
  apiKey.type = "password";
  apiKey.id = "setting-api-key";
  apiKey.name = "api-key";

  const apiDelayLabel = document.createElement("label");
  apiDelayLabel.for = "api-delay";
  apiDelayLabel.textContent = "API Delay (milliseconds)";
  const apiDelay = document.createElement("input");
  apiDelay.type = "text";
  apiDelay.id = "api-delay";
  apiDelay.name = "api-delay";
  apiDelay.classList.add("intType");
  apiDelay.value = 3000;

  const modelNameLabel = document.createElement("label");
  modelNameLabel.for = "model-name";
  modelNameLabel.textContent = "Model Name";
  const modelName = document.createElement("input");
  modelName.type = "text";
  modelName.id = "model-name";
  modelName.name = "model-name";
  modelName.classList.add("modelNameType");
  modelName.value = "togethercomputer/llama-2-70b";

  samplerOptionMenu.append(settingsNameLabel);
  samplerOptionMenu.append(settingsName);
  samplerOptionMenu.append(apiUrlLabel);
  samplerOptionMenu.append(apiUrl);
  samplerOptionMenu.append(outputBranchesLabel);
  samplerOptionMenu.append(outputBranches);
  samplerOptionMenu.append(tokensPerBranchLabel);
  samplerOptionMenu.append(tokensPerBranch);
  samplerOptionMenu.append(temperatureLabel);
  samplerOptionMenu.append(temperature);
  samplerOptionMenu.append(topPLabel);
  samplerOptionMenu.append(topP);
  samplerOptionMenu.append(topKLabel);
  samplerOptionMenu.append(topK);
  samplerOptionMenu.append(repetitionPenaltyLabel);
  samplerOptionMenu.append(repetitionPenalty);
  samplerOptionMenu.append(apiKeyLabel);
  samplerOptionMenu.append(apiKey);
  samplerOptionMenu.append(apiDelayLabel);
  samplerOptionMenu.append(apiDelay);
  samplerOptionMenu.append(modelNameLabel);
  samplerOptionMenu.append(modelName);
}

function togetherSamplerMenu() {
  baseSamplerMenu();
  const apiUrl = document.getElementById("api-url");
  apiUrl.value = "https://api.together.xyz/inference";
  const topP = document.getElementById("top-p");
  topP.value = "1";
  const topK = document.getElementById("top-k");
  topK.value = "100";
  const repetitionPenalty = document.getElementById("repetition-penalty");
  repetitionPenalty.value = "1";
  const apiDelay = document.getElementById("api-delay");
  apiDelay.value = 3000;
  const modelName = document.getElementById("model-name");
  modelName.value = "togethercomputer/llama-2-70b";
}

function openrouterSamplerMenu() {
  baseSamplerMenu();
  const apiUrl = document.getElementById("api-url");
  apiUrl.value = "https://openrouter.ai/api/v1/chat/completions";
  const topP = document.getElementById("top-p");
  topP.value = "1";
  const topK = document.getElementById("top-k");
  topK.value = "100";
  const repetitionPenalty = document.getElementById("repetition-penalty");
  repetitionPenalty.value = "1";
  const apiDelay = document.getElementById("api-delay");
  apiDelay.value = 3000;
  const modelName = document.getElementById("model-name");
  modelName.value = "deepseek/deepseek-v3-base:free";  
}

function openaiCompletionsSamplerMenu() {
  baseSamplerMenu();
  const apiUrl = document.getElementById("api-url");
  apiUrl.value = "https://api.openai.com/";
  const topP = document.getElementById("top-p");
  topP.value = "1";
  const topK = document.getElementById("top-k");
  topK.value = "100";
  const repetitionPenalty = document.getElementById("repetition-penalty");
  repetitionPenalty.value = "1";
  const apiDelay = document.getElementById("api-delay");
  apiDelay.value = 3000;
  const modelName = document.getElementById("model-name");
  modelName.value = "code-davinci-002";
}

// Add this function for the OpenAI Chat Completions sampler menu
function openaiChatCompletionsSamplerMenu() {
  baseSamplerMenu();
  const apiUrl = document.getElementById("api-url");
  apiUrl.value = "https://api.openai.com/v1/chat/completions";
  const topP = document.getElementById("top-p");
  topP.value = "1";
  const topK = document.getElementById("top-k");
  topK.value = "100";
  const repetitionPenalty = document.getElementById("repetition-penalty");
  repetitionPenalty.value = "1";
  const apiDelay = document.getElementById("api-delay");
  apiDelay.value = 3000;
  const modelName = document.getElementById("model-name");
  modelName.value = "gpt-5";  
}

function samplerMenuToDict() {
  const out = {};
  for (let child of samplerOptionMenu.children) {
    if (child.tagName === "INPUT" && child.id !== "setting-api-key") {
      out[child.id] = {"value": child.value, "type": child.className};
    }
  }
  return out;
}

// From Google AI overview for "node js url validation"
function isValidUrl(urlString) {
  try {
    new URL(urlString);
    return true;
  } catch (error) {
    return false;
  }
}

function validateFieldStringType(fieldValue, fieldType) {
  const fieldValueString = String(fieldValue);
  const intPattern = /^[0-9]+$/
  const floatPattern = /^[0-9]+\.?[0-9]*$/
  const modelNamePattern = /^[a-zA-Z0-9-\._]+$/
  let result;
  if (fieldType === "intType") {
    result = fieldValueString.match(intPattern);
  }
  else if (fieldType === "floatType") {
    result = fieldValueString.match(floatPattern);
  }
  else if (fieldType === "modelNameType") {
    result = fieldValueString.match(modelNamePattern);
  }
  else if (fieldType === "settingsNameType") {
    result = fieldValueString.match(modelNamePattern);
  }
  else if (fieldType === "URLType") {
    result = isValidUrl(fieldValue);
  }
  else {
    if (fieldType === "") {
      console.warn("Tried to validate empty field type. Did you forget to type your form field?");
      result = null;
    }
    else {
      console.warn("Attempted to validate unknown field type")
      result = null;
    }
  }
  return result;
}  

function loadSamplerMenuDict(samplerMenuDict) {
  for (let field of samplerOptionMenu.children) {
    if (field.id !== "setting-api-key" &&
        Object.keys(samplerMenuDict).includes(field.id) &&
        field.className === samplerMenuDict[field.id]["type"]) {
      if (validateFieldStringType(samplerMenuDict[field.id]["value"], field.className)) {
        field.value = samplerMenuDict[field.id]["value"];
      }
      else {
        throw new TypeError("Attempted to import bad sampler settings, is your JSON corrupted?");
      }
    }
  }
}

// Add this function to create a default chat JSON structure
function createDefaultChatJson() {
  return JSON.stringify(
    {
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant.",
        },
        {
          role: "user",
          content: "Hello!",
        },
      ],
    },
    null,
    2
  );
}

function internalSaveSamplerSettings() {
  let currentSampler = document.getElementById("sampler").value;
  let settingsName = document.getElementById("setting-settings-name").value;
  if (Object.keys(samplerSettingsStore).includes("sampler-settings")) {
    samplerSettingsStore["sampler-settings"][settingsName] = samplerMenuToDict();
  }
  else {
    samplerSettingsStore["sampler-settings"] = new Object();
    samplerSettingsStore["sampler-settings"][settingsName] = samplerMenuToDict();
  }
  console.log(samplerSettingsStore);
  ipcRenderer
    .invoke("save-settings", samplerSettingsStore)
    .catch((err) => console.error("Settings save Error:", err));
}

// samplerOptionMenu.addEventListener("change", internalSaveSamplerSettings);
// sampler.addEventListener("focus", internalSaveSamplerSettings);

sampler?.addEventListener("change", function () {
  if (activeTab === "sampler-settings") {
    renderSamplerSettingsTab();
  }
});

function loadSettings() {
  return ipcRenderer
    .invoke("load-settings")
    .then((data) => {
      if (data != null) {
        samplerSettingsStore = data;
      }
    })
    .catch((err) => console.error("Load Settings Error:", err));
}



// ---------- Tab 1: Sampler Settings ----------
function renderSamplerSettingsTab() {
  // Draw the sampler form using your existing per-sampler builders.
  menuHost.innerHTML = "";

  // Use whatever sampler is currently selected
  const selected = sampler?.value || "openai";
  if (selected === "base") baseSamplerMenu();
  else if (selected === "together") togetherSamplerMenu();
  else if (selected === "openrouter") openrouterSamplerMenu();
  else if (selected === "openai") openaiCompletionsSamplerMenu();
  else if (selected === "openai-chat") {
    openaiChatCompletionsSamplerMenu();
    // Guard optional editor helpers if present
    if (typeof editor !== "undefined" && typeof isValidChatJson === "function") {
      if (!editor.value?.trim() || !isValidChatJson(editor.value)) {
        editor.value = createDefaultChatJson();
        if (typeof updateCounterDisplay === "function") updateCounterDisplay(editor.value);
      }
    }
  } else {
    // Fallback to base
    baseSamplerMenu();
  }

  // Divider + explicit SAVE UI (no more forced "Default" load)
  const divider = document.createElement("div");
  divider.className = "divider";
  menuHost.appendChild(divider);

  // Save row: use your existing #setting-settings-name as the preset name
  const saveRow = document.createElement("div");
  saveRow.className = "row";
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn primary";
  saveBtn.textContent = "Save preset";
  saveBtn.title = "Save sampler settings under this name";
  saveBtn.addEventListener("click", () => {
    try {
      internalSaveSamplerSettings();
      flashSaved("Preset saved.");
    } catch (e) {
      console.error(e);
      flashSaved("Failed to save preset (see console).", true);
    }
  });

  const hint = document.createElement("span");
  hint.className = "muted";
  hint.textContent = "Tip: change “Settings Name” above, then click Save.";

  saveRow.appendChild(saveBtn);
  saveRow.appendChild(hint);
  menuHost.appendChild(saveRow);
}

function flashSaved(msg, isError = false) {
  const note = document.createElement("div");
  note.textContent = msg;
  note.style.marginTop = "8px";
  note.style.fontWeight = "600";
  note.style.color = isError ? "#b00020" : "#0a7d06";
  const pane = document.getElementById("settings-pane");
  pane.appendChild(note);
  setTimeout(() => note.remove(), 1800);
}



// ---------- Tab 2: API Keys ----------
/**
 * Store shape:
 * samplerSettingsStore["api-keys"] = {
 *   "OPENAI": "sk-...",
 *   "TOGETHER": "tkn-..."
 * }
 */
function getApiKeysObject() {
  if (!samplerSettingsStore["api-keys"]) {
    samplerSettingsStore["api-keys"] = {};
  }
  return samplerSettingsStore["api-keys"];
}

function persistStore() {
  return ipcRenderer
    .invoke("save-settings", samplerSettingsStore)
    .catch((err) => console.error("Settings save Error:", err));
}

function renderApiKeysTab() {
  menuHost.innerHTML = "";

  // Add Key form
  const addForm = document.createElement("div");
  addForm.className = "row";
  addForm.innerHTML = `
    <label for="key-label">Key Name</label>
    <input type="text" id="key-label" class="modelNameType" placeholder="e.g. OPENAI" />
    <label for="key-value" style="margin-left:12px;">Secret</label>
    <input type="password" id="key-value" placeholder="paste your API key" />
    <button class="btn primary" id="add-key-btn">Add</button>
  `;
  menuHost.appendChild(addForm);

  const warn = document.createElement("div");
  warn.className = "muted";
  warn.style.marginTop = "6px";
  warn.textContent = "Names allow A–Z, a–z, 0–9, dash, underscore, and dot.";
  menuHost.appendChild(warn);

  const divider = document.createElement("div");
  divider.className = "divider";
  menuHost.appendChild(divider);

  // Keys table
  const table = document.createElement("table");
  table.className = "keys mono";
  table.innerHTML = `
    <thead>
      <tr>
        <th style="width:22%;">Name</th>
        <th>Secret</th>
        <th style="width:150px;">Actions</th>
      </tr>
    </thead>
    <tbody id="keys-tbody"></tbody>
  `;
  menuHost.appendChild(table);

  // Render rows
  function refreshKeysTable() {
    const tbody = table.querySelector("#keys-tbody");
    tbody.innerHTML = "";
    const obj = getApiKeysObject();
    const entries = Object.entries(obj);
    if (entries.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 3;
      td.className = "muted";
      td.textContent = "No API keys saved.";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    for (const [name, secret] of entries) {
      const tr = document.createElement("tr");
      const tdName = document.createElement("td");
      tdName.textContent = name;

      const tdSecret = document.createElement("td");
      const mask = document.createElement("span");
      mask.textContent = "•".repeat(Math.min(secret?.length || 0, 12)) || "—";
      mask.dataset.revealed = "0";
      tdSecret.appendChild(mask);

      const tdActions = document.createElement("td");
      const showBtn = document.createElement("button");
      showBtn.className = "btn";
      showBtn.textContent = "Show";
      showBtn.addEventListener("click", () => {
        const revealed = mask.dataset.revealed === "1";
        mask.textContent = revealed ? "•".repeat(Math.min(secret?.length || 0, 12)) : (secret || "");
        mask.dataset.revealed = revealed ? "0" : "1";
        showBtn.textContent = revealed ? "Show" : "Hide";
      });

      const delBtn = document.createElement("button");
      delBtn.className = "btn";
      delBtn.style.marginLeft = "6px";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", async () => {
        const obj = getApiKeysObject();
        delete obj[name];
        await persistStore();
        refreshKeysTable();
      });

      tdActions.appendChild(showBtn);
      tdActions.appendChild(delBtn);

      tr.appendChild(tdName);
      tr.appendChild(tdSecret);
      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    }
  }

  // Add key handler
  addForm.querySelector("#add-key-btn").addEventListener("click", async () => {
    const nameEl = addForm.querySelector("#key-label");
    const valEl = addForm.querySelector("#key-value");
    const name = nameEl.value.trim();
    const value = valEl.value;

    // Reuse your validator
    if (!validateFieldStringType(name, "modelNameType")) {
      alert("Invalid key name. Use letters, digits, '-', '_', or '.'.");
      return;
    }
    if (!value) {
      alert("Secret cannot be empty.");
      return;
    }

    const obj = getApiKeysObject();
    obj[name] = value;
    await persistStore();
    nameEl.value = "";
    valEl.value = "";
    refreshKeysTable();
  });

  refreshKeysTable();
}

function setActiveTab(tabName) {
  activeTab = tabName;
  for (const b of document.querySelectorAll("#settings-tabs .tab-btn")) {
    b.classList.toggle("active", b.dataset.tab === activeTab);
  }
  if (activeTab === "sampler-settings") {
    renderSamplerSettingsTab();
  } else {
    renderApiKeysTab();
  }
}

const tabs = document.getElementById("settings-tabs");
tabs.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  setActiveTab(btn.dataset.tab);
});

renderSamplerSettingsTab();
loadSettings().then(() => {
  if ("sampler-settings" in samplerSettingsStore &&
      "Default" in samplerSettingsStore["sampler-settings"]) {
    loadSamplerMenuDict(samplerSettingsStore["sampler-settings"]["Default"]);
  }
});