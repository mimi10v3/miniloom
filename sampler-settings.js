// TODO: Use a preload
const { ipcRenderer } = require("electron");
const samplerOptionMenu = document.getElementById("sampler-option-menu");
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
  //TODO: Remove temporary autosave
  ipcRenderer
    .invoke("save-settings", samplerSettingsStore)
    .catch((err) => console.error("Settings save Error:", err));
}

samplerOptionMenu.addEventListener("change", internalSaveSamplerSettings);
sampler.addEventListener("focus", internalSaveSamplerSettings);

sampler.addEventListener("change", function () {
  let selectedSampler = this.value;
  if (selectedSampler === "base") {
    baseSamplerMenu();
  } else if (selectedSampler === "together") {
    togetherSamplerMenu();
  } else if (selectedSampler === "openrouter") {
    openrouterSamplerMenu();
  } else if (selectedSampler === "openai") {
    openaiCompletionsSamplerMenu();
  } else if (selectedSampler === "openai-chat") {
    openaiChatCompletionsSamplerMenu();
    // Initialize with default chat JSON if editor is empty or not valid JSON
    if (!editor.value.trim() || !isValidChatJson(editor.value)) {
      editor.value = createDefaultChatJson();
      updateCounterDisplay(editor.value);
    }
  }
  if ("sampler-settings" in samplerSettingsStore &&
      "Default" in samplerSettingsStore["sampler-settings"]) {
      loadSamplerMenuDict(samplerSettingsStore["sampler-settings"]["Default"]);
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

openaiCompletionsSamplerMenu();
loadSettings().then(() => {
  if ("sampler-settings" in samplerSettingsStore &&
      "Default" in samplerSettingsStore["sampler-settings"]) {
    loadSamplerMenuDict(samplerSettingsStore["sampler-settings"]["Default"]);
  }
});