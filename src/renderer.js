class AppState {
  constructor() {
    this.loomTree = new LoomTree();
    this.focusedNode = this.loomTree.root;
    this.samplerSettingsStore = {};
    this.updatingNode = false; // lock to prevent generating multiple summaries at once
    this.secondsSinceLastSave = 0;
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
let searchManager;

// Make treeNav globally available for status updates
window.treeNav = null;

const DOM = {
  editor: document.getElementById("editor"),
  thumbUp: document.getElementById("thumb-up"),
  thumbDown: document.getElementById("thumb-down"),
  nodeSummary: document.getElementById("node-summary"),
  nodeAuthor: document.getElementById("node-author"),
  nodeAuthorEmoji: document.getElementById("node-author-emoji"),
  nodeDepth: document.getElementById("node-depth"),
  nodePosition: document.getElementById("node-position"),
  nodeCreatedTime: document.getElementById("node-created-time"),
  nodeMetadata: document.getElementById("node-metadata"),
  finishReason: document.getElementById("finish-reason"),
  subtreeInfo: document.getElementById("subtree-info"),
  subtreeChildren: document.getElementById("subtree-children"),
  subtreeTotal: document.getElementById("subtree-total"),
  errorMsgEl: document.getElementById("error-message"),
  errorsEl: document.getElementById("errors"),
  errorCloseButton: document.getElementById("error-close"),
  generateButton: document.getElementById("generate-button"),
  serviceLabel: document.querySelector('.control-group label[title="Service"]'),
  apiKeyLabel: document.querySelector('.control-group label[title="API Key"]'),
  samplerLabel: document.querySelector('.control-group label[title="Sampler"]'),
  serviceSelector: document.getElementById("service-selector"),
  samplerSelector: document.getElementById("sampler-selector"),
  apiKeySelector: document.getElementById("api-key-selector"),
  die: document.getElementById("die"),
  filenameElement: document.getElementById("current-filename"),
  loomTreeView: document.getElementById("loom-tree-view"),
  // Tree stats elements
  treeTotalNodes: document.getElementById("tree-total-nodes"),
  treeMaxDepth: document.getElementById("tree-max-depth"),
  treeMaxWords: document.getElementById("tree-max-words"),
  treeMaxChars: document.getElementById("tree-max-chars"),
  treeLastUpdate: document.getElementById("tree-last-update"),
  // Editor stats elements
  editorWordCount: document.getElementById("editor-word-count"),
  editorWordChange: document.getElementById("editor-word-change"),
  editorCharCount: document.getElementById("editor-char-count"),
  editorCharChange: document.getElementById("editor-char-change"),
};

/**
 * Unified State Management
 * Single source of truth for all state changes
 */
function updateFocus(nodeId, reason = "unknown") {
  // Validate node exists
  const node = appState.loomTree.nodeStore[nodeId];
  if (!node) {
    console.warn(`Node ${nodeId} not found for focus change: ${reason}`);
    return;
  }

  // Update state
  appState.focusedNode = node;
  appState.loomTree.markNodeAsRead(nodeId);

  // Always trigger UI update
  updateUI();

  // Log for debugging
  console.log(`Focus changed to ${nodeId} (${reason})`);
}

function updateUI() {
  if (!appState.focusedNode) {
    console.warn("No focused node to render");
    return;
  }

  // Update editor
  DOM.editor.value = appState.focusedNode.cachedRenderText;

  // Update all displays
  updateTreeStatsDisplay();
  updateFocusedNodeStats();
  updateThumbState();
  updateErrorDisplay();

  // Update tree view
  if (treeNav) {
    treeNav.updateTreeView();
  }
}

/**
 * Helper function to convert finish reason codes to user-friendly text
 */
function getFinishReasonDisplayText(finishReason) {
  const reasonMap = {
    stop: "Complete",
    length: "Max Length",
    content_filter: "Content Filtered",
    tool_calls: "Tool Called",
    function_call: "Function Called",
    max_tokens: "Token Limit",
    timeout: "Timed Out",
    user: "User Stopped",
    assistant: "Assistant Stopped",
    system: "System Stopped",
    end_turn: "Turn Ended",
    max_content_length: "Content Limit",
    safety: "Safety Filter",
    recitation: "Recitation Detected",
    network_error: "Network Error",
    server_error: "Server Error",
    rate_limit: "Rate Limited",
    invalid_request: "Invalid Request",
    unknown: "Unknown",
  };

  return reasonMap[finishReason] || finishReason || "Unknown";
}

/**
 * Tree Statistics Display
 */
function updateTreeStatsDisplay() {
  const rootNode = appState.loomTree.root;
  const lastUpdateTime =
    rootNode.treeStats.lastChildUpdate || new Date(rootNode.timestamp);

  // Update tree stats
  if (DOM.treeTotalNodes)
    DOM.treeTotalNodes.textContent = rootNode.treeStats.totalChildNodes;
  if (DOM.treeMaxDepth)
    DOM.treeMaxDepth.textContent = rootNode.treeStats.maxChildDepth;
  if (DOM.treeMaxWords)
    DOM.treeMaxWords.textContent = rootNode.treeStats.maxWordCountOfChildren;
  if (DOM.treeMaxChars)
    DOM.treeMaxChars.textContent =
      rootNode.treeStats.maxCharCountOfChildren || 0;
  if (DOM.treeLastUpdate) {
    DOM.treeLastUpdate.textContent = lastUpdateTime
      ? window.utils.formatTimestamp(lastUpdateTime)
      : "N/A";
  }

  // Update editor footer stats
  if (DOM.editorWordCount)
    DOM.editorWordCount.textContent = appState.focusedNode.wordCount;
  if (DOM.editorWordChange) {
    DOM.editorWordChange.textContent = `(${window.utils.formatNetChange(appState.focusedNode.netWordsAdded)})`;
    DOM.editorWordChange.className = window.utils.getNetChangeClass(
      appState.focusedNode.netWordsAdded
    );
  }
  if (DOM.editorCharCount)
    DOM.editorCharCount.textContent = appState.focusedNode.characterCount;
  if (DOM.editorCharChange) {
    DOM.editorCharChange.textContent = `(${window.utils.formatNetChange(appState.focusedNode.netCharsAdded)})`;
    DOM.editorCharChange.className = window.utils.getNetChangeClass(
      appState.focusedNode.netCharsAdded
    );
  }
}

/**
 * Focused Node Statistics Display
 */
function updateFocusedNodeStats() {
  const focusedNode = appState.focusedNode;

  DOM.nodeSummary.textContent = focusedNode.summary || "Untitled";
  DOM.nodeAuthor.textContent =
    focusedNode.type === "user" ? "Human" : focusedNode.model || "Unknown";
  DOM.nodeAuthorEmoji.textContent = focusedNode.type === "gen" ? "🤖" : "👤";
  DOM.nodePosition.innerHTML = `<strong>📍 ${focusedNode.id}: </strong>`;

  // Build metadata line
  const formattedDate = window.utils.formatTimestamp(focusedNode.timestamp);
  if (DOM.nodeMetadata) {
    DOM.nodeMetadata.textContent = `🕐 ${formattedDate} | 📏 ${focusedNode.depth}`;
  }

  // Display finish reason if available
  if (DOM.finishReason) {
    if (
      focusedNode.finishReason &&
      focusedNode.type === "gen" &&
      focusedNode.finishReason !== "length"
    ) {
      const finishReasonText = getFinishReasonDisplayText(
        focusedNode.finishReason
      );
      DOM.finishReason.textContent = ` | 🛑 ${finishReasonText}`;
      DOM.finishReason.style.display = "inline";
    } else {
      DOM.finishReason.style.display = "none";
    }
  }

  // Update subtree info
  if (DOM.subtreeInfo && DOM.subtreeChildren && DOM.subtreeTotal) {
    if (focusedNode.children && focusedNode.children.length > 0) {
      DOM.subtreeChildren.textContent = focusedNode.children.length;
      DOM.subtreeTotal.textContent = focusedNode.treeStats.totalChildNodes;
      DOM.subtreeInfo.style.display = "inline";

      const subtreeDate = window.utils.formatTimestamp(
        focusedNode.treeStats.lastChildUpdate || focusedNode.timestamp
      );
      DOM.subtreeInfo.setAttribute(
        "data-tooltip",
        `Subtree stats:\n` +
          `Total nodes: ${focusedNode.treeStats.totalChildNodes}\n` +
          `Direct children: ${focusedNode.children.length}\n` +
          `Max depth: ${focusedNode.treeStats.maxChildDepth}\n` +
          `Max words: ${focusedNode.treeStats.maxWordCountOfChildren}\n` +
          `Max chars: ${focusedNode.treeStats.maxCharCountOfChildren}\n` +
          `Last update: ${subtreeDate}`
      );
      DOM.subtreeInfo.textContent = ` | 🍃 ${focusedNode.children.length}/${focusedNode.treeStats.totalChildNodes}`;
    } else {
      DOM.subtreeInfo.style.display = "none";
    }
  }
}

/**
 * Error Display Management
 */
function updateErrorDisplay() {
  if (!DOM.errorMsgEl || !DOM.errorsEl || !appState.focusedNode) {
    return;
  }

  if (appState.focusedNode.error) {
    DOM.errorMsgEl.textContent = appState.focusedNode.error;
    DOM.errorsEl.classList.add("has-error");
    DOM.errorsEl.style.display = "block";
  } else {
    DOM.errorMsgEl.textContent = "";
    DOM.errorsEl.classList.remove("has-error");
    DOM.errorsEl.style.display = "none";
  }
}

function clearFocusedNodeError() {
  if (appState.focusedNode && appState.focusedNode.error) {
    appState.loomTree.clearNodeError(appState.focusedNode.id);
    updateErrorDisplay();
  }
}

/**
 * Thumb Rating Management
 */
function updateThumbState() {
  if (DOM.thumbUp && DOM.thumbDown) {
    DOM.thumbUp.classList.remove("chosen");
    DOM.thumbDown.classList.remove("chosen");

    if (appState.focusedNode.rating === true) {
      DOM.thumbUp.classList.add("chosen");
    } else if (appState.focusedNode.rating === false) {
      DOM.thumbDown.classList.add("chosen");
    }
  }
}

function handleThumbsUp() {
  const newRating = appState.focusedNode.rating === true ? null : true;
  appState.loomTree.updateNodeRating(appState.focusedNode.id, newRating);
  updateThumbState();
  if (treeNav) {
    treeNav.updateTreeView();
  }
}

function handleThumbsDown() {
  const newRating = appState.focusedNode.rating === false ? null : false;
  appState.loomTree.updateNodeRating(appState.focusedNode.id, newRating);
  updateThumbState();
  if (treeNav) {
    treeNav.updateTreeView();
  }
}

/**
 * Counter Display Management
 */
function updateCounterDisplay(text) {
  updateTreeStatsDisplay();
}

/**
 * Editor Event Handlers
 */
function setupEditorHandlers() {
  DOM.editor.addEventListener("input", async e => {
    const prompt = DOM.editor.value;

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

      // Update search index
      if (searchManager) {
        searchManager.addNodeToSearchIndex(
          child,
          appState.loomTree.renderNode(child)
        );
      }

      updateFocus(child.id, "editor-auto-save");
    }
  });

  DOM.editor.addEventListener("keydown", async e => {
    const prompt = DOM.editor.value;
    const params = llmService.prepareGenerationParams();

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

      // Update search index
      if (searchManager) {
        searchManager.updateNode(
          appState.focusedNode,
          appState.loomTree.renderNode(appState.focusedNode)
        );
      }

      appState.updatingNode = false;
    }

    // Update character/word count on every keystroke
    updateCounterDisplay(prompt);

    // Generate summary while user is writing (every 32 characters)
    if (prompt.length % 32 === 0) {
      if (
        appState.focusedNode.children.length === 0 &&
        appState.focusedNode.type === "user" &&
        ["base"].includes(params["sampling-method"]) &&
        !appState.updatingNode
      ) {
        try {
          appState.updatingNode = true;
          const summary = await llmService.generateSummary(prompt);
          appState.loomTree.updateNode(appState.focusedNode, prompt, summary);

          // Update search index
          if (searchManager) {
            searchManager.updateNode(
              appState.focusedNode,
              appState.loomTree.renderNode(appState.focusedNode)
            );
          }

          appState.updatingNode = false;
        } catch (error) {
          console.error("Summary generation error:", error);
          appState.updatingNode = false;
        }
      }
      if (treeNav) {
        treeNav.updateTreeView();
      }
    }

    // Generate on Ctrl/Cmd+Enter
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      llmService.generateNewResponses(appState.focusedNode.id);
    }
  });

  DOM.editor.addEventListener("contextmenu", e => {
    e.preventDefault();
    window.electronAPI.showContextMenu();
  });
}

/**
 * File Operations
 */
async function saveFile() {
  const data = {
    loomTree: appState.loomTree.serialize(),
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

      // Calculate all node stats and generate cached render text
      newLoomTree.calculateAllNodeStats(newLoomTree.root);

      appState.loomTree = newLoomTree;

      const savedFocus =
        data.focus && data.focus.id
          ? newLoomTree.nodeStore[data.focus.id]
          : newLoomTree.root;

      if (!savedFocus) {
        console.warn("Saved focus node not found, using root");
        updateFocus(newLoomTree.root.id, "file-load-default");
      } else {
        updateFocus(savedFocus.id, "file-load-saved");
      }

      if (searchManager) {
        searchManager.updateLoomTree(appState.loomTree);
        searchManager.rebuildIndex();
      }
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
    loomTree: appState.loomTree.serialize(),
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
 * Event Handlers Setup
 */
function setupEventHandlers() {
  if (DOM.generateButton) {
    DOM.generateButton.onclick = () =>
      llmService.generateNewResponses(appState.focusedNode.id);
  }

  if (DOM.thumbUp) {
    DOM.thumbUp.onclick = handleThumbsUp;
  }

  if (DOM.thumbDown) {
    DOM.thumbDown.onclick = handleThumbsDown;
  }

  // Settings labels
  if (DOM.serviceLabel) {
    DOM.serviceLabel.style.cursor = "pointer";
    DOM.serviceLabel.onclick = () =>
      window.electronAPI.openSettingsToTab("services");
  }

  if (DOM.apiKeyLabel) {
    DOM.apiKeyLabel.style.cursor = "pointer";
    DOM.apiKeyLabel.onclick = () =>
      window.electronAPI.openSettingsToTab("api-keys");
  }

  if (DOM.samplerLabel) {
    DOM.samplerLabel.style.cursor = "pointer";
    DOM.samplerLabel.onclick = () =>
      window.electronAPI.openSettingsToTab("samplers");
  }

  // Error close button handler
  if (DOM.errorCloseButton) {
    DOM.errorCloseButton.onclick = clearFocusedNodeError;
  }
}

/**
 * Electron API Event Handlers
 */
function setupElectronHandlers() {
  window.electronAPI.onUpdateFilename(
    (event, filename, creationTime, filePath) => {
      if (DOM.filenameElement) {
        DOM.filenameElement.innerHTML = `💾 ${filename}`;

        if (creationTime) {
          const formattedTime = window.utils.formatTimestamp(creationTime);
          DOM.filenameElement.title = `File: ${filePath || "Unknown"}\nCreated: ${formattedTime}`;
        } else {
          DOM.filenameElement.title = `File: ${filePath || "Unknown"}`;
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
}

/**
 * Helper function for summary updates
 */
async function updateFocusSummary() {
  if (
    appState.focusedNode.type === "user" &&
    appState.focusedNode.children.length === 0 &&
    !appState.updatingNode
  ) {
    const currentFocus = appState.focusedNode;
    const newPrompt = DOM.editor.value;
    const prompt = appState.loomTree.renderNode(currentFocus);

    appState.updatingNode = true;
    try {
      let summary = await llmService.generateSummary(prompt);
      if (summary.trim() === "") {
        summary = "Summary Not Given";
      }
      appState.loomTree.updateNode(currentFocus, newPrompt, summary);

      // Update search index
      if (searchManager) {
        searchManager.updateNode(
          currentFocus,
          appState.loomTree.renderNode(currentFocus)
        );
      }
    } catch (error) {
      appState.loomTree.updateNode(
        currentFocus,
        newPrompt,
        "Server Response Error"
      );

      // Update search index
      if (searchManager) {
        searchManager.updateNode(
          currentFocus,
          appState.loomTree.renderNode(currentFocus)
        );
      }
    }
    appState.updatingNode = false;
  }
}

/**
 * Service Configuration
 */
function createLLMServiceConfig() {
  return {
    autoSaveTick: autoSaveTick,
    updateFocusSummary: updateFocusSummary,
    setFocus: newFocus => {
      updateFocus(newFocus.id, "llm-generation");
    },
    updateLoomTree: newLoomTree => {
      appState.loomTree = newLoomTree;
    },
    updateEditor: newEditor => {
      Object.assign(DOM.editor, newEditor);
    },
    updateNodeMetadata: (nodeId, metadata) => {
      if (appState.loomTree.nodeStore[nodeId]) {
        Object.assign(appState.loomTree.nodeStore[nodeId], metadata);
      }
    },
    updateTreeView: () => {
      if (treeNav) {
        treeNav.updateTreeView();
      }
    },
    getFocus: () => appState.getFocusedNode(),
    getLoomTree: () => appState.getLoomTree(),
    getSamplerSettingsStore: () => appState.getSamplerSettingsStore(),
    getEditor: () => DOM.editor,
    setEditorReadOnly: readOnly => {
      DOM.editor.readOnly = readOnly;
    },
    getSamplerSettings: () => ({
      selectedServiceName: DOM.serviceSelector?.value || "",
      selectedSamplerName: DOM.samplerSelector?.value || "",
      selectedApiKeyName: DOM.apiKeySelector?.value || "",
    }),
    setLoading: function (isLoading) {
      DOM.editor.readOnly = isLoading;
      if (DOM.die) {
        DOM.die.classList.toggle("rolling", isLoading);
      }
    },
    showError: message => {
      console.warn("Global error:", message);
      // Trigger UI update to show the error
      updateErrorDisplay();
    },
    clearErrors: () => {
      clearFocusedNodeError();
    },
    updateSearchIndex: (node, fullText) => {
      if (searchManager) {
        searchManager.addNodeToSearchIndex(node, fullText);
      }
    },
  };
}

/**
 * Initialization
 */
async function init() {
  try {
    await loadSettings();

    llmService = new LLMService(createLLMServiceConfig());

    treeNav = new TreeNav(
      nodeId => {
        updateFocus(nodeId, "tree-navigation");
      },
      {
        getFocus: () => appState.getFocusedNode(),
        getLoomTree: () => appState.getLoomTree(),
      }
    );

    searchManager = new SearchManager({
      focusOnNode: nodeId => {
        if (nodeId) {
          updateFocus(nodeId, "search-result");
        } else {
          const focusedNode = appState.getFocusedNode();
          if (focusedNode) {
            updateFocus(focusedNode.id, "search-result");
          }
        }
      },
      loomTree: appState.getLoomTree(),
      treeNav: treeNav,
    });

    // Make services globally available
    window.llmService = llmService;
    window.treeNav = treeNav;
    window.searchManager = searchManager;

    // Initialize tree view
    treeNav.renderTree(appState.loomTree.root, DOM.loomTreeView);

    // Set up event listeners
    window.electronAPI.onSettingsUpdated(onSettingsUpdated);
    setupElectronHandlers();
    setupEditorHandlers();
    setupEventHandlers();

    // Populate selectors
    populateServiceSelector();
    populateSamplerSelector();
    populateApiKeySelector();
    renderFavoritesButtons();
    addSettingsChangeListeners();

    // Initial render
    updateUI();

    // Rebuild search index with current data
    if (searchManager) {
      searchManager.rebuildIndex();
    }

    // Check for new user setup
    checkForNewUser();
  } catch (error) {
    console.error("Initialization failed:", error);
  }
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  init();
  updateCounterDisplay(DOM.editor.value || "");
});
