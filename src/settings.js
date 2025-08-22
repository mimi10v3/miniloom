// No require statements needed - using window.electronAPI from preload script

const servicesTab = document.getElementById("services-tab");
const samplersTab = document.getElementById("samplers-tab");
const apiKeysTab = document.getElementById("api-keys-tab");

const servicesForm = document.getElementById("services-form");
const samplersForm = document.getElementById("samplers-form");
const serviceSelect = document.getElementById("service-select");
const samplerSelect = document.getElementById("sampler-select");

const SERVICE_DEFAULTS = {
  base: {
    "sampling-method": "base",
    "service-api-url": "http://localhost:5000/",
    "service-model-name": "togethercomputer/llama-2-70b",
    "service-api-delay": "3000",
  },
  together: {
    "sampling-method": "together",
    "service-api-url": "https://api.together.xyz/inference",
    "service-model-name": "togethercomputer/llama-2-70b",
    "service-api-delay": "3000",
  },
  openrouter: {
    "sampling-method": "openrouter",
    "service-api-url": "https://openrouter.ai/api/v1/completions",
    "service-model-name": "deepseek/deepseek-v3-base:free",
    "service-api-delay": "3000",
  },
  openai: {
    "sampling-method": "openai",
    "service-api-url": "https://api.openai.com/",
    "service-model-name": "code-davinci-002",
    "service-api-delay": "3000",
  },
  "openai-chat": {
    "sampling-method": "openai-chat",
    "service-api-url": "https://api.openai.com/v1/chat/completions",
    "service-model-name": "gpt-5",
    "service-api-delay": "3000",
  },
};

const DEFAULT_SAMPLER = {
  "output-branches": "2",
  "tokens-per-branch": "256",
  temperature: "0.9",
  "top-p": "1",
  "top-k": "100",
  "repetition-penalty": "1",
};

let samplerSettingsStore = {};
let currentEditingService = null;
let currentEditingSampler = null;
let originalServiceData = null;
let originalSamplerData = null;

function applyServiceDefaults(serviceType) {
  const defaults = SERVICE_DEFAULTS[serviceType] || SERVICE_DEFAULTS.base;
  return defaults;
}

function getDefaultSampler() {
  return { ...DEFAULT_SAMPLER };
}

async function loadSettings() {
  try {
    const data = await window.electronAPI.loadSettings();
    if (data != null) {
      samplerSettingsStore = data;
    }
  } catch (err) {
    console.error("Load Settings Error:", err);
  }
}

async function persistStore() {
  try {
    await window.electronAPI.saveSettings(samplerSettingsStore);
  } catch (err) {
    console.error("Settings save Error:", err);
  }
}

function getServicesObject() {
  if (!samplerSettingsStore["services"]) {
    samplerSettingsStore["services"] = {};
  }
  return samplerSettingsStore["services"];
}

function populateServiceSelect() {
  const services = getServicesObject();
  const entries = Object.keys(services);

  serviceSelect.innerHTML = '<option value="">-- Select a service --</option>';
  entries.forEach(name => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    serviceSelect.appendChild(option);
  });
}

function showServiceForm(show = true) {
  servicesForm.style.display = show ? "block" : "none";
}

function populateServiceForm(serviceName = null, serviceData = null) {
  if (serviceName && serviceData) {
    // Editing existing service
    currentEditingService = serviceName;
    document.getElementById("service-name").value = serviceName;
    document.getElementById("sampling-method").value =
      serviceData["sampling-method"] || "base";
    document.getElementById("service-api-url").value =
      serviceData["service-api-url"] || "";
    document.getElementById("service-model-name").value =
      serviceData["service-model-name"] || "";
    document.getElementById("service-api-delay").value =
      serviceData["service-api-delay"] || "";
    document.getElementById("delete-service-btn").style.display =
      "inline-block";
    originalServiceData = { ...serviceData }; // Store original data
  } else {
    // Adding new service
    currentEditingService = null;
    document.getElementById("service-name").value = "";
    document.getElementById("sampling-method").value = "base";
    document.getElementById("service-api-url").value = "";
    document.getElementById("service-model-name").value = "";
    document.getElementById("service-api-delay").value = "";
    document.getElementById("delete-service-btn").style.display = "none";
    originalServiceData = null; // Clear original data for new service
  }
}

function applyServiceDefaultsToForm(serviceType) {
  const defaults = applyServiceDefaults(serviceType);
  document.getElementById("service-api-url").value =
    defaults["service-api-url"];
  document.getElementById("service-model-name").value =
    defaults["service-model-name"];
  document.getElementById("service-api-delay").value =
    defaults["service-api-delay"];
}

function saveService() {
  const name = document.getElementById("service-name").value.trim();
  const method = document.getElementById("sampling-method").value;
  const url = document.getElementById("service-api-url").value.trim();
  const model = document.getElementById("service-model-name").value.trim();
  const delay = document.getElementById("service-api-delay").value.trim();

  if (!validateFieldStringType(name, "modelNameType")) {
    alert("Invalid service name. Use letters, digits, '-', '_', or '.'.");
    return;
  }

  if (!validateFieldStringType(url, "URLType")) {
    alert("Invalid API URL.");
    return;
  }

  const services = getServicesObject();

  // Check for duplicate names (unless editing the same service)
  if (services[name] && name !== currentEditingService) {
    alert("A service with this name already exists.");
    return;
  }

  const serviceData = {
    "sampling-method": method,
    "service-api-url": url,
    "service-model-name": model,
    "service-api-delay": delay,
  };

  services[name] = serviceData;

  // If we were editing and the name changed, delete the old one
  if (currentEditingService && currentEditingService !== name) {
    delete services[currentEditingService];
  }

  persistStore();
  populateServiceSelect();
  serviceSelect.value = name; // Select the saved item
  populateServiceForm(name, serviceData); // Repopulate form with saved data
  flashSaved(currentEditingService ? "Service updated." : "Service created.");
}

function deleteService() {
  if (!currentEditingService) return;

  if (
    confirm(
      `Are you sure you want to delete the service "${currentEditingService}"?`
    )
  ) {
    const services = getServicesObject();
    delete services[currentEditingService];
    persistStore();
    populateServiceSelect();
    showServiceForm(false);
    flashSaved("Service deleted.");
  }
}

function cancelService() {
  // Check if there are any changes by comparing current form values with original
  if (originalServiceData && currentEditingService) {
    const currentName = document.getElementById("service-name").value.trim();
    const currentMethod = document.getElementById("sampling-method").value;
    const currentUrl = document.getElementById("service-api-url").value.trim();
    const currentModel = document
      .getElementById("service-model-name")
      .value.trim();
    const currentDelay = document
      .getElementById("service-api-delay")
      .value.trim();

    const hasChanges =
      currentName !== currentEditingService ||
      currentMethod !== originalServiceData["sampling-method"] ||
      currentUrl !== originalServiceData["service-api-url"] ||
      currentModel !== originalServiceData["service-model-name"] ||
      currentDelay !== originalServiceData["service-api-delay"];

    if (hasChanges) {
      // Revert to original values
      populateServiceForm(currentEditingService, originalServiceData);
      flashSaved("Changes reverted.");
    } else {
      // No changes, just hide the form
      showServiceForm(false);
    }
  } else {
    // New service or no original data, just hide the form
    showServiceForm(false);
  }

  currentEditingService = null;
  originalServiceData = null;
}

function getSamplersObject() {
  if (!samplerSettingsStore["samplers"]) {
    samplerSettingsStore["samplers"] = {};
  }
  return samplerSettingsStore["samplers"];
}

function populateSamplerSelect() {
  const samplers = getSamplersObject();
  const entries = Object.keys(samplers);

  samplerSelect.innerHTML = '<option value="">-- Select a sampler --</option>';
  entries.forEach(name => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    samplerSelect.appendChild(option);
  });
}

function showSamplerForm(show = true) {
  samplersForm.style.display = show ? "block" : "none";
}

function populateSamplerForm(samplerName = null, samplerData = null) {
  if (samplerName && samplerData) {
    // Editing existing sampler
    currentEditingSampler = samplerName;
    document.getElementById("sampler-name").value = samplerName;
    document.getElementById("output-branches").value =
      samplerData["output-branches"] || "";
    document.getElementById("tokens-per-branch").value =
      samplerData["tokens-per-branch"] || "";
    document.getElementById("temperature").value =
      samplerData["temperature"] || "";
    document.getElementById("top-p").value = samplerData["top-p"] || "";
    document.getElementById("top-k").value = samplerData["top-k"] || "";
    document.getElementById("repetition-penalty").value =
      samplerData["repetition-penalty"] || "";
    document.getElementById("delete-sampler-btn").style.display =
      "inline-block";
    originalSamplerData = { ...samplerData }; // Store original data
  } else {
    // Adding new sampler
    currentEditingSampler = null;
    const defaults = getDefaultSampler();
    document.getElementById("sampler-name").value = "";
    document.getElementById("output-branches").value =
      defaults["output-branches"];
    document.getElementById("tokens-per-branch").value =
      defaults["tokens-per-branch"];
    document.getElementById("temperature").value = defaults["temperature"];
    document.getElementById("top-p").value = defaults["top-p"];
    document.getElementById("top-k").value = defaults["top-k"];
    document.getElementById("repetition-penalty").value =
      defaults["repetition-penalty"];
    document.getElementById("delete-sampler-btn").style.display = "none";
    originalSamplerData = null; // Clear original data for new sampler
  }
}

function saveSampler() {
  const name = document.getElementById("sampler-name").value.trim();
  const branches = document.getElementById("output-branches").value.trim();
  const tokens = document.getElementById("tokens-per-branch").value.trim();
  const temp = document.getElementById("temperature").value.trim();
  const topP = document.getElementById("top-p").value.trim();
  const topK = document.getElementById("top-k").value.trim();
  const penalty = document.getElementById("repetition-penalty").value.trim();

  if (!validateFieldStringType(name, "modelNameType")) {
    alert("Invalid sampler name. Use letters, digits, '-', '_', or '.'.");
    return;
  }

  if (
    !validateFieldStringType(branches, "intType") ||
    !validateFieldStringType(tokens, "intType") ||
    !validateFieldStringType(temp, "floatType") ||
    !validateFieldStringType(topP, "floatType") ||
    !validateFieldStringType(topK, "intType") ||
    !validateFieldStringType(penalty, "floatType")
  ) {
    alert("Please check your input values. Some fields have invalid formats.");
    return;
  }

  const samplers = getSamplersObject();

  // Check for duplicate names (unless editing the same sampler)
  if (samplers[name] && name !== currentEditingSampler) {
    alert("A sampler with this name already exists.");
    return;
  }

  const samplerData = {
    "output-branches": branches,
    "tokens-per-branch": tokens,
    temperature: temp,
    "top-p": topP,
    "top-k": topK,
    "repetition-penalty": penalty,
  };

  samplers[name] = samplerData;

  // If we were editing and the name changed, delete the old one
  if (currentEditingSampler && currentEditingSampler !== name) {
    delete samplers[currentEditingSampler];
  }

  persistStore();
  populateSamplerSelect();
  samplerSelect.value = name; // Select the saved item
  populateSamplerForm(name, samplerData); // Repopulate form with saved data
  flashSaved(currentEditingSampler ? "Sampler updated." : "Sampler created.");
}

function deleteSampler() {
  if (!currentEditingSampler) return;

  if (
    confirm(
      `Are you sure you want to delete the sampler "${currentEditingSampler}"?`
    )
  ) {
    const samplers = getSamplersObject();
    delete samplers[currentEditingSampler];
    persistStore();
    populateSamplerSelect();
    showSamplerForm(false);
    flashSaved("Sampler deleted.");
  }
}

function cancelSampler() {
  // Check if there are any changes by comparing current form values with original
  if (originalSamplerData && currentEditingSampler) {
    const currentName = document.getElementById("sampler-name").value.trim();
    const currentBranches = document
      .getElementById("output-branches")
      .value.trim();
    const currentTokens = document
      .getElementById("tokens-per-branch")
      .value.trim();
    const currentTemp = document.getElementById("temperature").value.trim();
    const currentTopP = document.getElementById("top-p").value.trim();
    const currentTopK = document.getElementById("top-k").value.trim();
    const currentPenalty = document
      .getElementById("repetition-penalty")
      .value.trim();

    const hasChanges =
      currentName !== currentEditingSampler ||
      currentBranches !== originalSamplerData["output-branches"] ||
      currentTokens !== originalSamplerData["tokens-per-branch"] ||
      currentTemp !== originalSamplerData["temperature"] ||
      currentTopP !== originalSamplerData["top-p"] ||
      currentTopK !== originalSamplerData["top-k"] ||
      currentPenalty !== originalSamplerData["repetition-penalty"];

    if (hasChanges) {
      // Revert to original values
      populateSamplerForm(currentEditingSampler, originalSamplerData);
      flashSaved("Changes reverted.");
    } else {
      // No changes, just hide the form
      showSamplerForm(false);
    }
  } else {
    // New sampler or no original data, just hide the form
    showSamplerForm(false);
  }

  currentEditingSampler = null;
  originalSamplerData = null;
}

function getApiKeysObject() {
  if (!samplerSettingsStore["api-keys"]) {
    samplerSettingsStore["api-keys"] = {};
  }
  return samplerSettingsStore["api-keys"];
}

function renderApiKeysList() {
  const tbody = document.getElementById("keys-tbody");
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
      mask.textContent = revealed
        ? "•".repeat(Math.min(secret?.length || 0, 12))
        : secret || "";
      mask.dataset.revealed = revealed ? "0" : "1";
      showBtn.textContent = revealed ? "Show" : "Hide";
    });

    const delBtn = document.createElement("button");
    delBtn.className = "btn";
    delBtn.style.marginLeft = "6px";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async () => {
      if (confirm(`Are you sure you want to delete the API key "${name}"?`)) {
        const obj = getApiKeysObject();
        delete obj[name];
        await persistStore();
        renderApiKeysList();
        flashSaved("API key deleted.");
      }
    });

    tdActions.appendChild(showBtn);
    tdActions.appendChild(delBtn);

    tr.appendChild(tdName);
    tr.appendChild(tdSecret);
    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  }
}

function showTab(tabElement) {
  servicesTab.classList.remove("visible-tab");
  samplersTab.classList.remove("visible-tab");
  apiKeysTab.classList.remove("visible-tab");
  tabElement.classList.add("visible-tab");
}

function setActiveTab(tabName) {
  activeTab = tabName;

  // Update tab button states
  for (const b of document.querySelectorAll("#settings-tabs .tab-btn")) {
    b.classList.toggle("active", b.dataset.tab === activeTab);
  }

  // Show the appropriate tab and render its content
  if (activeTab === "services") {
    showTab(servicesTab);
    populateServiceSelect();
  } else if (activeTab === "samplers") {
    showTab(samplersTab);
    populateSamplerSelect();
  } else {
    showTab(apiKeysTab);
    renderApiKeysList();
  }
}

// Event listeners
document.addEventListener("DOMContentLoaded", function () {
  const addServiceBtn = document.getElementById("add-service-btn");
  if (addServiceBtn) {
    addServiceBtn.addEventListener("click", () => {
      serviceSelect.value = ""; // Clear selection
      showServiceForm(true);
      populateServiceForm();
    });
  }

  const saveServiceBtn = document.getElementById("save-service-btn");
  if (saveServiceBtn) {
    saveServiceBtn.addEventListener("click", saveService);
  }

  const cancelServiceBtn = document.getElementById("cancel-service-btn");
  if (cancelServiceBtn) {
    cancelServiceBtn.addEventListener("click", cancelService);
  }

  const deleteServiceBtn = document.getElementById("delete-service-btn");
  if (deleteServiceBtn) {
    deleteServiceBtn.addEventListener("click", deleteService);
  }

  // Service select change
  if (serviceSelect) {
    serviceSelect.addEventListener("change", () => {
      const selected = serviceSelect.value;
      if (selected) {
        const services = getServicesObject();
        const serviceData = services[selected];
        populateServiceForm(selected, serviceData);
        showServiceForm(true);
      } else {
        showServiceForm(false);
      }
    });
  }

  // Sampling method change
  const samplingMethod = document.getElementById("sampling-method");
  if (samplingMethod) {
    samplingMethod.addEventListener("change", () => {
      applyServiceDefaultsToForm(samplingMethod.value);
    });
  }

  // Samplers
  const addSamplerBtn = document.getElementById("add-sampler-btn");
  if (addSamplerBtn) {
    addSamplerBtn.addEventListener("click", () => {
      samplerSelect.value = ""; // Clear selection
      showSamplerForm(true);
      populateSamplerForm();
    });
  }

  const saveSamplerBtn = document.getElementById("save-sampler-btn");
  if (saveSamplerBtn) {
    saveSamplerBtn.addEventListener("click", saveSampler);
  }

  const cancelSamplerBtn = document.getElementById("cancel-sampler-btn");
  if (cancelSamplerBtn) {
    cancelSamplerBtn.addEventListener("click", cancelSampler);
  }

  const deleteSamplerBtn = document.getElementById("delete-sampler-btn");
  if (deleteSamplerBtn) {
    deleteSamplerBtn.addEventListener("click", deleteSampler);
  }

  // Sampler select change
  if (samplerSelect) {
    samplerSelect.addEventListener("change", () => {
      const selected = samplerSelect.value;
      if (selected) {
        const samplers = getSamplersObject();
        const samplerData = samplers[selected];
        populateSamplerForm(selected, samplerData);
        showSamplerForm(true);
      } else {
        showSamplerForm(false);
      }
    });
  }

  // API Keys
  const addKeyBtn = document.getElementById("add-key-btn");
  if (addKeyBtn) {
    addKeyBtn.addEventListener("click", async () => {
      const nameEl = document.getElementById("key-label");
      const valEl = document.getElementById("key-value");
      const name = nameEl.value.trim();
      const value = valEl.value;

      if (!validateFieldStringType(name, "modelNameType")) {
        alert("Invalid key name. Use letters, digits, '-', '_', or '.'.");
        return;
      }
      if (!value) {
        alert("Secret cannot be empty.");
        return;
      }

      const obj = getApiKeysObject();
      if (obj[name]) {
        alert("An API key with this name already exists.");
        return;
      }

      obj[name] = value;
      await persistStore();
      nameEl.value = "";
      valEl.value = "";
      renderApiKeysList();
      flashSaved("API key added.");
    });
  }

  // Tab switching
  const tabs = document.getElementById("settings-tabs");
  if (tabs) {
    tabs.addEventListener("click", e => {
      const btn = e.target.closest(".tab-btn");
      if (!btn) return;
      setActiveTab(btn.dataset.tab);
    });
  }

  // Initialize
  loadSettings().then(() => {
    setActiveTab("services"); // Set initial active tab with loaded data
  });

  // Close button handler
  const closeBtn = document.getElementById("close-settings");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      window.electronAPI.closeSettingsWindow();
    });
  }
});
