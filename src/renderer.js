const dmp = {
  patch_make: window.electronAPI.patch_make,
  patch_apply: window.electronAPI.patch_apply,
};

const editor = document.getElementById("editor");
const promptTokenCounter = document.getElementById("prompt-token-counter");
const errorMessage = document.getElementById("error-message");
const focusedNodeTitle = document.getElementById("focused-node-title");
const batchIndexMarker = document.getElementById("batch-item-index");
const generateButton = document.getElementById("generate-button");
const thumbUp = document.getElementById("thumb-up");
const thumbDown = document.getElementById("thumb-down");

/**
 * Node class - represents an immutable node in the tree
 * Nodes are created from files, human input, or LLM generation
 * Once created, they are immutable except for rating changes
 */
class Node {
  constructor(id, type, parent, patch, summary) {
    this.id = id;
    this.timestamp = Date.now();
    this.type = type; // "root", "user", "gen", "rewrite"
    this.patch = patch;
    this.summary = summary;
    this.rating = null; // true = thumbs up, false = thumbs down, null = no rating
    this.read = false;
    this.parent = parent;
    this.children = [];
  }
}

class LoomTree {
  constructor() {
    this.root = new Node("1", "root", null, "", "Root Node");
    this.nodeStore = { 1: this.root };
  }

  createNode(type, parent, text, summary) {
    const parentRenderedText = this.renderNode(parent);
    const patch = dmp.patch_make(parentRenderedText, text);
    const newNodeId = String(Object.keys(this.nodeStore).length + 1);
    const newNode = new Node(newNodeId, type, parent.id, patch, summary);

    if (newNode.type === "user") {
      newNode.read = true;
    }

    parent.children.push(newNodeId);
    this.nodeStore[newNodeId] = newNode;

    if (window.searchManager) {
      window.searchManager.addNode(newNode);
    }

    return newNode;
  }

  updateNode(node, text, summary) {
    if (node.type === "gen" || node.children.length > 0) {
      return; // Can't update generated nodes or nodes with children
    }

    const parent = this.nodeStore[node.parent];
    const parentRenderedText = this.renderNode(parent);
    const patch = dmp.patch_make(parentRenderedText, text);

    node.timestamp = Date.now();
    node.patch = patch;
    node.summary = summary;

    if (window.searchManager) {
      window.searchManager.updateNode(node);
    }
  }

  /**
   * Render the full text of a node by applying all patches from root
   */
  renderNode(node) {
    if (!node || node === this.root) {
      return "";
    }

    const patches = [];
    patches.push(node.patch);

    let currentNode = node;
    while (currentNode.parent !== null) {
      currentNode = this.nodeStore[currentNode.parent];
      if (!currentNode) {
        console.warn("Parent node not found in nodeStore:", node.parent);
        break;
      }
      patches.push(currentNode.patch);
    }

    patches.reverse();
    let outText = "";
    for (let patch of patches) {
      if (patch === "") continue;
      const [newText, results] = dmp.patch_apply(patch, outText);
      outText = newText;
    }
    return outText;
  }

  /**
   * Update a node's rating (thumbs up/down)
   */
  updateNodeRating(nodeId, rating) {
    const node = this.nodeStore[nodeId];
    if (node) {
      node.rating = rating;
      if (window.searchManager) {
        window.searchManager.updateNode(node);
      }
    }
  }

  // Serialization methods
  serialize(node = this.root) {
    return JSON.stringify(this._serializeHelper(node), null, 2);
  }

  _serializeHelper(node) {
    if (!node) {
      console.error("Attempting to serialize undefined node");
      return null;
    }

    const serializedChildren = node.children
      .map(child => {
        const childNode = this.nodeStore[child];
        if (!childNode) {
          console.error("Child node not found in nodeStore:", child);
          return null;
        }
        return this._serializeHelper(childNode);
      })
      .filter(child => child !== null);

    return {
      id: node.id,
      timestamp: node.timestamp,
      type: node.type,
      patch: node.patch,
      summary: node.summary,
      rating: node.rating,
      read: node.read,
      parent: node.parent,
      children: serializedChildren,
    };
  }

  loadFromData(loomTreeData) {
    this.nodeStore = {};

    Object.keys(loomTreeData.nodeStore).forEach(nodeId => {
      const nodeData = loomTreeData.nodeStore[nodeId];
      const node = new Node(
        nodeData.id,
        nodeData.type,
        nodeData.parent,
        nodeData.patch,
        nodeData.summary
      );

      node.timestamp = nodeData.timestamp;
      node.rating = nodeData.rating;
      node.read = nodeData.read;
      node.children = nodeData.children || [];

      this.nodeStore[nodeId] = node;
    });

    this.root = this.nodeStore["1"];
  }
}

// Global state management
class AppState {
  constructor() {
    this.loomTree = new LoomTree();
    this.focusedNode = this.loomTree.root;
    this.samplerSettingsStore = {};
    this.updatingNode = false;
    this.secondsSinceLastSave = 0;
  }

  // Core methods that modules actually use
  setFocusedNode(nodeId) {
    const node = this.loomTree.nodeStore[nodeId];
    if (!node) {
      console.warn("Node not found for focus change:", nodeId);
      return;
    }
    this.focusedNode = node;
    renderFocusedNode();
  }

  getFocusedNode() {
    return this.focusedNode;
  }

  getLoomTree() {
    return this.loomTree;
  }

  getSamplerSettingsStore() {
    return this.samplerSettingsStore;
  }

  updateSamplerSettingsStore(newSettings) {
    this.samplerSettingsStore = newSettings;
    window.samplerSettingsStore = this.samplerSettingsStore;
  }
}

// Global state instance
const appState = new AppState();

// Service instances
let llmService;
let treeNav;

/**
 * Node Focus Management
 * The focused node is the one currently being viewed/edited
 */
function setFocusedNode(nodeId) {
  const node = appState.loomTree.nodeStore[nodeId];
  if (!node) {
    console.warn("Node not found for focus change:", nodeId);
    return;
  }

  appState.focusedNode = node;
  renderFocusedNode();
}

function getFocusedNode() {
  return appState.focusedNode;
}

/**
 * Render the focused node to the UI
 * This is the main rendering function that updates all UI elements
 */
function renderFocusedNode() {
  if (!appState.focusedNode) {
    console.warn("No focused node to render");
    return;
  }

  editor.value = appState.loomTree.renderNode(appState.focusedNode);
  treeNav.updateTreeView();
  updateBatchIndex();
  updateFocusedNodeTitle();
  updateThumbState();
  updateCounterDisplay(editor.value);
  appState.focusedNode.read = true;
}

function updateBatchIndex() {
  if (appState.focusedNode.parent) {
    const parent = appState.loomTree.nodeStore[appState.focusedNode.parent];
    const selection = parent.children.indexOf(appState.focusedNode.id);
    const batchLimit = parent.children.length - 1;
    batchIndexMarker.textContent = `${selection + 1}/${batchLimit + 1}`;
  } else {
    batchIndexMarker.textContent = "1/1";
  }
}

function updateFocusedNodeTitle() {
  if (focusedNodeTitle) {
    const title =
      (appState.focusedNode.summary || "").trim() || "Untitled Node";
    focusedNodeTitle.textContent = title;
  }
}

function updateThumbState() {
  if (thumbUp && thumbDown) {
    thumbUp.classList.remove("chosen");
    thumbDown.classList.remove("chosen");

    if (appState.focusedNode.rating === true) {
      thumbUp.classList.add("chosen");
    } else if (appState.focusedNode.rating === false) {
      thumbDown.classList.add("chosen");
    }
  }
}

function updateCounterDisplay(text) {
  const charCount = utils.countCharacters(text);
  const wordCount = utils.countWords(text);
  promptTokenCounter.innerText = `${wordCount} Words (${charCount} Characters)`;
}

/**
 * Rating Management
 */
function handleThumbsUp() {
  const newRating = appState.focusedNode.rating === true ? null : true;
  appState.loomTree.updateNodeRating(appState.focusedNode.id, newRating);
  updateThumbState();
  treeNav.updateTreeView();
}

function handleThumbsDown() {
  const newRating = appState.focusedNode.rating === false ? null : false;
  appState.loomTree.updateNodeRating(appState.focusedNode.id, newRating);
  updateThumbState();
  treeNav.updateTreeView();
}

/**
 * Editor Event Handlers
 */

editor.addEventListener("input", async e => {
  const prompt = editor.value;

  // Auto-save user work when writing next prompt
  if (
    appState.focusedNode.children.length > 0 ||
    ["gen", "rewrite", "root"].includes(appState.focusedNode.type)
  ) {
    const child = appState.loomTree.createNode(
      "user",
      appState.focusedNode,
      prompt,
      "New Node"
    );
    setFocusedNode(child.id);
  }
});

editor.addEventListener("keydown", async e => {
  const prompt = editor.value;
  const params = llmService.prepareRollParams();

  // Update user node content while typing
  if (
    appState.focusedNode.children.length === 0 &&
    appState.focusedNode.type === "user" &&
    !appState.updatingNode
  ) {
    appState.updatingNode = true;
    appState.loomTree.updateNode(
      appState.focusedNode,
      prompt,
      appState.focusedNode.summary
    );
    appState.updatingNode = false;
  }

  // Update character/word count on every keystroke
  updateCounterDisplay(prompt);

  // Generate summary while user is writing (every 32 characters)
  if (prompt.length % 32 === 0) {
    if (
      appState.focusedNode.children.length === 0 &&
      appState.focusedNode.type === "user" &&
      [
        "base",
        "vae-base",
        "vae-guided",
        "vae-paragraph",
        "vae-bridge",
      ].includes(params["sampling-method"]) &&
      !appState.updatingNode
    ) {
      try {
        appState.updatingNode = true;
        const summary = await llmService.getSummary(prompt);
        appState.loomTree.updateNode(appState.focusedNode, prompt, summary);
        appState.updatingNode = false;
      } catch (error) {
        console.error("Summary generation error:", error);
        appState.updatingNode = false;
      }
    }
    treeNav.updateTreeView();
  }

  // Generate on Ctrl/Cmd+Enter
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    llmService.reroll(appState.focusedNode.id);
  }
});

/**
 * File Operations
 */
async function saveFile() {
  const data = {
    loomTree: appState.loomTree,
    focus: appState.focusedNode,
  };
  try {
    await window.electronAPI.saveFile(data);
  } catch (err) {
    console.error("Save File Error:", err);
  }
}

async function loadFile() {
  try {
    const data = await window.electronAPI.loadFile();
    if (data) {
      const newLoomTree = new LoomTree();
      newLoomTree.loadFromData(data.loomTree);

      // Update global state
      appState.loomTree = newLoomTree;

      // Set focus to saved focus or root
      const savedFocus =
        data.focus && data.focus.id
          ? newLoomTree.nodeStore[data.focus.id]
          : newLoomTree.root;

      if (!savedFocus) {
        console.warn("Saved focus node not found, using root");
        appState.focusedNode = newLoomTree.root;
      } else {
        appState.focusedNode = savedFocus;
      }

      // Rebuild search index
      if (window.searchManager) {
        window.searchManager.rebuildIndex();
      }

      renderFocusedNode();
    }
  } catch (err) {
    console.error("Load File Error:", err);
  }
}

async function autoSave() {
  if (!appState.focusedNode) {
    console.warn("Cannot auto-save: no focused node");
    return;
  }

  const data = {
    loomTree: appState.loomTree,
    focus: appState.focusedNode,
    samplerSettingsStore: appState.samplerSettingsStore,
  };

  try {
    await window.electronAPI.autoSave(data);
  } catch (err) {
    console.error("Auto-save Error:", err);
  }
}

// Auto-save timer
async function autoSaveTick() {
  appState.secondsSinceLastSave += 1;
  if (appState.secondsSinceLastSave >= 30) {
    autoSave();
    appState.secondsSinceLastSave = 0;
  }
}

var autoSaveIntervalId = setInterval(autoSaveTick, 1000);

// Make necessary functions globally available
window.updateCounterDisplay = updateCounterDisplay;

/**
 * Settings Management
 */

async function loadSettings() {
  try {
    const data = await window.electronAPI.loadSettings();
    appState.updateSamplerSettingsStore(data || {});
    window.samplerSettingsStore = appState.samplerSettingsStore;
  } catch (err) {
    console.error("Load Settings Error:", err);
    appState.updateSamplerSettingsStore({});
    window.samplerSettingsStore = appState.samplerSettingsStore;
  }
}

const onSettingsUpdated = async () => {
  try {
    const data = await window.electronAPI.loadSettings();
    if (data != null) {
      appState.updateSamplerSettingsStore(data);
      window.samplerSettingsStore = appState.samplerSettingsStore;
      populateServiceSelector();
      populateSamplerSelector();
      populateApiKeySelector();
      renderFavoritesButtons();
    }
  } catch (err) {
    console.error("Load Settings Error:", err);
  }
};

/**
 * Initialization
 */
async function init() {
  try {
    await loadSettings();

    // Initialize services
    llmService = new LLMService({
      autoSaveTick: autoSaveTick,
      updateFocusSummary: updateFocusSummary,
      renderTick: renderFocusedNode,
      setFocus: newFocus => {
        appState.focusedNode = newFocus;
      },
      updateLoomTree: newLoomTree => {
        appState.loomTree = newLoomTree;
      },
      updateEditor: newEditor => {
        Object.assign(editor, newEditor);
      },
      updateNodeMetadata: (nodeId, metadata) => {
        if (appState.loomTree.nodeStore[nodeId]) {
          Object.assign(appState.loomTree.nodeStore[nodeId], metadata);
        }
      },
      getFocus: () => appState.getFocusedNode(),
      getLoomTree: () => appState.getLoomTree(),
      getSamplerSettingsStore: () => appState.getSamplerSettingsStore(),
      getEditor: () => editor,
      setEditorReadOnly: readOnly => {
        editor.readOnly = readOnly;
      },
      // Configuration callbacks
      getSamplerSettings: () => {
        const serviceSelector = document.getElementById("service-selector");
        const samplerSelector = document.getElementById("sampler-selector");
        const apiKeySelector = document.getElementById("api-key-selector");

        return {
          selectedServiceName: serviceSelector?.value || "",
          selectedSamplerName: samplerSelector?.value || "",
          selectedApiKeyName: apiKeySelector?.value || "",
        };
      },
      // UI state management callbacks
      setLoading: function (isLoading) {
        editor.readOnly = isLoading;
        const die = document.getElementById("die");
        if (die) {
          die.classList.toggle("rolling", isLoading);
        }
        // Don't clear errors when loading ends - let them persist
      },
      showError: message => {
        const errorMsgEl = document.getElementById("error-message");
        const errorsEl = document.getElementById("errors");

        if (errorMsgEl && errorsEl) {
          // Set the error message text
          errorMsgEl.textContent = `Error: ${message}`;

          // Add the error class
          errorsEl.classList.add("has-error");

          // Force visibility with inline styles
          errorsEl.style.display = "block";
          errorsEl.style.height = "auto";
          errorsEl.style.background = "#ffebee";
          errorsEl.style.border = "2px solid #dc3545";
          errorsEl.style.padding = "12px 16px";
          errorsEl.style.margin = "0";
          errorsEl.style.position = "relative";
          errorsEl.style.zIndex = "1000";

          errorMsgEl.style.color = "#dc3545";
          errorMsgEl.style.fontSize = "14px";
          errorMsgEl.style.fontWeight = "500";
          errorMsgEl.style.margin = "0";
          errorMsgEl.style.lineHeight = "1.4";
          errorMsgEl.style.display = "block";
          errorMsgEl.style.minHeight = "20px";
          errorMsgEl.style.visibility = "visible";
          errorMsgEl.style.opacity = "1";
          errorMsgEl.style.height = "auto";
          errorMsgEl.style.overflow = "visible";
          errorMsgEl.style.whiteSpace = "normal";
          errorMsgEl.style.wordWrap = "break-word";
          errorMsgEl.style.position = "static";
          errorMsgEl.style.transform = "none";
        }
      },
      clearErrors: () => {
        errorMessage.textContent = "";
        document.getElementById("errors").classList.remove("has-error");
      },
    });

    treeNav = new TreeNav(
      nodeId => {
        setFocusedNode(nodeId);
      },
      {
        getFocus: () => appState.getFocusedNode(),
        getLoomTree: () => appState.getLoomTree(),
      }
    );

    // Initialize search manager
    const searchManager = new SearchManager({
      getLoomTree: () => appState.getLoomTree(),
      getFocus: () => appState.getFocusedNode(),
      onNodeFocus: nodeId => {
        setFocusedNode(nodeId);
      },
      getFocusId: () => appState.getFocusedNode().id,
      treeNav: treeNav,
    });

    // Make services globally available
    window.llmService = llmService;
    window.treeNav = treeNav;
    window.searchManager = searchManager;

    // Initialize tree view
    const loomTreeView = document.getElementById("loom-tree-view");
    treeNav.renderTree(appState.loomTree.root, loomTreeView);

    // Set up settings event listener
    window.electronAPI.onSettingsUpdated(onSettingsUpdated);

    // Populate selectors
    populateServiceSelector();
    populateSamplerSelector();
    populateApiKeySelector();
    renderFavoritesButtons();
    addSettingsChangeListeners();

    // Set up event handlers
    setupEventHandlers();

    // Initial render
    renderFocusedNode();

    // Check for new user setup
    checkForNewUser();
  } catch (error) {
    console.error("Initialization failed:", error);
  }
}

function setupEventHandlers() {
  if (generateButton) {
    generateButton.onclick = () => llmService.reroll(appState.focusedNode.id);
  }
  if (thumbUp) {
    thumbUp.onclick = handleThumbsUp;
  }
  if (thumbDown) {
    thumbDown.onclick = handleThumbsDown;
  }

  // Settings labels
  const serviceLabel = document.querySelector(
    '.control-group label[title="Service"]'
  );
  const apiKeyLabel = document.querySelector(
    '.control-group label[title="API Key"]'
  );
  const samplerLabel = document.querySelector(
    '.control-group label[title="Sampler"]'
  );

  if (serviceLabel) {
    serviceLabel.style.cursor = "pointer";
    serviceLabel.onclick = () =>
      window.electronAPI.openSettingsToTab("services");
  }
  if (apiKeyLabel) {
    apiKeyLabel.style.cursor = "pointer";
    apiKeyLabel.onclick = () =>
      window.electronAPI.openSettingsToTab("api-keys");
  }
  if (samplerLabel) {
    samplerLabel.style.cursor = "pointer";
    samplerLabel.onclick = () =>
      window.electronAPI.openSettingsToTab("samplers");
  }

  editor.addEventListener("contextmenu", e => {
    e.preventDefault();
    window.electronAPI.showContextMenu();
  });
}

// Electron API event handlers
window.electronAPI.onUpdateFilename(
  (event, filename, creationTime, filePath) => {
    const filenameElement = document.getElementById("current-filename");
    if (filenameElement) {
      filenameElement.innerHTML = `💾 ${filename}`;

      if (creationTime) {
        const formattedTime = new Date(creationTime).toLocaleString();
        filenameElement.title = `File: ${filePath || "Unknown"}\nCreated: ${formattedTime}`;
      } else {
        filenameElement.title = `File: ${filePath || "Unknown"}`;
      }
    }
  }
);

window.electronAPI.onInvokeAction((event, action) => {
  switch (action) {
    case "save-file":
      saveFile();
      break;
    case "load-file":
      loadFile();
      break;
    default:
      console.warn("Action not recognized:", action);
  }
});

// Helper function for summary updates
async function updateFocusSummary() {
  if (
    appState.focusedNode.type === "user" &&
    appState.focusedNode.children.length === 0 &&
    !appState.updatingNode
  ) {
    const currentFocus = appState.focusedNode;
    const newPrompt = editor.value;
    const prompt = appState.loomTree.renderNode(currentFocus);

    appState.updatingNode = true;
    try {
      let summary = await llmService.getSummary(prompt);
      if (summary.trim() === "") {
        summary = "Summary Not Given";
      }
      appState.loomTree.updateNode(currentFocus, newPrompt, summary);
    } catch (error) {
      appState.loomTree.updateNode(
        currentFocus,
        newPrompt,
        "Server Response Error"
      );
    }
    appState.updatingNode = false;
  }
}

// Settings helper functions
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

  if (
    lastUsed.apiKey &&
    appState.samplerSettingsStore["api-keys"][lastUsed.apiKey]
  ) {
    const apiKeySelector = document.getElementById("api-key-selector");
    if (apiKeySelector) {
      apiKeySelector.value = lastUsed.apiKey;
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
  if (apiKeySelector && apiKeySelector.value) {
    appState.samplerSettingsStore.lastUsed.apiKey = apiKeySelector.value;
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
      const hasKey = favorite.key && apiKeys[favorite.key];
      const hasSampler = favorite.sampler && samplers[favorite.sampler];
      const isComplete = hasService && hasKey && hasSampler;

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
  if (apiKeySelector && favorite.key) {
    apiKeySelector.value = favorite.key;
  }
  if (samplerSelector && favorite.sampler) {
    samplerSelector.value = favorite.sampler;
  }

  // Save the current settings
  saveCurrentSettings();

  // Trigger generation
  if (llmService && appState.focusedNode) {
    llmService.reroll(appState.focusedNode.id);
  }
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  init();
  updateCounterDisplay(editor.value || "");
});
