/**
 * File Manager - Handles all file operations and data persistence
 */

class FileManager {
  constructor(dependencies = {}) {
    this.appState = dependencies.appState;
    this.updateUI = dependencies.updateUI;
    this.updateSearchIndex = dependencies.updateSearchIndex;
    this.updateSearchIndexForNode = dependencies.updateSearchIndexForNode;
    this.treeNav = dependencies.treeNav;
    this.searchManager = dependencies.searchManager;
    this.DOM = dependencies.DOM;

    // Auto-save timer
    this.autoSaveIntervalId = null;
  }

  /**
   * Save current loom data to file
   */
  async saveFile() {
    const data = {
      loomTree: this.appState.loomTree.serialize(),
      focus: this.appState.focusedNode,
    };
    try {
      await window.electronAPI.saveFile(data);
    } catch (err) {
      console.error("Save File Error:", err);
    }
  }

  /**
   * Load loom data from file
   */
  async loadFile() {
    try {
      const data = await window.electronAPI.loadFile();
      if (data) {
        await this.loadFileData(data);
      }
      // If data is null, user cancelled the operation
    } catch (err) {
      console.error("Load File Error:", err);
    }
  }

  /**
   * Load recent file by path
   */
  async loadRecentFile(filePath) {
    try {
      const data = await window.electronAPI.loadRecentFile(filePath);
      if (data) {
        await this.loadFileData(data);
      }
    } catch (err) {
      console.error("Load Recent File Error:", err);
    }
  }

  /**
   * Load and process file data
   */
  async loadFileData(data) {
    try {
      const newLoomTree = new LoomTree();
      newLoomTree.loadFromData(data.loomTree);

      // Update global state
      this.appState.loomTree = newLoomTree;

      // Set focus to saved focus or root
      const savedFocus =
        data.focus && data.focus.id
          ? newLoomTree.nodeStore[data.focus.id]
          : newLoomTree.root;

      if (!savedFocus) {
        console.warn("Saved focus node not found, using root");
        this.appState.focusedNode = newLoomTree.root;
      } else {
        this.appState.focusedNode = savedFocus;
      }

      // Ensure the focused node is properly rendered
      if (this.appState.focusedNode) {
        this.appState.focusedNode.cachedRenderText = newLoomTree.renderNode(
          this.appState.focusedNode
        );
      }

      // Update existing services with new data
      if (this.searchManager) {
        this.searchManager.updateLoomTree(newLoomTree);
        this.searchManager.rebuildIndex();
      }
      if (this.treeNav) {
        this.treeNav.renderTree(newLoomTree.root, this.DOM.loomTreeView);
      }

      // Render the new state
      this.updateUI();

      // Trigger an auto-save to create the temp file
      await this.autoSave();
    } catch (error) {
      console.error("Error in loadFileData:", error);
      throw error;
    }
  }

  /**
   * Auto-save current state
   */
  async autoSave() {
    if (!this.appState.focusedNode) {
      console.warn("Cannot auto-save: no focused node");
      return;
    }

    const data = {
      loomTree: this.appState.loomTree.serialize(),
      focus: this.appState.focusedNode,
      samplerSettingsStore: this.appState.samplerSettingsStore,
    };

    try {
      await window.electronAPI.autoSave(data);
    } catch (err) {
      console.error("Auto-save Error:", err);
    }
  }

  /**
   * Auto-save timer tick
   */
  async autoSaveTick() {
    this.appState.secondsSinceLastSave += 1;
    if (this.appState.secondsSinceLastSave >= 30) {
      this.autoSave();
      this.appState.secondsSinceLastSave = 0;
    }
  }

  /**
   * Initialize a fresh loom state
   */
  initializeFreshLoom() {
    // Create fresh loom tree
    this.appState.loomTree = new LoomTree();
    this.appState.focusedNode = this.appState.loomTree.root;

    // Reset editor to empty state
    this.DOM.editor.value = "";
    this.DOM.editor.readOnly = false;

    // Update existing services with fresh data
    if (this.searchManager) {
      this.searchManager.updateLoomTree(this.appState.loomTree);
      this.searchManager.rebuildIndex();
    }
    if (this.treeNav) {
      this.treeNav.renderTree(
        this.appState.loomTree.root,
        this.DOM.loomTreeView
      );
    }

    // Update all UI components
    this.updateUI();

    // Trigger auto-save to create temp file
    this.autoSave();
  }

  /**
   * Initialize file manager and load initial data
   */
  async init() {
    // Notify main process that renderer is ready and get any initial data (used to restore temp file after error)
    const initialData = await window.electronAPI.rendererReady();
    if (initialData) {
      await this.loadFileData(initialData);
    } else {
      // No temp file exists, create basic fresh state
      this.appState.loomTree = new LoomTree();
      this.appState.focusedNode = this.appState.loomTree.root;
      this.DOM.editor.value = "";
      this.DOM.editor.readOnly = false;
    }
  }

  /**
   * Set up file-related event handlers
   */
  setupEventHandlers() {
    // Set up main action handler
    window.electronAPI.onInvokeAction((event, action, ...args) => {
      switch (action) {
        case "save-file":
          this.saveFile();
          break;
        case "load-file":
          this.loadFile();
          break;
        case "load-recent-file":
          if (args.length > 0) {
            this.loadRecentFile(args[0]);
          }
          break;
        case "new-loom":
          window.electronAPI.newLoom();
          break;
        default:
          console.warn("FileManager: Action not recognized:", action);
      }
    });

    window.electronAPI.onLoadInitialData(async (event, initialData) => {
      try {
        if (initialData && initialData.data) {
          await this.loadFileData(initialData.data);
        }
      } catch (error) {
        console.error("Error loading initial data:", error);
        console.error("Error stack:", error.stack);
      }
    });

    window.electronAPI.onResetToNewLoom(async event => {
      try {
        this.initializeFreshLoom();
      } catch (error) {
        console.error("Error resetting to new loom:", error);
        console.error("Error stack:", error.stack);
      }
    });

    // Set up final save request handler
    window.electronAPI.onRequestFinalSave(async event => {
      try {
        await this.autoSave();
      } catch (error) {
        console.error("Error in final save:", error);
      }
    });
  }

  /**
   * Start auto-save timer
   */
  startAutoSaveTimer() {
    if (this.autoSaveIntervalId) {
      clearInterval(this.autoSaveIntervalId);
    }
    this.autoSaveIntervalId = setInterval(() => this.autoSaveTick(), 1000);
  }

  /**
   * Clean up timers
   */
  cleanup() {
    if (this.autoSaveIntervalId) {
      clearInterval(this.autoSaveIntervalId);
      this.autoSaveIntervalId = null;
    }
  }
}

// Export for use in other modules
if (typeof window !== "undefined") {
  window.FileManager = FileManager;
}
