const dmp = {
  patch_make: window.electronAPI.patch_make,
  patch_apply: window.electronAPI.patch_apply,
};

/**
 * Node class - represents an immutable node in the tree
 * Nodes are created from files, human input, or LLM generation
 * Once created, they are immutable except for rating & status changes
 */
class Node {
  constructor(id, type, parent, patch, summary) {
    this.id = id;
    this.type = type; // "root", "user", "gen", "rewrite"
    this.parent = parent;
    this.patch = patch;
    this.summary = summary;

    this.timestamp = Date.now();
    this.rating = null; // true = thumbs up, false = thumbs down, null = no rating
    this.read = false;
    this.children = [];
    this.model = null; // Model used for generation (e.g., "gpt-4", "llama-2-70b")
    this.finishReason = null; // Finish reason from LLM API (e.g., "stop", "length", "content_filter")

    // Status tracking
    this.generationPending = false; // Track if generation is in progress
    this.error = null; // Track any errors

    // derived values - do not serialize
    this.cachedRenderText = null;
    this.depth = 0; // Depth in the tree (0 = root, 1 = first level, etc.)
    this.netCharsAdded = 0;
    this.netWordsAdded = 0;
    this.characterCount = 0;
    this.wordCount = 0;
    this.treeStats = new TreeStats();
  }
}

class TreeStats {
  constructor() {
    this.maxChildDepth = 0;
    this.totalChildNodes = 0;
    this.lastChildUpdate = 0;
    this.maxWordCountOfChildren = 0;
    this.maxCharCountOfChildren = 0;
    this.unreadChildNodes = 0;
  }
}

class LoomTree {
  constructor() {
    this.root = new Node("1", "root", null, "", "Root Node");
    this.nodeStore = { 1: this.root };
  }

  createNode(type, parent, text, summary) {
    const parentRenderedText = this.applyPatches(parent);
    const patch = dmp.patch_make(parentRenderedText, text);
    const newNodeId = String(Object.keys(this.nodeStore).length + 1);
    const newNode = new Node(newNodeId, type, parent.id, patch, summary);

    if (newNode.type === "user") {
      newNode.read = true;
    }

    parent.children.push(newNodeId);
    this.nodeStore[newNodeId] = newNode;

    this.updateNodeStats(newNode);
    this.updateParentStatsIncremental(newNode, 1, newNode.read ? 0 : 1);

    return newNode;
  }

  updateNode(node, text, summary) {
    if (node.type === "gen" || node.children.length > 0) {
      return; // Can't update generated nodes or nodes with children
    }

    const parent = this.nodeStore[node.parent];
    const parentRenderedText = this.applyPatches(parent);
    node.patch = dmp.patch_make(parentRenderedText, text);
    node.timestamp = Date.now();
    node.summary = summary;

    this.updateNodeStats(node);
    this.updateParentStatsIncremental(node, 0, 0);
  }

  updateNodeStats(node) {
    const renderedText = this.applyPatches(node);
    node.cachedRenderText = renderedText;

    const textStats = window.utils.calculateTextStats(renderedText);
    node.characterCount = textStats.charCount;
    node.wordCount = textStats.wordCount;

    if (node.parent) {
      node.depth = this.nodeStore[node.parent].depth + 1;
      const parent = this.nodeStore[node.parent];
      node.netCharsAdded = textStats.charCount - parent.characterCount;
      node.netWordsAdded = textStats.wordCount - parent.wordCount;
    } else {
      node.depth = 0;
      node.netCharsAdded = textStats.charCount;
      node.netWordsAdded = textStats.wordCount;
    }
  }

  /**
   * Render the full text of a node by applying all patches from root
   */
  applyPatches(node) {
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
    node.cachedRenderText = outText;
    return outText;
  }

  /**
   * Alias for applyPatches - renders the full text of a node
   */
  renderNode(node) {
    return this.applyPatches(node);
  }

  updateParentStatsIncremental(node, numNodesAdded = 0, numUnreadChanged = 0) {
    // when a node is added or edited, recalculate up the tree without needing to redo the full traversal
    if (node.parent) {
      let parentStats = this.nodeStore[node.parent].treeStats;
      parentStats.totalChildNodes += numNodesAdded;
      // Don't update lastChildUpdate here - it should be based on actual node timestamps

      // Use stored node tree stats instead of just the node's own stats
      parentStats.maxWordCountOfChildren = Math.max(
        parentStats.maxWordCountOfChildren,
        node.treeStats.maxWordCountOfChildren
      );
      parentStats.maxCharCountOfChildren = Math.max(
        parentStats.maxCharCountOfChildren,
        node.treeStats.maxCharCountOfChildren
      );

      // Update parent's max depth if this node's depth exceeds it
      let newDepth = node.treeStats.maxChildDepth + 1;
      parentStats.maxChildDepth = Math.max(parentStats.maxChildDepth, newDepth);

      // Update unreadChildNodes count
      parentStats.unreadChildNodes = Math.max(
        0,
        parentStats.unreadChildNodes + numUnreadChanged
      );

      this.updateParentStatsIncremental(
        this.nodeStore[node.parent],
        numNodesAdded,
        numUnreadChanged
      );
    }
  }

  updateNodeRating(nodeId, rating) {
    const node = this.nodeStore[nodeId];
    if (node) {
      node.rating = rating;
    }
  }

  setNodeGenerationPending(nodeId, pending) {
    const node = this.nodeStore[nodeId];
    if (node) {
      node.generationPending = pending;
      // Update tree view if available
      if (window.treeNav) {
        window.treeNav.updateNodeStatus(nodeId);
      }
    }
  }

  setNodeError(nodeId, error) {
    const node = this.nodeStore[nodeId];
    if (node) {
      node.error = error;
      // Update tree view if available
      if (window.treeNav) {
        window.treeNav.updateNodeStatus(nodeId);
      }
    }
  }

  clearNodeError(nodeId) {
    const node = this.nodeStore[nodeId];
    if (node) {
      node.error = null;
      // Update tree view if available
      if (window.treeNav) {
        window.treeNav.updateNodeStatus(nodeId);
      }
    }
  }

  markNodeAsRead(nodeId) {
    const node = this.nodeStore[nodeId];
    if (node) {
      node.read = true;

      // Propagate read status upward using existing incremental update
      this.updateParentStatsIncremental(node, 0, -1);

      // Update tree view if available
      if (window.treeNav) {
        window.treeNav.updateTreeView();
      }
    }
  }

  serialize() {
    const nodeStore = {};

    // Serialize each node in the nodeStore, excluding temporary fields
    Object.keys(this.nodeStore).forEach(nodeId => {
      const node = this.nodeStore[nodeId];
      nodeStore[nodeId] = {
        id: node.id,
        timestamp: node.timestamp,
        type: node.type,
        patch: node.patch,
        summary: node.summary,
        rating: node.rating,
        read: node.read,
        parent: node.parent,
        children: node.children,
        model: node.model,
        error: node.error,
        finishReason: node.finishReason,
      };
    });

    return { nodeStore };
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
      node.model = nodeData.model;
      node.generationPending = false;
      node.error = nodeData.error || null;
      node.finishReason = nodeData.finishReason || null;

      this.nodeStore[nodeId] = node;
    });

    this.root = this.nodeStore["1"];
  }

  calculateAllNodeStats(node) {
    this.updateNodeStats(node);
    for (const childId of node.children) {
      if (this.nodeStore[childId]) {
        this.calculateAllNodeStats(this.nodeStore[childId]);
      }
    }
    this.updateNodeTreeStats(node);
  }

  updateNodeTreeStats(node) {
    // Calculate tree stats for this node based on its children
    let totalChildNodes = 0;
    let maxChildDepth = 0;
    let maxWordCountOfChildren = node.wordCount; // Start with this node's own count
    let maxCharCountOfChildren = node.characterCount; // Start with this node's own count
    let lastChildUpdate = node.timestamp; // Start with this node's own timestamp
    let unreadChildNodes = 0;

    for (const childId of node.children) {
      const child = this.nodeStore[childId];
      if (child) {
        // Add child's own count plus its subtree count (but not the node itself)
        totalChildNodes += 1 + child.treeStats.totalChildNodes;
        // Child's max depth is its own maxChildDepth + 1
        maxChildDepth = Math.max(
          maxChildDepth,
          child.treeStats.maxChildDepth + 1
        );
        // Use child's max word/char counts (which include the child's own counts)
        maxWordCountOfChildren = Math.max(
          maxWordCountOfChildren,
          child.treeStats.maxWordCountOfChildren
        );
        maxCharCountOfChildren = Math.max(
          maxCharCountOfChildren,
          child.treeStats.maxCharCountOfChildren
        );
        // Use the maximum timestamp from children
        lastChildUpdate = Math.max(
          lastChildUpdate,
          child.treeStats.lastChildUpdate
        );
        // Count unread nodes in subtree
        if (!child.read) {
          unreadChildNodes += 1;
        }
        unreadChildNodes += child.treeStats.unreadChildNodes;
      }
    }

    // Update this node's tree stats
    node.treeStats.totalChildNodes = totalChildNodes;
    node.treeStats.maxChildDepth = maxChildDepth;
    node.treeStats.maxWordCountOfChildren = maxWordCountOfChildren;
    node.treeStats.maxCharCountOfChildren = maxCharCountOfChildren;
    node.treeStats.lastChildUpdate = lastChildUpdate;
    node.treeStats.unreadChildNodes = unreadChildNodes;
  }
}

// Export classes for use in other modules
window.Node = Node;
window.TreeStats = TreeStats;
window.LoomTree = LoomTree;
