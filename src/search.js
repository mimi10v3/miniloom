// Import MiniSearch since it's not available globally
// const MiniSearch = require("minisearch");

let searchIndex = null;
let searchResultsMode = false;
let currentSearchQuery = "";

// Event system for communication with main app
const searchEvents = {
  listeners: {},

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Search event error (${event}):`, error);
        }
      });
    }
  },

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  },

  off(event, callback) {
    if (this.listeners[event]) {
      const index = this.listeners[event].indexOf(callback);
      if (index > -1) {
        this.listeners[event].splice(index, 1);
      }
    }
  },
};

function addNodeToSearchIndex(node) {
  if (!searchIndex || !node) return;

  const patchContent = extractPatchContent(node.patch);
  if (!patchContent.trim() && !node.summary) return;

  try {
    searchIndex.add({
      id: node.id,
      content: patchContent,
      summary: node.summary || "",
      type: node.type,
      timestamp: node.timestamp,
      fullContent: loomTree.renderNode(node),
    });
  } catch (error) {
    console.warn("Error adding node to search index:", error);
  }
}

function initializeSearchIndex() {
  searchIndex = new MiniSearch({
    fields: ["content", "summary", "type"],
    storeFields: ["content", "summary", "type", "timestamp", "fullContent"],
    searchOptions: {
      boost: {
        content: 3,
        summary: 2,
        type: 1,
      },
      prefix: true,
      fuzzy: 0.2,
    },
  });

  // Add all existing nodes to the index
  Object.keys(loomTree.nodeStore).forEach(nodeId => {
    const node = loomTree.nodeStore[nodeId];
    if (node) {
      addNodeToSearchIndex(node);
    }
  });
}

// Extract meaningful content from diff patches
function extractPatchContent(patch) {
  if (!patch || typeof patch === "string") {
    return patch || "";
  }

  try {
    if (Array.isArray(patch)) {
      return patch
        .map(p => {
          if (p.diffs) {
            return p.diffs
              .filter(diff => diff[0] === 1)
              .map(diff => diff[1])
              .join(" ");
          }
          return "";
        })
        .join(" ");
    }
    return "";
  } catch (error) {
    console.warn("Error extracting patch content:", error);
    return "";
  }
}

function performSearch(query) {
  if (!searchIndex || !query.trim()) {
    return [];
  }

  try {
    const results = searchIndex.search(query, {
      boost: {
        content: 3,
        summary: 2,
        type: 1,
      },
      prefix: true,
      fuzzy: 0.2,
    });

    return results.map(result => {
      const node = loomTree.nodeStore[result.id];
      return {
        node: node,
        score: result.score,
        highlightedContent: highlightText(
          result.content || extractPatchContent(node.patch),
          query
        ),
        highlightedSummary: highlightText(result.summary || "", query),
      };
    });
  } catch (error) {
    console.warn("Search error:", error);
    return [];
  }
}

function getSearchSuggestions(query) {
  if (!searchIndex || !query.trim()) {
    return [];
  }

  try {
    return searchIndex.autoSuggest(query, {
      fuzzy: 0.3,
      prefix: true,
    });
  } catch (error) {
    console.warn("Suggestion error:", error);
    return [];
  }
}

function renderSearchResults(query) {
  const results = performSearch(query);
  const noResultsElement = document.getElementById("search-no-results");
  const resultsContainer = document.getElementById("search-results-container");
  const treeView = document.getElementById("loom-tree-view");

  // Hide the tree view and show search results
  treeView.style.display = "none";

  if (results.length === 0) {
    noResultsElement.style.display = "block";
    resultsContainer.style.display = "none";
    return;
  }

  // Show results container and hide no results
  noResultsElement.style.display = "none";
  resultsContainer.style.display = "block";
  resultsContainer.innerHTML = "";

  results.forEach(result => {
    const resultItem = document.createElement("div");
    resultItem.className = "search-result-item";

    const header = document.createElement("div");
    header.className = "search-result-header";
    header.innerHTML = `${result.node.type.toUpperCase()} - ${
      result.highlightedSummary || result.node.summary
    }`;

    const content = document.createElement("div");
    content.className = "search-result-content";
    content.innerHTML = truncateText(result.highlightedContent, 150);

    const meta = document.createElement("div");
    meta.className = "search-result-meta";
    const formattedDate = formatTimestamp(result.node.timestamp);

    meta.innerHTML = `
      <div>Score: ${result.score.toFixed(3)} | ID: ${result.node.id}</div>
      <div class="search-result-date">${formattedDate}</div>
    `;

    resultItem.appendChild(header);
    resultItem.appendChild(content);
    resultItem.appendChild(meta);

    resultItem.onclick = () => {
      searchEvents.emit("focus-node", result.node.id);
    };

    resultsContainer.appendChild(resultItem);
  });
}

// Initialize search input event handlers
function initializeSearchInput() {
  const searchInput = document.getElementById("search-input");
  const suggestionsContainer = document.getElementById("search-suggestions");

  if (!searchInput || !suggestionsContainer) {
    console.warn("Search elements not found in DOM");
    return;
  }

  // Search as you type with debouncing
  let searchTimeout;
  searchInput.addEventListener("input", e => {
    clearTimeout(searchTimeout);
    const query = e.target.value;

    searchTimeout = setTimeout(() => {
      currentSearchQuery = query;
      searchResultsMode = query.trim().length > 0;

      // Emit search event instead of directly manipulating UI
      searchEvents.emit("search-query", {
        query: query,
        isActive: searchResultsMode,
      });
    }, 200);
  });

  // Handle keyboard navigation
  let suggestionIndex = -1;
  searchInput.addEventListener("keydown", e => {
    const suggestions =
      suggestionsContainer.querySelectorAll(".search-suggestion");

    if (e.key === "Escape") {
      e.target.value = "";
      currentSearchQuery = "";
      searchResultsMode = false;
      hideSuggestions(suggestionsContainer);
      searchEvents.emit("search-query", { query: "", isActive: false });
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      suggestionIndex = Math.min(suggestionIndex + 1, suggestions.length - 1);
      updateSuggestionHighlight(suggestions, suggestionIndex);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      suggestionIndex = Math.max(suggestionIndex - 1, -1);
      updateSuggestionHighlight(suggestions, suggestionIndex);
    } else if (e.key === "Enter" && suggestionIndex >= 0) {
      e.preventDefault();
      const selectedSuggestion = suggestions[suggestionIndex];
      if (selectedSuggestion) {
        searchInput.value = selectedSuggestion.textContent;
        searchInput.dispatchEvent(new Event("input"));
        hideSuggestions(suggestionsContainer);
      }
    }
  });

  // Hide suggestions when clicking outside
  const searchContainer = document.getElementById("search-container");
  document.addEventListener("click", e => {
    if (searchContainer && !searchContainer.contains(e.target)) {
      hideSuggestions(suggestionsContainer);
    }
  });
}

function showSuggestions(query, container) {
  if (!query.trim()) {
    hideSuggestions(container);
    return;
  }

  const suggestions = getSearchSuggestions(query);
  if (suggestions.length === 0) {
    hideSuggestions(container);
    return;
  }

  container.innerHTML = "";
  suggestions.slice(0, 5).forEach(suggestion => {
    const item = document.createElement("div");
    item.className = "search-suggestion";
    item.textContent = suggestion.suggestion;

    item.addEventListener("click", () => {
      document.getElementById("search-input").value = suggestion.suggestion;
      document.getElementById("search-input").dispatchEvent(new Event("input"));
      hideSuggestions(container);
    });

    container.appendChild(item);
  });

  container.style.display = "block";
}

function hideSuggestions(container) {
  container.style.display = "none";
}

function updateSuggestionHighlight(suggestions, index) {
  suggestions.forEach((item, i) => {
    if (i === index) {
      item.classList.add("search-suggestion-highlighted");
    } else {
      item.classList.remove("search-suggestion-highlighted");
    }
  });
}

// Public API for main app to interact with search
window.searchManager = {
  // Initialize search
  init() {
    initializeSearchInput();
    initializeSearchIndex();

    // Listen for search events
    searchEvents.on("focus-node", nodeId => {
      currentSearchQuery = "";
      searchResultsMode = false;
      document.getElementById("search-input").value = "";

      // Call main app functions directly (they're global)
      if (typeof changeFocus === "function") {
        changeFocus(nodeId);
      }
    });

    searchEvents.on("search-query", data => {
      const treeView = document.getElementById("loom-tree-view");
      const noResultsElement = document.getElementById("search-no-results");
      const resultsContainer = document.getElementById(
        "search-results-container"
      );

      if (data.isActive) {
        renderSearchResults(data.query);
        const suggestionsContainer =
          document.getElementById("search-suggestions");
        if (suggestionsContainer) {
          showSuggestions(data.query, suggestionsContainer);
        }
      } else {
        // Clear search state and restore normal tree view
        currentSearchQuery = "";
        searchResultsMode = false;

        // Hide search result containers and show tree view
        treeView.style.display = "block";
        noResultsElement.style.display = "none";
        resultsContainer.style.display = "none";

        // Let the main app handle its own UI updates
        if (typeof changeFocus === "function" && typeof focus !== "undefined") {
          if (treeView && typeof renderTree === "function") {
            treeView.innerHTML = "";
            renderTree(focus, treeView);
          }
        }

        const suggestionsContainer =
          document.getElementById("search-suggestions");
        if (suggestionsContainer) {
          hideSuggestions(suggestionsContainer);
        }
      }
    });
  },

  // Add a node to search index
  addNode(node) {
    if (!searchIndex || !node) return;

    const patchContent = extractPatchContent(node.patch);
    if (!patchContent.trim() && !node.summary) return;

    try {
      searchIndex.add({
        id: node.id,
        content: patchContent,
        summary: node.summary || "",
        type: node.type,
        timestamp: node.timestamp,
        fullContent: loomTree.renderNode(node),
      });
    } catch (error) {
      console.warn("Error adding node to search index:", error);
    }
  },

  // Update a node in search index
  updateNode(node) {
    if (!searchIndex || !node) return;

    try {
      searchIndex.replace({
        id: node.id,
        content: extractPatchContent(node.patch),
        summary: node.summary || "",
        type: node.type,
        timestamp: node.timestamp,
        fullContent: loomTree.renderNode(node),
      });
    } catch (error) {
      console.warn("Error updating node in search index:", error);
    }
  },

  // Remove a node from search index
  removeNode(node) {
    if (!searchIndex) return;

    try {
      searchIndex.remove(node);
    } catch (error) {
      console.warn("Error removing node from search index:", error);
    }
  },

  // Rebuild search index (for when tree is reloaded)
  rebuildIndex() {
    if (searchIndex) {
      searchIndex.removeAll();
      Object.keys(loomTree.nodeStore).forEach(nodeId => {
        const node = loomTree.nodeStore[nodeId];
        if (node) {
          this.addNode(node);
        }
      });
    }
  },

  getSearchState() {
    return {
      isActive: searchResultsMode,
      query: currentSearchQuery,
    };
  },
};

// Initialize when DOM is ready and loomTree is available
document.addEventListener("DOMContentLoaded", function () {
  // Wait for loomTree to be available
  const checkLoomTree = () => {
    if (typeof loomTree !== "undefined" && loomTree) {
      window.searchManager.init();
    } else {
      // Check again in a short while
      setTimeout(checkLoomTree, 100);
    }
  };
  checkLoomTree();
});
