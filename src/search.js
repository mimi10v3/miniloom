class SearchManager {
  constructor({
    getLoomTree,
    getFocus,
    onNodeFocus,
    getFocusId,
    treeNav = null,
  } = {}) {
    // Private state
    this.searchResultsMode = false;
    this.currentSearchQuery = "";

    // Required dependencies
    this.getLoomTree = getLoomTree;
    this.getFocus = getFocus;
    this.onNodeFocus = onNodeFocus;
    this.getFocusId = getFocusId;
    this.treeNav = treeNav;

    // DOM elements
    this.searchInput = document.getElementById("search-input");
    this.suggestionsContainer = document.getElementById("search-suggestions");
    this.searchContainer = document.getElementById("search-container");
    this.noResultsElement = document.getElementById("search-no-results");
    this.resultsContainer = document.getElementById("search-results-container");

    // Initialize when DOM is ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.init());
    } else {
      this.init();
    }
  }

  init() {
    if (this.getLoomTree) {
      this.initializeSearchInput();
      this.initializeSearchIndex();
    } else {
      console.warn(
        "getLoomTree callback isn't available for search initialization"
      );
    }
  }

  // Extract meaningful content from diff patches
  extractPatchContent(patch) {
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

  addNodeToSearchIndex(node) {
    if (!node) return;

    const patchContent = this.extractPatchContent(node.patch);
    if (!patchContent.trim() && !node.summary) return;

    try {
      window.electronAPI.searchIndexAdd({
        id: node.id,
        content: patchContent,
        summary: node.summary || "",
        type: node.type,
        timestamp: node.timestamp,
        fullContent: this.getLoomTree().renderNode(node),
      });
    } catch (error) {
      console.warn("Error adding node to search index:", error);
    }
  }

  initializeSearchIndex() {
    try {
      // Use the safe API to create MiniSearch instance
      window.electronAPI.createMiniSearch({
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
      const loomTree = this.getLoomTree();
      Object.keys(loomTree.nodeStore).forEach(nodeId => {
        const node = loomTree.nodeStore[nodeId];
        if (node) {
          this.addNodeToSearchIndex(node);
        }
      });
    } catch (error) {
      console.error("Failed to initialize search index:", error);
    }
  }

  performSearch(query) {
    if (!query.trim()) {
      return [];
    }

    try {
      const results = window.electronAPI.searchIndexSearch(query, {
        boost: {
          content: 3,
          summary: 2,
          type: 1,
        },
        prefix: true,
        fuzzy: 0.2,
      });

      const loomTree = this.getLoomTree();
      return results.map(result => {
        const node = loomTree.nodeStore[result.id];
        return {
          node: node,
          score: result.score,
          highlightedContent: window.utils.highlightText(
            result.content || this.extractPatchContent(node.patch),
            query
          ),
          highlightedSummary: window.utils.highlightText(
            result.summary || "",
            query
          ),
        };
      });
    } catch (error) {
      console.warn("Search error:", error);
      return [];
    }
  }

  getSearchSuggestions(query) {
    if (!query.trim()) {
      return [];
    }

    try {
      return window.electronAPI.searchIndexAutoSuggest(query, {
        fuzzy: 0.3,
        prefix: true,
      });
    } catch (error) {
      console.warn("Suggestion error:", error);
      return [];
    }
  }

  renderSearchResults(query) {
    const results = this.performSearch(query);

    // Hide the tree view and show search results
    if (this.treeNav) {
      this.treeNav.hide();
    }

    if (results.length === 0) {
      this.noResultsElement.style.display = "block";
      this.resultsContainer.style.display = "none";
      return;
    }

    // Show results container and hide no results
    this.noResultsElement.style.display = "none";
    this.resultsContainer.style.display = "block";
    this.resultsContainer.innerHTML = "";

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
      content.innerHTML = window.utils.truncateText(
        result.highlightedContent,
        150
      );

      const meta = document.createElement("div");
      meta.className = "search-result-meta";
      const formattedDate = window.utils.formatTimestamp(result.node.timestamp);

      meta.innerHTML = `
        <div>Score: ${result.score.toFixed(3)} | ID: ${result.node.id}</div>
        <div class="search-result-date">${formattedDate}</div>
      `;

      resultItem.appendChild(header);
      resultItem.appendChild(content);
      resultItem.appendChild(meta);

      resultItem.onclick = () => {
        if (this.onNodeFocus) {
          this.onNodeFocus(result.node.id);
        }
      };

      this.resultsContainer.appendChild(resultItem);
    });
  }

  showSuggestions(query, container) {
    if (!query.trim()) {
      this.hideSuggestions(container);
      return;
    }

    const suggestions = this.getSearchSuggestions(query);
    if (suggestions.length === 0) {
      this.hideSuggestions(container);
      return;
    }

    container.innerHTML = "";
    suggestions.slice(0, 5).forEach(suggestion => {
      const item = document.createElement("div");
      item.className = "search-suggestion";
      item.textContent = suggestion.suggestion;

      item.addEventListener("click", () => {
        this.searchInput.value = suggestion.suggestion;
        this.searchInput.dispatchEvent(new Event("input"));
        this.hideSuggestions(container);
      });

      container.appendChild(item);
    });

    container.style.display = "block";
  }

  hideSuggestions(container) {
    container.style.display = "none";
  }

  updateSuggestionHighlight(suggestions, index) {
    suggestions.forEach((item, i) => {
      if (i === index) {
        item.classList.add("search-suggestion-highlighted");
      } else {
        item.classList.remove("search-suggestion-highlighted");
      }
    });
  }

  clearSearchState() {
    this.currentSearchQuery = "";
    this.searchResultsMode = false;

    if (this.treeNav) {
      this.treeNav.show();
    }
    if (this.noResultsElement) this.noResultsElement.style.display = "none";
    if (this.resultsContainer) this.resultsContainer.style.display = "none";
    if (this.suggestionsContainer)
      this.hideSuggestions(this.suggestionsContainer);
  }

  initializeSearchInput() {
    if (!this.searchInput || !this.suggestionsContainer) {
      console.warn("Search elements not found in DOM");
      return;
    }

    // Search as you type with debouncing
    let searchTimeout;
    this.searchInput.addEventListener("input", e => {
      clearTimeout(searchTimeout);
      const query = e.target.value;

      searchTimeout = setTimeout(() => {
        this.currentSearchQuery = query;
        this.searchResultsMode = query.trim().length > 0;

        if (this.searchResultsMode) {
          this.renderSearchResults(query);
          this.showSuggestions(query, this.suggestionsContainer);
        } else {
          this.clearSearchState();
          if (this.onNodeFocus && this.getFocusId) {
            this.onNodeFocus(this.getFocusId());
          }
        }
      }, 200);
    });

    // Handle keyboard navigation
    let suggestionIndex = -1;
    this.searchInput.addEventListener("keydown", e => {
      const suggestions =
        this.suggestionsContainer.querySelectorAll(".search-suggestion");

      if (e.key === "Escape") {
        e.target.value = "";
        this.clearSearchState();
        if (this.onNodeFocus && this.getFocusId) {
          this.onNodeFocus(this.getFocusId());
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        suggestionIndex = Math.min(suggestionIndex + 1, suggestions.length - 1);
        this.updateSuggestionHighlight(suggestions, suggestionIndex);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        suggestionIndex = Math.max(suggestionIndex - 1, -1);
        this.updateSuggestionHighlight(suggestions, suggestionIndex);
      } else if (e.key === "Enter" && suggestionIndex >= 0) {
        e.preventDefault();
        const selectedSuggestion = suggestions[suggestionIndex];
        if (selectedSuggestion) {
          this.searchInput.value = selectedSuggestion.textContent;
          this.searchInput.dispatchEvent(new Event("input"));
          this.hideSuggestions(this.suggestionsContainer);
        }
      }
    });

    // Hide suggestions when clicking outside
    document.addEventListener("click", e => {
      if (this.searchContainer && !this.searchContainer.contains(e.target)) {
        this.hideSuggestions(this.suggestionsContainer);

        // Clear search and restore tree view when clicking outside
        if (this.searchResultsMode) {
          this.clearSearchState();
          if (this.onNodeFocus && this.getFocusId) {
            this.onNodeFocus(this.getFocusId());
          }
        }
      }
    });
  }

  // Public API methods
  addNode(node) {
    this.addNodeToSearchIndex(node);
  }

  updateNode(node) {
    if (!node) return;

    try {
      window.electronAPI.searchIndexReplace({
        id: node.id,
        content: this.extractPatchContent(node.patch),
        summary: node.summary || "",
        type: node.type,
        timestamp: node.timestamp,
        fullContent: this.getLoomTree().renderNode(node),
      });
    } catch (error) {
      console.warn("Error updating node in search index:", error);
    }
  }

  removeNode(node) {
    try {
      window.electronAPI.searchIndexRemove(node);
    } catch (error) {
      console.warn("Error removing node from search index:", error);
    }
  }

  rebuildIndex() {
    window.electronAPI.searchIndexRemoveAll();
    const loomTree = this.getLoomTree();
    Object.keys(loomTree.nodeStore).forEach(nodeId => {
      const node = loomTree.nodeStore[nodeId];
      if (node) {
        this.addNode(node);
      }
    });
  }

  getSearchState() {
    return {
      isActive: this.searchResultsMode,
      query: this.currentSearchQuery,
    };
  }
}

// Export the SearchManager class
window.SearchManager = SearchManager;
