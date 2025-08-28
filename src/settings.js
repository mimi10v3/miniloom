// Settings UI Management
// Handles all DOM manipulation for settings selectors and favorites

function populateServiceSelector() {
  const serviceSelector = document.getElementById("service-selector");
  if (!serviceSelector) {
    console.warn("Service selector not found!");
    return;
  }

  const currentSelection = serviceSelector.value;
  serviceSelector.innerHTML =
    '<option value="">-- Select a service --</option>';

  if (appState.samplerSettingsStore && appState.samplerSettingsStore.services) {
    const services = Object.keys(appState.samplerSettingsStore.services);
    services.forEach(serviceName => {
      const option = document.createElement("option");
      option.value = serviceName;
      option.textContent = serviceName;
      serviceSelector.appendChild(option);
    });
  }

  if (
    currentSelection &&
    appState.samplerSettingsStore &&
    appState.samplerSettingsStore.services &&
    appState.samplerSettingsStore.services[currentSelection]
  ) {
    serviceSelector.value = currentSelection;
  }
}

function populateSamplerSelector() {
  const samplerSelector = document.getElementById("sampler-selector");
  if (!samplerSelector) {
    console.warn("Sampler selector not found!");
    return;
  }

  const currentSelection = samplerSelector.value;
  samplerSelector.innerHTML = "";

  if (appState.samplerSettingsStore && appState.samplerSettingsStore.samplers) {
    const samplers = Object.keys(appState.samplerSettingsStore.samplers);
    samplers.forEach(samplerName => {
      const option = document.createElement("option");
      option.value = samplerName;
      option.textContent = samplerName;
      samplerSelector.appendChild(option);
    });
  }

  if (
    currentSelection &&
    appState.samplerSettingsStore &&
    appState.samplerSettingsStore.samplers &&
    appState.samplerSettingsStore.samplers[currentSelection]
  ) {
    samplerSelector.value = currentSelection;
  } else if (
    appState.samplerSettingsStore &&
    appState.samplerSettingsStore.samplers &&
    appState.samplerSettingsStore.samplers["Default"]
  ) {
    samplerSelector.value = "Default";
  }
}

function populateApiKeySelector() {
  const apiKeySelector = document.getElementById("api-key-selector");
  if (!apiKeySelector) {
    console.warn("API key selector not found!");
    return;
  }

  const currentSelection = apiKeySelector.value;
  apiKeySelector.innerHTML = '<option value="">None</option>';

  if (
    appState.samplerSettingsStore &&
    appState.samplerSettingsStore["api-keys"]
  ) {
    const apiKeys = Object.keys(appState.samplerSettingsStore["api-keys"]);
    apiKeys.forEach(apiKeyName => {
      const option = document.createElement("option");
      option.value = apiKeyName;
      option.textContent = apiKeyName;
      apiKeySelector.appendChild(option);
    });
  }

  if (
    currentSelection &&
    appState.samplerSettingsStore &&
    appState.samplerSettingsStore["api-keys"] &&
    appState.samplerSettingsStore["api-keys"][currentSelection]
  ) {
    apiKeySelector.value = currentSelection;
  }
}

function renderFavoritesButtons() {
  const favoritesContainer = document.getElementById("favorites-container");
  if (!favoritesContainer) {
    console.warn("Favorites container not found!");
    return;
  }

  favoritesContainer.innerHTML = "";

  const favorites = appState.samplerSettingsStore?.favorites || [];
  const services = appState.samplerSettingsStore?.services || {};
  const apiKeys = appState.samplerSettingsStore?.["api-keys"] || {};
  const samplers = appState.samplerSettingsStore?.samplers || {};

  // Create two rows of 4 buttons each
  for (let row = 0; row < 2; row++) {
    const favoritesRow = document.createElement("div");
    favoritesRow.className = "favorites-row";

    for (let col = 0; col < 4; col++) {
      const index = row * 4 + col;
      const favorite = favorites[index] || {
        name: "",
        service: "",
        key: "",
        sampler: "",
      };

      const favoriteBtn = document.createElement("button");
      favoriteBtn.className = "favorite-btn";
      favoriteBtn.textContent = favorite.name || `${index + 1}`;

      // Check if this favorite has all required fields
      const hasService = favorite.service && services[favorite.service];
      const hasSampler = favorite.sampler && samplers[favorite.sampler];
      const isComplete = hasService && hasSampler; // Key is optional

      if (!isComplete || !favorite.name) {
        favoriteBtn.classList.add("empty");
      } else {
        favoriteBtn.addEventListener("click", () => applyFavorite(index));
      }

      favoritesRow.appendChild(favoriteBtn);
    }

    favoritesContainer.appendChild(favoritesRow);
  }
}

function applyFavorite(index) {
  const favorites = appState.samplerSettingsStore?.favorites || [];
  const favorite = favorites[index];

  if (!favorite || !favorite.name) {
    return;
  }

  // Update the selectors
  const serviceSelector = document.getElementById("service-selector");
  const apiKeySelector = document.getElementById("api-key-selector");
  const samplerSelector = document.getElementById("sampler-selector");

  if (serviceSelector && favorite.service) {
    serviceSelector.value = favorite.service;
  }
  if (apiKeySelector) {
    apiKeySelector.value = favorite.key || ""; // Handle "None" (empty string) case
  }
  if (samplerSelector && favorite.sampler) {
    samplerSelector.value = favorite.sampler;
  }

  saveCurrentSettings();

  if (llmService && appState.focusedNode) {
    llmService.generateNewResponses(appState.focusedNode.id);
  }
}

function saveCurrentSettings() {
  const serviceSelector = document.getElementById("service-selector");
  const apiKeySelector = document.getElementById("api-key-selector");
  const samplerSelector = document.getElementById("sampler-selector");

  if (!appState.samplerSettingsStore.lastUsed) {
    appState.samplerSettingsStore.lastUsed = {};
  }

  if (serviceSelector && serviceSelector.value) {
    appState.samplerSettingsStore.lastUsed.service = serviceSelector.value;
  }
  if (apiKeySelector) {
    appState.samplerSettingsStore.lastUsed.apiKey = apiKeySelector.value || ""; // Save "None" as empty string
  }
  if (samplerSelector && samplerSelector.value) {
    appState.samplerSettingsStore.lastUsed.sampler = samplerSelector.value;
  }

  window.electronAPI
    .saveSettings(appState.samplerSettingsStore)
    .catch(error => {
      console.error("Failed to save last used settings:", error);
    });
}

function addSettingsChangeListeners() {
  const serviceSelector = document.getElementById("service-selector");
  const apiKeySelector = document.getElementById("api-key-selector");
  const samplerSelector = document.getElementById("sampler-selector");

  if (serviceSelector) {
    serviceSelector.addEventListener("change", saveCurrentSettings);
  }
  if (apiKeySelector) {
    apiKeySelector.addEventListener("change", saveCurrentSettings);
  }
  if (samplerSelector) {
    samplerSelector.addEventListener("change", saveCurrentSettings);
  }
}

function restoreLastUsedSettings() {
  if (!appState.samplerSettingsStore.lastUsed) {
    return;
  }

  const lastUsed = appState.samplerSettingsStore.lastUsed;
  if (
    lastUsed.service &&
    appState.samplerSettingsStore.services[lastUsed.service]
  ) {
    const serviceSelector = document.getElementById("service-selector");
    if (serviceSelector) {
      serviceSelector.value = lastUsed.service;
    }
  }

  if (lastUsed.apiKey !== undefined) {
    const apiKeySelector = document.getElementById("api-key-selector");
    if (apiKeySelector) {
      // Handle "None" (empty string) case or valid API key
      if (
        lastUsed.apiKey === "" ||
        (lastUsed.apiKey &&
          appState.samplerSettingsStore["api-keys"][lastUsed.apiKey])
      ) {
        apiKeySelector.value = lastUsed.apiKey;
      }
    }
  }

  const samplerSelector = document.getElementById("sampler-selector");
  if (samplerSelector) {
    if (
      lastUsed.sampler &&
      appState.samplerSettingsStore.samplers[lastUsed.sampler]
    ) {
      samplerSelector.value = lastUsed.sampler;
    } else if (appState.samplerSettingsStore.samplers["Default"]) {
      samplerSelector.value = "Default";
    }
  }
}

function checkForNewUser() {
  const hasServices =
    appState.samplerSettingsStore &&
    appState.samplerSettingsStore.services &&
    Object.keys(appState.samplerSettingsStore.services).length > 0;

  if (!hasServices) {
    // Auto-create default services if none exist
    if (!appState.samplerSettingsStore.services) {
      appState.samplerSettingsStore.services = {};
    }

    // Auto-create default sampler if none exist
    if (
      !appState.samplerSettingsStore.samplers ||
      Object.keys(appState.samplerSettingsStore.samplers).length === 0
    ) {
      if (!appState.samplerSettingsStore.samplers) {
        appState.samplerSettingsStore.samplers = {};
      }

      appState.samplerSettingsStore.samplers["Default"] = {
        "output-branches": "2",
        "tokens-per-branch": "256",
        temperature: "0.9",
        "top-p": "1",
        "top-k": "100",
        "repetition-penalty": "1",
      };
    }

    try {
      window.electronAPI.saveSettings(appState.samplerSettingsStore);
      populateServiceSelector();
      populateSamplerSelector();
    } catch (error) {
      console.error("Failed to save default settings:", error);
    }

    // Auto-open settings for new user
    setTimeout(() => {
      window.electronAPI.openSettings();
    }, 500);
  } else {
    restoreLastUsedSettings();
  }
}
