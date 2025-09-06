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
  nodeTimestamp: document.getElementById("node-timestamp"),
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
  treeStatsSummary: document.getElementById("tree-stats-summary"),
  treeStatsTooltip: document.getElementById("tree-stats-tooltip"),
  // Editor stats elements
  editorWordCount: document.getElementById("editor-word-count"),
  editorWordChange: document.getElementById("editor-word-change"),
  editorCharCount: document.getElementById("editor-char-count"),
  editorCharChange: document.getElementById("editor-char-change"),
};

/*
 * Updates UI focus to the node corresponding to nodeId
 */
function updateFocus(nodeId, reason = "unknown") {
  const node = appState.loomTree.nodeStore[nodeId];
  if (!node) {
    console.warn(`Node ${nodeId} not found for focus change: ${reason}`);
    return;
  }

  // Update state
  appState.focusedNode = node;
  appState.loomTree.markNodeAsRead(nodeId);

  updateUI();

  // Auto-save when focus changes due to content creation
  if (reason === "editor-auto-save") {
    autoSave();
  }
}

function updateUI() {
  if (!appState.focusedNode) {
    console.warn("No focused node to render");
    return;
  }

  DOM.editor.value = appState.focusedNode.cachedRenderText;

  updateTreeStatsDisplay();
  updateFocusedNodeStats();
  updateThumbState();
  updateErrorDisplay();

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

  if (DOM.treeTotalNodes) {
    DOM.treeTotalNodes.textContent = rootNode.treeStats.totalChildNodes;
  }
  if (DOM.treeStatsSummary) {
    const tooltipText =
      `🍃 Total nodes: ${rootNode.treeStats.totalChildNodes}\n` +
      `📏 Max depth: ${rootNode.treeStats.maxChildDepth}\n` +
      `🕐 Last: ${lastUpdateTime ? window.utils.formatTimestamp(lastUpdateTime) : "N/A"}\n` +
      `📝 Max words: ${rootNode.treeStats.maxWordCountOfChildren}\n` +
      `🔤 Max chars: ${rootNode.treeStats.maxCharCountOfChildren || 0}\n` +
      `🌱 Unread nodes: ${rootNode.treeStats.unreadChildNodes || 0}\n` +
      `👍 Rated Good: ${rootNode.treeStats.ratedUpNodes || 0}\n` +
      `👎 Rated Bad: ${rootNode.treeStats.ratedDownNodes || 0}\n` +
      `🔥 Recent nodes (5min): ${rootNode.treeStats.recentNodes || 0}`;
    DOM.treeStatsSummary.setAttribute("data-tooltip-content", tooltipText);
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

  DOM.nodeSummary.textContent = focusedNode.summary || "Unsaved";
  DOM.nodeAuthor.textContent =
    focusedNode.type === "user" ? "Human" : focusedNode.model || "Unknown";
  DOM.nodeAuthorEmoji.textContent = focusedNode.type === "gen" ? "🤖" : "👤";
  DOM.nodePosition.innerHTML = `<strong>📍 ${focusedNode.id}:&nbsp</strong>`;

  // Update timestamp
  const formattedDate = window.utils.formatTimestamp(focusedNode.timestamp);
  if (DOM.nodeTimestamp) {
    DOM.nodeTimestamp.textContent = `🕐 ${formattedDate}`;
  }

  // Update metadata (depth only)
  if (DOM.nodeMetadata) {
    DOM.nodeMetadata.textContent = `📏 ${focusedNode.depth}`;
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

      DOM.subtreeInfo.setAttribute(
        "data-tooltip",
        window.utils.generateSubtreeTooltipText(focusedNode)
      );
      DOM.subtreeInfo.textContent = `🍃 ${focusedNode.treeStats.totalChildNodes} nodes`;
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
  } else {
    DOM.errorMsgEl.textContent = "";
    DOM.errorsEl.classList.remove("has-error");
  }
}

function clearFocusedNodeError() {
  if (appState.focusedNode && appState.focusedNode.error) {
    appState.loomTree.clearNodeError(appState.focusedNode.id);
    updateErrorDisplay();
  }
}

/**
 * Search Index Management
 */
function updateSearchIndex(node, fullText) {
  if (searchManager) {
    searchManager.addNodeToSearchIndex(node, fullText);
  }
}

function updateSearchIndexForNode(node) {
  if (searchManager) {
    searchManager.updateNode(node, appState.loomTree.renderNode(node));
  }
}

/**
 * Thumb Rating Management
 */
function updateThumbState() {
  if (DOM.thumbUp && DOM.thumbDown) {
    DOM.thumbUp.classList.remove("chosen", "thumbs-up");
    DOM.thumbDown.classList.remove("chosen", "thumbs-down");

    if (appState.focusedNode.rating === true) {
      DOM.thumbUp.classList.add("chosen", "thumbs-up");
    } else if (appState.focusedNode.rating === false) {
      DOM.thumbDown.classList.add("chosen", "thumbs-down");
    }
  }
}

function handleThumbRating(isThumbsUp) {
  const currentRating = appState.focusedNode.rating;
  const targetRating = isThumbsUp ? true : false;
  const newRating = currentRating === targetRating ? null : targetRating;

  appState.loomTree.updateNodeRating(appState.focusedNode.id, newRating);
  updateThumbState();
  if (treeNav) {
    treeNav.updateTreeView();
  }
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

      updateSearchIndex(child, appState.loomTree.renderNode(child));

      // Update tree stats display to show new recent node
      updateTreeStatsDisplay();

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

      updateSearchIndexForNode(appState.focusedNode);

      appState.updatingNode = false;
    }

    // Update character/word count on every keystroke
    updateTreeStatsDisplay();

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

          updateSearchIndexForNode(appState.focusedNode);

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
      await loadFileData(data);
    }
    // If data is null, user cancelled the operation
  } catch (err) {
    console.error("Load File Error:", err);
  }
}

async function loadRecentFile(filePath) {
  try {
    const data = await window.electronAPI.loadRecentFile(filePath);
    if (data) {
      await loadFileData(data);
    }
  } catch (err) {
    console.error("Load Recent File Error:", err);
  }
}

async function loadFileData(data) {
  try {
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

    // Ensure the focused node is properly rendered
    if (appState.focusedNode) {
      appState.focusedNode.cachedRenderText = newLoomTree.renderNode(
        appState.focusedNode
      );
    }

    // Update existing services with new data
    if (searchManager) {
      searchManager.updateLoomTree(newLoomTree);
      searchManager.rebuildIndex();
    }
    if (treeNav) {
      treeNav.renderTree(newLoomTree.root, DOM.loomTreeView);
    }

    // Render the new state
    updateUI();

    // Trigger an auto-save to create the temp file
    await autoSave();
  } catch (error) {
    console.error("Error in loadFileData:", error);
    throw error;
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

// Tree stats recalculation timer - recalculate every minute to update recent nodes
function treeStatsRecalcTick() {
  // Trigger full recalculation of tree stats to update recent nodes count
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  appState.loomTree.calculateAllNodeStats(
    appState.loomTree.root,
    fiveMinutesAgo
  );

  // Update the UI to reflect the new stats
  updateTreeStatsDisplay();

  // Re-render the tree navigation to show updated badges
  if (treeNav) {
    treeNav.updateTreeView();
  }
}

var treeStatsRecalcIntervalId = setInterval(treeStatsRecalcTick, 60000); // Every minute

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

// Electron API event handlers
window.electronAPI.onUpdateFilename(
  (event, filename, creationTime, filePath, isTemp) => {
    const filenameElement = document.getElementById("current-filename");
    if (filenameElement) {
      // Remove .json extension for display
      const displayName = filename.replace(/\.json$/, "");

      if (isTemp) {
        // For temp files, show "Unsaved" in red with no hover info
        filenameElement.innerHTML = `💾 <span style="color: red;">Unsaved</span>`;
        filenameElement.title = ""; // No hover info for temp files
      } else {
        // For regular files, show filename with hover info
        filenameElement.innerHTML = `💾 ${displayName}`;
        if (creationTime) {
          const formattedTime = new Date(creationTime).toLocaleString();
          filenameElement.title = `File: ${filePath || "Unknown"}\nCreated: ${formattedTime}`;
        } else {
          filenameElement.title = `File: ${filePath || "Unknown"}`;
        }
      }
    }
  }
);

window.electronAPI.onInvokeAction((event, action, ...args) => {
  switch (action) {
    case "save-file":
      saveFile();
      break;
    case "load-file":
      loadFile();
      break;
    case "new-loom":
      window.electronAPI.newLoom();
      break;
    case "load-recent-file":
      if (args.length > 0) {
        loadRecentFile(args[0]);
      }
      break;
    default:
      console.warn("Action not recognized:", action);
  }
});

/**
 * Initialize a fresh loom state - shared logic for new loom creation
 * This function handles the core initialization that happens both on app startup
 * (when no temp file exists) and when user creates a new loom
 */
function initializeFreshLoom() {
  // Create fresh loom tree
  appState.loomTree = new LoomTree();
  appState.focusedNode = appState.loomTree.root;

  // Reset editor to empty state
  DOM.editor.value = "";
  DOM.editor.readOnly = false;

  // Update existing services with fresh data
  if (searchManager) {
    searchManager.updateLoomTree(appState.loomTree);
    searchManager.rebuildIndex();
  }
  if (treeNav) {
    treeNav.renderTree(appState.loomTree.root, DOM.loomTreeView);
  }

  // Update all UI components
  updateUI();

  // Trigger auto-save to create temp file
  autoSave();
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

      updateSearchIndexForNode(currentFocus);
    } catch (error) {
      appState.loomTree.updateNode(
        currentFocus,
        newPrompt,
        "Server Response Error"
      );

      updateSearchIndexForNode(currentFocus);
    }
    appState.updatingNode = false;
  }
}

async function init() {
  try {
    await loadSettings();

    // Notify main process that renderer is ready and get any initial data (used to restore temp file after error)
    const initialData = await window.electronAPI.rendererReady();
    if (initialData) {
      await loadFileData(initialData);
    } else {
      // No temp file exists, create basic fresh state
      appState.loomTree = new LoomTree();
      appState.focusedNode = appState.loomTree.root;
      DOM.editor.value = "";
      DOM.editor.readOnly = false;
    }

    // Initialize services (needed for both loaded files and fresh state)
    llmService = new LLMService({
      autoSaveTick: autoSaveTick,
      updateFocusSummary: updateFocusSummary,
      setFocus: newFocus => {
        updateFocus(newFocus.id, "llm-generation");
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
        updateTreeStatsDisplay();
      },
      getFocus: () => appState.getFocusedNode(),
      getLoomTree: () => appState.getLoomTree(),
      getSamplerSettingsStore: () => appState.getSamplerSettingsStore(),
      getEditor: () => DOM.editor,
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
      updateSearchIndex: (node, fullText) => {
        if (searchManager) {
          searchManager.addNodeToSearchIndex(node, fullText);
        }
      },
    });

    // Create tree navigation service
    treeNav = new TreeNav(
      nodeId => {
        updateFocus(nodeId, "tree-navigation");
      },
      {
        getFocus: () => appState.getFocusedNode(),
        getLoomTree: () => appState.getLoomTree(),
      }
    );

    // Create search manager
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
    setupEditorHandlers();

    window.electronAPI.onLoadInitialData(async (event, initialData) => {
      try {
        if (initialData && initialData.data) {
          await loadFileData(initialData.data);
        }
      } catch (error) {
        console.error("Error loading initial data:", error);
        console.error("Error stack:", error.stack);
      }
    });

    window.electronAPI.onResetToNewLoom(async event => {
      try {
        initializeFreshLoom();
      } catch (error) {
        console.error("Error resetting to new loom:", error);
        console.error("Error stack:", error.stack);
      }
    });

    // Set up final save request handler
    window.electronAPI.onRequestFinalSave(async event => {
      try {
        await autoSave();
      } catch (error) {
        console.error("Error in final save:", error);
      }
    });

    // Populate settings selectors
    populateServiceSelector();
    populateSamplerSelector();
    populateApiKeySelector();
    renderFavoritesButtons();

    // Set up additional event handlers
    if (DOM.thumbUp) {
      DOM.thumbUp.onclick = () => handleThumbRating(true);
    }

    if (DOM.thumbDown) {
      DOM.thumbDown.onclick = () => handleThumbRating(false);
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

    // Generate button handler
    if (DOM.generateButton) {
      DOM.generateButton.onclick = () => {
        if (llmService && appState.focusedNode) {
          llmService.generateNewResponses(appState.focusedNode.id);
        }
      };
    }

    // Tree stats tooltip handlers
    if (DOM.treeStatsSummary && DOM.treeStatsTooltip) {
      DOM.treeStatsSummary.onmouseenter = () => {
        const content = DOM.treeStatsSummary.getAttribute(
          "data-tooltip-content"
        );
        if (content) {
          DOM.treeStatsTooltip.textContent = content;

          // Position tooltip below the stats element
          const rect = DOM.treeStatsSummary.getBoundingClientRect();
          DOM.treeStatsTooltip.style.left = rect.left + rect.width / 2 + "px";
          DOM.treeStatsTooltip.style.top = rect.bottom + 4 + "px";
          DOM.treeStatsTooltip.style.transform = "translateX(-50%)";

          DOM.treeStatsTooltip.style.display = "block";
        }
      };

      DOM.treeStatsSummary.onmouseleave = () => {
        DOM.treeStatsTooltip.style.display = "none";
      };

      // Allow clicking to keep tooltip open
      DOM.treeStatsSummary.onclick = () => {
        const content = DOM.treeStatsSummary.getAttribute(
          "data-tooltip-content"
        );
        if (content) {
          DOM.treeStatsTooltip.textContent = content;

          // Position tooltip below the stats element
          const rect = DOM.treeStatsSummary.getBoundingClientRect();
          DOM.treeStatsTooltip.style.left = rect.left + rect.width / 2 + "px";
          DOM.treeStatsTooltip.style.top = rect.bottom + 4 + "px";
          DOM.treeStatsTooltip.style.transform = "translateX(-50%)";

          DOM.treeStatsTooltip.style.display = "block";
        }
      };

      // Close tooltip when clicking outside
      document.addEventListener("click", e => {
        if (
          !DOM.treeStatsSummary.contains(e.target) &&
          !DOM.treeStatsTooltip.contains(e.target)
        ) {
          DOM.treeStatsTooltip.style.display = "none";
        }
      });
    }

    // Initial render and search index setup
    updateUI();

    // Check for new user setup
    checkForNewUser();
  } catch (error) {
    console.error("Initialization failed:", error);
  }
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  init();
});
