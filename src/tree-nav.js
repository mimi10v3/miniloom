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
    const loomTree = this.callbacks.getLoomTree();

    // Move up 2 parents to show context around the focused node
    for (let i = 0; i < 2; i++) {
      if (node.parent === null) {
        break; // Stop at root node
      }
      parentIds.push(node.parent);
      node = loomTree.nodeStore[node.parent];
    }

    const ul = document.createElement("ul");
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

    container.appendChild(childrenUl);
  }

  createTreeLi(node, index, isMaxDepth, parentIds) {
    const li = document.createElement("li");
    const nodeSpan = this.createNodeSpan(node, parentIds, isMaxDepth);
    const link = this.createNodeLink(node, index);
    const thumbSpan = this.createThumbSpan(node);

    nodeSpan.appendChild(link);
    nodeSpan.appendChild(thumbSpan);
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

    // Add base classes
    nodeSpan.classList.add(node.read ? "read-tree-node" : "unread-tree-node");
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
    const displayText = (node.summary || "").trim() || `Option ${index}`;

    link.textContent = displayText;
    link.title = `${index}. ${displayText}`;

    link.onclick = event => {
      event.stopPropagation();
      this.onNodeClick(node.id);
    };

    return link;
  }

  createThumbSpan(node) {
    const thumbSpan = document.createElement("span");
    thumbSpan.classList.add("tree-thumb");

    if (node.rating === true) {
      thumbSpan.classList.add("thumb-up");
      thumbSpan.textContent = " 👍";
    } else if (node.rating === false) {
      thumbSpan.classList.add("thumb-down");
      thumbSpan.textContent = " 👎";
    }

    return thumbSpan;
  }

  updateTreeView() {
    this.loomTreeView.innerHTML = "";
    const currentFocus = this.callbacks.getFocus();
    this.renderTree(currentFocus, this.loomTreeView);
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
