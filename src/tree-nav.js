class TreeNav {
  constructor(onNodeClick, callbacks = {}) {
    this.loomTreeView = document.getElementById("loom-tree-view");
    if (!this.loomTreeView) {
      throw new Error("loom-tree-view element not found");
    }
    this.onNodeClick = onNodeClick;
    this.callbacks = callbacks;
  }

  renderTree(node, container) {
    const parentIds = [];
    const hiddenParentIds = [];
    const loomTree = this.callbacks.getLoomTree();

    // Move up 2 parents to show context around the focused node
    for (let i = 0; i < 2; i++) {
      if (node.parent === null) {
        break; // Stop at root node
      }
      parentIds.push(node.parent);
      node = loomTree.nodeStore[node.parent];
    }

    // Find all hidden parents above the current node
    // Walk up from the original focused node to find all parents not in parentIds
    const originalFocus = this.callbacks.getFocus();
    let currentNode = originalFocus;
    while (currentNode.parent !== null) {
      const parent = loomTree.nodeStore[currentNode.parent];
      if (parent && !parentIds.includes(parent.id)) {
        hiddenParentIds.push(parent.id);
      }
      currentNode = parent;
    }

    const ul = document.createElement("ul");

    // Render hidden parents if any exist
    if (hiddenParentIds.length > 0) {
      const hiddenParentsLi = this.createHiddenParentsLi(hiddenParentIds);
      ul.appendChild(hiddenParentsLi);

      // Add horizontal rule after hidden parents
      const hr = document.createElement("hr");
      hr.classList.add("hidden-parents-divider");
      ul.appendChild(hr);
    }

    const li = this.createTreeLi(node, 1, false, parentIds);

    if (node.parent) {
      li.classList.add("hidden-parents");
    }

    ul.appendChild(li);
    this.renderChildren(node, li, 5, parentIds);
    container.appendChild(ul);
  }

  renderChildren(node, container, maxChildrenDepth, parentIds) {
    if (maxChildrenDepth <= 0 || node.children.length === 0) {
      return;
    }

    const childrenUl = document.createElement("ul");
    const loomTree = this.callbacks.getLoomTree();
    const currentFocus = this.callbacks.getFocus();

    // Check if this node should be compressed (downvoted and not focused/parent)
    const shouldCompress =
      node.rating === false &&
      node.id !== currentFocus.id &&
      !parentIds.includes(node.id);

    if (shouldCompress) {
      // Create compressed children indicator
      const compressedLi = this.createCompressedChildrenLi(node);
      childrenUl.appendChild(compressedLi);
    } else {
      // Render children normally
      for (let i = 0; i < node.children.length; i++) {
        const child = loomTree.nodeStore[node.children[i]];
        const li = this.createTreeLi(
          child,
          i + 1,
          maxChildrenDepth <= 1,
          parentIds
        );
        childrenUl.appendChild(li);
        this.renderChildren(child, li, maxChildrenDepth - 1, parentIds);
      }
    }

    container.appendChild(childrenUl);
  }

  createTreeLi(node, index, isMaxDepth, parentIds) {
    const li = document.createElement("li");
    const nodeSpan = this.createNodeSpan(node, parentIds, isMaxDepth);
    const link = this.createNodeLink(node, index);

    nodeSpan.appendChild(link);
    li.appendChild(nodeSpan);

    return li;
  }

  createNodeSpan(node, parentIds, isMaxDepth) {
    const nodeSpan = document.createElement("span");
    const currentFocus = this.callbacks.getFocus();

    // Set focused node ID
    if (node.id === currentFocus.id) {
      nodeSpan.id = "focused-node";
    }

    // Add data attribute for node identification
    nodeSpan.setAttribute("data-node-id", node.id);

    // Add base classes
    nodeSpan.classList.add(`type-${node.type}`);

    // Add conditional classes
    if (parentIds && parentIds.includes(node.id)) {
      nodeSpan.classList.add("parent-of-focused");
    }

    if (node.rating === true || node.rating === false) {
      nodeSpan.classList.add(node.rating ? "upvoted" : "downvoted");
    }

    if (isMaxDepth && node.children && node.children.length > 0) {
      nodeSpan.classList.add("hidden-children");
    }

    return nodeSpan;
  }

  createNodeLink(node, index) {
    const link = document.createElement("a");

    // Special treatment for Root Node
    if (node.id === "1") {
      link.textContent = "🌳 Start Here";
      link.classList.add("root-node-link");
      link.title = "Root Node - Start Here";

      link.onclick = event => {
        event.stopPropagation();
        this.onNodeClick(node.id);
      };

      return link;
    }

    const displayText = (node.summary || "").trim() || `Option ${index}`;

    const statusSpan = this.createStatusSpan(node);
    const ratingSpan = this.createRatingSpan(node);

    // Add author span for user nodes
    if (node.type === "user") {
      const authorSpan = document.createElement("span");
      authorSpan.classList.add("author-indicator");
      authorSpan.textContent = "👤 ";
      link.appendChild(authorSpan);
    }

    const textSpan = document.createElement("span");
    textSpan.textContent = displayText;

    // Make new/unread nodes heavy medium weight and italic
    if (!node.read) {
      textSpan.classList.add("unread-node");
    }

    link.appendChild(statusSpan);
    link.appendChild(ratingSpan);
    link.appendChild(textSpan);

    // Add subtree badge if node has children (after text span so it stays visible)
    if (node.children && node.children.length > 0) {
      const badgeSpan = this.createSubtreeBadge(node);
      link.appendChild(badgeSpan);
    }

    link.title = `${index}. ${displayText}`;

    link.onclick = event => {
      event.stopPropagation();
      this.onNodeClick(node.id);
    };

    return link;
  }

  createStatusSpan(node) {
    const statusSpan = document.createElement("span");
    statusSpan.classList.add("node-status");

    // Determine status
    if (node.error) {
      statusSpan.classList.add("status-error");
      statusSpan.textContent = "⚠️";
      statusSpan.title = `Error: ${node.error}`;
    } else if (node.generationPending) {
      statusSpan.classList.add("status-pending");
      statusSpan.textContent = "🎲";
      statusSpan.title = "Generation in progress...";
    } else if (!node.read) {
      statusSpan.classList.add("status-unread");
      statusSpan.textContent = "🆕";
      statusSpan.title = "Unread node";
    } else {
      statusSpan.classList.add("status-normal");
      statusSpan.textContent = "";
    }

    return statusSpan;
  }

  createRatingSpan(node) {
    const ratingSpan = document.createElement("span");
    ratingSpan.classList.add("node-rating");

    if (node.rating === true) {
      ratingSpan.classList.add("rating-star");
      ratingSpan.textContent = "👍";
      ratingSpan.title = "Thumbs up";
    } else if (node.rating === false) {
      ratingSpan.classList.add("rating-no");
      ratingSpan.textContent = "👎";
      ratingSpan.title = "Thumbs down";
    } else {
      ratingSpan.classList.add("rating-none");
      ratingSpan.textContent = "";
    }

    return ratingSpan;
  }

  createSubtreeBadge(node) {
    const badgeSpan = document.createElement("span");
    badgeSpan.classList.add("subtree-badge");

    // Add red class if there are unread child nodes
    if (node.treeStats.unreadChildNodes > 0) {
      badgeSpan.classList.add("subtree-badge-unread");
    }

    // Use the pre-calculated totalChildNodes from treeStats
    const totalSubtreeNodes = node.treeStats.totalChildNodes;

    badgeSpan.textContent = ` ${totalSubtreeNodes}`;
    badgeSpan.title = `${node.children.length} immediate children, ${totalSubtreeNodes} total nodes in subtree${node.treeStats.unreadChildNodes > 0 ? `, ${node.treeStats.unreadChildNodes} unread` : ""}`;

    return badgeSpan;
  }

  createCompressedChildrenLi(node) {
    const li = document.createElement("li");
    const span = document.createElement("span");

    span.classList.add("compressed-children-indicator");
    span.classList.add("tree-node");

    const link = document.createElement("a");
    const count = node.children.length;
    const text = count === 1 ? "1 child node" : `${count} child nodes`;
    link.innerHTML = `[${text}]`;
    link.title = `Click to expand and show ${count} child node${count > 1 ? "s" : ""}`;
    link.classList.add("compressed-children-link");

    link.onclick = event => {
      event.stopPropagation();
      this.onNodeClick(node.id);
    };

    span.appendChild(link);
    li.appendChild(span);

    return li;
  }

  createHiddenParentsLi(hiddenParentIds) {
    const li = document.createElement("li");
    const span = document.createElement("span");

    span.classList.add("hidden-parents-indicator");
    span.classList.add("tree-node");

    const link = document.createElement("a");
    const count = hiddenParentIds.length;
    const text =
      count === 1 ? "1 parent node above" : `${count} parent nodes above`;
    link.innerHTML = `⬆️ [${text}]`;
    link.title = `Click to expand and show ${count} parent node${count > 1 ? "s" : ""}`;
    link.classList.add("hidden-parents-link");

    link.onclick = event => {
      event.stopPropagation();
      this.expandHiddenParents(hiddenParentIds, li);
    };

    span.appendChild(link);
    li.appendChild(span);

    return li;
  }

  updateTreeView() {
    this.loomTreeView.innerHTML = "";
    const currentFocus = this.callbacks.getFocus();
    this.renderTree(currentFocus, this.loomTreeView);
  }

  // Update tree view when node status changes
  updateNodeStatus(nodeId) {
    // Find the node element in the tree and update its status
    const nodeElements = this.loomTreeView.querySelectorAll(
      `[data-node-id="${nodeId}"]`
    );
    if (nodeElements.length > 0) {
      // If the node is visible in the tree, update the whole tree view
      this.updateTreeView();
    }
  }

  expandHiddenParents(hiddenParentIds, indicatorLi) {
    const loomTree = this.callbacks.getLoomTree();

    // Create a container for the expanded parents
    const expandedContainer = document.createElement("div");
    expandedContainer.classList.add("expanded-parents-container");

    // Create the parent nodes in reverse order (highest to lowest)
    for (let i = hiddenParentIds.length - 1; i >= 0; i--) {
      const parentId = hiddenParentIds[i];
      const parentNode = loomTree.nodeStore[parentId];

      if (parentNode) {
        const parentLi = this.createTreeLi(parentNode, 1, false, []);
        parentLi.classList.add("expanded-parent-node");
        expandedContainer.appendChild(parentLi);
      }
    }

    // Replace the indicator with the expanded parents
    indicatorLi.innerHTML = "";
    indicatorLi.appendChild(expandedContainer);
    indicatorLi.classList.add("expanded");
  }

  hide() {
    this.loomTreeView.style.display = "none";
  }

  show() {
    this.loomTreeView.style.display = "block";
  }
}

// Export the TreeNav class
window.TreeNav = TreeNav;
