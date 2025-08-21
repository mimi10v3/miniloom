const fs = require("fs");
const path = require("path");
const { ipcRenderer } = require("electron");
const DiffMatchPatch = require("diff-match-patch");
const dmp = new DiffMatchPatch();
const MiniSearch = require("minisearch");

const settingUseWeave = document.getElementById("use-weave");
const settingNewTokens = document.getElementById("new-tokens");
const settingBudget = document.getElementById("budget");
const context = document.getElementById("context");
const editor = document.getElementById("editor");
const promptTokenCounter = document.getElementById("prompt-token-counter");
const saveBtn = document.getElementById("save");
const loadBtn = document.getElementById("load");
const errorMessage = document.getElementById("error-message");

class Node {
  constructor(id, type, parent, patch, summary) {
    this.id = id;
    this.timestamp = Date.now();
    this.type = type;
    this.patch = patch;
    this.summary = summary;
    this.cache = false;
    this.rating = null;
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
    if (newNode.type == "user") {
      newNode.read = true;
    }
    parent.children.push(newNodeId);
    this.nodeStore[newNodeId] = newNode;
    return newNode;
  }

  updateNode(node, text, summary) {
    // Update a user written leaf
    if (node.type == "gen") {
      return;
    } else if (node.children.length > 0) {
      return;
    }
    const parent = this.nodeStore[node.parent];
    const parentRenderedText = this.renderNode(parent);
    const patch = dmp.patch_make(parentRenderedText, text);
    node.timestamp = Date.now();
    node.patch = patch;
    node.summary = summary;
  }

  renderNode(node) {
    if (node == this.root) {
      return "";
    }
    if (node.cache) {
      return node.cache;
    }
    const patches = [];
    patches.push(node.patch);
    const cacheNode = node;
    while (node.parent !== null) {
      node = this.nodeStore[node.parent];
      patches.push(node.patch);
    }
    patches.reverse();
    var outText = "";
    for (let patch of patches) {
      if (patch == "") {
        continue;
      }
      var [outText, results] = dmp.patch_apply(patch, outText);
    }
    /* Disable cache: Not worth the filesize increase
	if (cacheNode.children.length > 0) {
	    cacheNode.cache = outText;
	}
	*/
    return outText;
  }

  serialize(node = this.root) {
    return JSON.stringify(this._serializeHelper(node), null, 2);
  }

  _serializeHelper(node) {
    const serializedChildren = node.children.map(child =>
      this._serializeHelper(this.nodeStore[child])
    );
    return {
      timestamp: node.timestamp,
      type: node.type,
      patch: node.patch,
      rating: node.rating,
      children: serializedChildren,
    };
  }
}

const MAX_PARENTS = 2;
const MAX_CHILDREN = 5;

function renderTree(node, container) {
  let parentIds = [];
  for (let i = 0; i < MAX_PARENTS; i++) {
    if (node.parent === null) {
      break; // Stop at root node
    }
    parentIds.push(node.parent);
    node = loomTree.nodeStore[node.parent];
  }

  const ul = document.createElement("ul");
  const li = createTreeLi(node, 1, false, parentIds);
  if (node.parent) {
    li.classList.add("hidden-parents");
  }
  ul.appendChild(li);
  renderChildren(node, li, MAX_CHILDREN, parentIds);
  container.appendChild(ul);
}

function renderChildren(node, container, maxChildrenDepth, parentIds) {
  if (maxChildrenDepth <= 0) return; // Stop recursion when maxChildrenDepth reaches 0 or there are no children
  if (node.children.length == 0) return;

  const childrenUl = document.createElement("ul");
  for (let i = 0; i < node.children.length; i++) {
    const child = loomTree.nodeStore[node.children[i]];
    const li = createTreeLi(child, i + 1, maxChildrenDepth <= 1, parentIds);
    childrenUl.appendChild(li);
    renderChildren(child, li, maxChildrenDepth - 1, parentIds);
  }
  container.appendChild(childrenUl);
}

function createTreeLi(node, index, isMaxDepth, parentIds) {
  // todo: consider using up/down votes to adjust max depth of children displayed
  // todo: consider adding a die icon for generation in progress / an error icon if it fails

  const li = document.createElement("li");
  const nodeSpan = document.createElement("span");

  if (node.id == focus.id) {
    nodeSpan.id = "focused-node";
  }
  nodeSpan.classList.add(node.read ? "read-tree-node" : "unread-tree-node");
  nodeSpan.classList.add("type-" + node.type);

  if (parentIds && parentIds.includes(node.id)) {
    nodeSpan.classList.add("parent-of-focused");
  }
  if (node.rating === true || node.rating === false) {
    nodeSpan.classList.add(node.rating ? "upvoted" : "downvoted");
  }
  if (isMaxDepth && node.children && node.children.length > 0) {
    nodeSpan.classList.add("hidden-children");
  }

  const link = document.createElement("a");
  link.textContent = (node.summary || "").trim() || "Option " + index;
  link.title = index + ". " + link.textContent;

  link.onclick = event => {
    event.stopPropagation(); // Stop event bubbling
    changeFocus(node.id);
  };

  // Add thumb span for rating display
  const thumbSpan = document.createElement("span");
  thumbSpan.classList.add("tree-thumb");
  if (node.rating === true) {
    thumbSpan.classList.add("thumb-up");
    thumbSpan.textContent = " 👍";
  } else if (node.rating === false) {
    thumbSpan.classList.add("thumb-down");
    thumbSpan.textContent = " 👎";
  }

  // Put both link and thumb inside the link so they're part of the selection
  link.appendChild(thumbSpan);
  nodeSpan.append(link);
  li.append(nodeSpan);
  return li;
}

var loomTree = new LoomTree();
const loomTreeView = document.getElementById("loom-tree-view");
let focus = loomTree.nodeStore["1"];
renderTree(loomTree.root, loomTreeView);

function renderTick() {
  editor.value = "";
  var next = focus;
  editor.value = loomTree.renderNode(next);

  let parent;
  let selection;
  let batchLimit;
  if (focus.parent) {
    parent = loomTree.nodeStore[focus.parent];
    selection = parent.children.indexOf(focus.id);
    batchLimit = parent.children.length - 1;
  } else {
    selection = 0;
    batchLimit = 0;
  }

  const batchIndexMarker = document.getElementById("batch-item-index");
  batchIndexMarker.textContent = `${selection + 1}/${batchLimit + 1}`;

  const controls = document.getElementById("controls");

  const oldBranchControlsDiv = document.getElementById(
    "prompt-branch-controls"
  );
  if (oldBranchControlsDiv) {
    oldBranchControlsDiv.innerHTML = "";
    oldBranchControlsDiv.remove();
  }

  const branchControlsDiv = document.createElement("div");
  branchControlsDiv.id = "prompt-branch-controls";
  branchControlsDiv.classList.add("branch-controls");

  const branchControlButtonsDiv = document.createElement("div");
  branchControlButtonsDiv.classList.add("branch-control-buttons");

  var leftThumbClass = "thumbs";
  var rightThumbClass = "thumbs";
  if (focus.rating) {
    leftThumbClass = "chosen";
  } else if (focus.rating == false) {
    rightThumbClass = "chosen";
  }

  const leftThumbSpan = document.createElement("span");
  leftThumbSpan.classList.add(leftThumbClass);
  leftThumbSpan.textContent = "👍";
  leftThumbSpan.onclick = () => promptThumbsUp(focus.id);

  const rightThumbSpan = document.createElement("span");
  rightThumbSpan.classList.add(rightThumbClass);
  rightThumbSpan.textContent = "👎";
  rightThumbSpan.onclick = () => promptThumbsDown(focus.id);

  branchControlButtonsDiv.append(leftThumbSpan, rightThumbSpan);

  // TODO: re-enable or remove this feature
  if (focus.type === "user") {
    //    branchControlButtonsDiv.append(rewriteButton);
  }

  // Generate button is now in HTML, just update its click handler
  const generateButton = document.getElementById("generate-button");
  if (generateButton) {
    generateButton.onclick = () => reroll(focus.id, false);
  }

  if (focus.type === "weave") {
    const branchScoreSpan = document.createElement("span");
    branchScoreSpan.classList.add("reward-score");
    try {
      const score = focus["nodes"].at(-1).score;
      const prob = 1 / (Math.exp(-score) + 1);
      branchScoreSpan.textContent = (prob * 100).toPrecision(4) + "%";
    } catch (error) {
      branchScoreSpan.textContent = "N.A.";
    }
    branchControlsDiv.append(branchControlButtonsDiv, branchScoreSpan);
  } else {
    branchControlsDiv.append(branchControlButtonsDiv);
  }

  controls.append(branchControlsDiv);

  focus.read = true;
  loomTreeView.innerHTML = "";
  renderTree(focus, loomTreeView);
  errorMessage.textContent = "";
  updateCounterDisplay(editor.value);
  updateThumbState();
}

function rotate(direction) {
  const parent = responseDict[focus.parent];
  const selection = parent.children.indexOf(focus.id);
  if (direction === "left" && selection > 0) {
    focus = responseDict[parent.children[selection - 1]];
  } else if (direction === "right" && selection < parent.children.length - 1) {
    focus = responseDict[parent.children[selection + 1]];
  }
  renderResponses();
}

function changeFocus(newFocusId) {
  focus = loomTree.nodeStore[newFocusId];
  // Prevent focus change from interrupting users typing
  if (focus.type === "user" && focus.children.length == 0) {
    loomTreeView.innerHTML = "";
    renderTree(focus, loomTreeView);
    updateThumbState();
  } else {
    renderTick();
    editor.selectionStart = editor.value.length;
    editor.selectionEnd = editor.value.length;
    editor.focus();
    // Ensure thumb state is updated after renderTick
    setTimeout(() => updateThumbState(), 0);
  }
}

function prepareRollParams() {
  const serviceSelector = document.getElementById("service-selector");
  const samplerSelector = document.getElementById("sampler-selector");
  const apiKeySelector = document.getElementById("api-key-selector");

  // Get selected service, sampler, and API key
  const selectedServiceName = serviceSelector ? serviceSelector.value : "";
  const selectedSamplerName = samplerSelector ? samplerSelector.value : "";
  const selectedApiKeyName = apiKeySelector ? apiKeySelector.value : "";

  // Get service data
  let serviceData = {};
  if (
    selectedServiceName &&
    samplerSettingsStore &&
    samplerSettingsStore.services
  ) {
    serviceData = samplerSettingsStore.services[selectedServiceName] || {};
  }

  // Get sampler data
  let samplerData = {};
  if (
    selectedSamplerName &&
    samplerSettingsStore &&
    samplerSettingsStore.samplers
  ) {
    samplerData = samplerSettingsStore.samplers[selectedSamplerName] || {};
  }

  // Get API key
  let apiKey = "";
  if (
    selectedApiKeyName &&
    samplerSettingsStore &&
    samplerSettingsStore["api-keys"]
  ) {
    apiKey = samplerSettingsStore["api-keys"][selectedApiKeyName] || "";
  }

  const params = {
    // Service parameters
    "sampling-method": serviceData["sampling-method"] || "base",
    "api-url": serviceData["service-api-url"] || "",
    "model-name": serviceData["service-model-name"] || "",
    "api-delay": parseInt(serviceData["service-api-delay"]) || 3000,
    "api-key": apiKey,

    // Sampler parameters
    "output-branches": parseInt(samplerData["output-branches"]) || 2,
    "tokens-per-branch": parseInt(samplerData["tokens-per-branch"]) || 256,
    temperature: parseFloat(samplerData["temperature"]) || 0.9,
    "top-p": parseFloat(samplerData["top-p"]) || 1,
    "top-k": parseInt(samplerData["top-k"]) || 100,
    "repetition-penalty": parseFloat(samplerData["repetition-penalty"]) || 1,
  };

  // Debug logging
  console.log("prepareRollParams:", {
    selectedServiceName,
    selectedSamplerName,
    selectedApiKeyName,
    apiKey: apiKey ? "***" : "EMPTY",
    apiUrl: params["api-url"],
    modelName: params["model-name"],
    serviceData,
    samplerData,
    samplerSettingsStore: samplerSettingsStore ? "exists" : "null",
  });

  return params;
}

async function getResponses(
  endpoint,
  {
    prompt,
    weave = true,
    weaveParams = {},
    focusId = null,
    includePrompt = false,
  }
) {
  let wp = weaveParams;
  if (focusId) {
    loomTree.renderNode(loomTree.nodeStore[focusId]);
  }
  if (weave) {
    endpoint = endpoint + "weave";
  } else {
    endpoint = endpoint + "generate";
  }

  r = await fetch(endpoint, {
    method: "POST",
    body: JSON.stringify({
      prompt: prompt,
      prompt_node: includePrompt,
      tokens_per_branch: wp["tokens_per_branch"],
      output_branches: wp["output_branches"],
    }),
    headers: {
      "Content-type": "application/json; charset=UTF-8",
    },
  });
  batch = await r.json();
  return batch;
}

async function getSummary(taskText) {
  const params = prepareRollParams();
  const endpoint = params["api-url"];
  const summarizePromptPath = path.join(__dirname, "prompts", "summarize.txt");
  const summarizePromptTemplate = fs.readFileSync(summarizePromptPath, "utf8");
  const summarizePrompt = summarizePromptTemplate.replace(
    "{MODEL_NAME}",
    params["model-name"]
  );
  // Limit context to 8 * 512, where eight is the average number of letters in a word
  // and 512 is the number of words to summarize over
  // otherwise we eventually end up pushing the few shot prompt out of the context window
  const prompt =
    summarizePrompt +
    "\n\n" +
    "<tasktext>\n" +
    taskText.slice(-4096) +
    "\n</tasktext>\n\nThree Words:";
  // TODO: Flip this case around
  if (
    !["together", "openrouter", "openai", "openai-chat"].includes(
      params["sampling-method"]
    )
  ) {
    r = await fetch(endpoint + "generate", {
      method: "POST",
      body: JSON.stringify({
        prompt: prompt,
        prompt_node: true,
        evaluationPrompt: "",
        tokens_per_branch: 10,
        output_branches: 1,
      }),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    });
    let batch = await r.json();
    // Always get last three words
    return batch[1]["text"]
      .trim()
      .split("\n")[0]
      .split(" ")
      .slice(0, 3)
      .join(" ");
  } // TODO: Figure out how I might have to change this if I end up supporting
  // multiple APIs
  else if (params["sampling-method"] == "openai-chat") {
    r = await fetch(endpoint, {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "system", content: prompt }],
        model: params["model-name"],
        max_tokens: 10,
        temperature: params["temperature"],
        top_p: params["top-p"],
        top_k: params["top-k"],
        repetition_penalty: params["repetition-penalty"],
      }),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    });
    let batch = await r.json();
    return batch.choices[0]["message"]["content"]
      .trim()
      .split("\n")[0]
      .split(" ")
      .slice(0, 3)
      .join(" ");
  } else {
    const tp = {
      "api-key": params["api-key"],
      "output-branches": 1,
      "model-name": params["model-name"],
      "tokens-per-branch": 10,
      temperature: params["temperature"],
      "top-p": params["top-p"],
      "top-k": params["top-k"],
      repetition_penalty: params["repetition-penalty"],
    };
    let batch;
    if (params["sampling-method"] === "openai") {
      batch = await togetherGetResponses({
        endpoint: endpoint,
        prompt: prompt,
        togetherParams: tp,
        openai: true,
      });
    } else {
      batch = await togetherGetResponses({
        endpoint: endpoint,
        prompt: prompt,
        togetherParams: tp,
      });
    }
    return batch[0]["text"]
      .trim()
      .split("\n")[0]
      .split(" ")
      .slice(0, 3)
      .join(" ");
  }
}

async function rewriteNode(id) {
  const endpoint = document.getElementById("api-url").value;
  const rewriteNodePrompt = document.getElementById("rewrite-node-prompt");
  const rewritePromptPath = path.join(__dirname, "prompts", "rewrite.txt");
  const rewritePrompt = fs.readFileSync(rewritePromptPath, "utf8");
  const rewriteFeedback = rewriteNodePrompt.value;
  const rewriteContext = editor.value;

  // TODO: Add new endpoint? Make tokenizer that returns to client?
  // Could also make dedicated rewriteNode endpoint
  let tokens = document.getElementById("tokens-per-branch").value;
  const outputBranches = document.getElementById("output-branches").value;

  // Make sure we don't give too much or too little context
  // TODO: Change this once models have longer context/are less limited
  if (tokens < 256) {
    tokens = 256;
  } else if (tokens > 512) {
    tokens = 512;
  }

  let prompt = rewritePrompt.trim();
  prompt += rewriteContext.slice(-(tokens * 8)).trim();
  prompt += "\n\n";
  prompt += "Rewrite the text using the following feedback:\n";
  prompt += rewriteFeedback;
  prompt += "<|end|>";

  diceSetup();
  r = await fetch(endpoint + "generate", {
    method: "POST",
    body: JSON.stringify({
      prompt: prompt,
      prompt_node: false,
      adapter: "evaluator",
      evaluationPrompt: "",
      tokens_per_branch: tokens,
      output_branches: outputBranches,
    }),
    headers: {
      "Content-type": "application/json; charset=UTF-8",
    },
  });
  let batch = await r.json();
  console.log(batch);

  const focusParent = loomTree.nodeStore[focus.parent];
  const focusParentText = loomTree.renderNode(focusParent);
  for (i = 0; i < batch.length; i++) {
    let response = batch[i];
    let summary = await getSummary(response["text"]);
    const responseNode = loomTree.createNode(
      "rewrite",
      focus,
      focusParentText + response["text"],
      summary
    );
    loomTree.nodeStore[responseNode.id]["feedback"] = rewriteFeedback;
    loomTree.nodeStore[responseNode.id]["rewritePrompt"] = prompt;
    loomTree.nodeStore[responseNode.id]["model"] = response["base_model"];
  }
  const chatPane = document.getElementById("chat-pane");
  chatPane.innerHTML = "";
  diceTeardown();
  renderTick();
}

function promptRewriteNode(id) {
  const rewriteNodeLabel = document.createElement("label");
  rewriteNodeLabel.for = "rewrite-node-prompt";
  rewriteNodeLabel.textContent = "Rewrite Node From Feedback";
  const rewriteNodePrompt = document.createElement("textarea");
  rewriteNodePrompt.id = "rewrite-node-prompt";
  rewriteNodePrompt.value = "";
  rewriteNodePrompt.placeholder =
    "Write 3-5 bulletpoints of feedback to rewrite the node with.";
  const rewriteNodeSubmit = document.createElement("input");
  rewriteNodeSubmit.id = "rewrite-node-submit";
  rewriteNodeSubmit.type = "button";
  rewriteNodeSubmit.value = "Submit";
  rewriteNodeSubmit.onclick = () => rewriteNode(focus.id);

  const chatPane = document.getElementById("chat-pane");
  chatPane.append(rewriteNodeLabel, rewriteNodePrompt, rewriteNodeSubmit);
}

function promptThumbsUp(id) {
  const thumbUp = document.getElementById("thumb-up");
  const thumbDown = document.getElementById("thumb-down");

  // If already selected, unselect it
  if (loomTree.nodeStore[id].rating === true) {
    loomTree.nodeStore[id].rating = null;
    thumbUp.classList.remove("chosen");
  } else {
    // Select this one and unselect the other
    loomTree.nodeStore[id].rating = true;
    thumbUp.classList.add("chosen");
    thumbDown.classList.remove("chosen");
  }

  // Update tree view to reflect the rating change
  const loomTreeView = document.getElementById("loom-tree-view");
  if (loomTreeView) {
    loomTreeView.innerHTML = "";
    renderTree(focus, loomTreeView);
  }
}

function promptThumbsDown(id) {
  const thumbUp = document.getElementById("thumb-up");
  const thumbDown = document.getElementById("thumb-down");

  // If already selected, unselect it
  if (loomTree.nodeStore[id].rating === false) {
    loomTree.nodeStore[id].rating = null;
    thumbDown.classList.remove("chosen");
  } else {
    // Select this one and unselect the other
    loomTree.nodeStore[id].rating = false;
    thumbDown.classList.add("chosen");
    thumbUp.classList.remove("chosen");
  }

  // Update tree view to reflect the rating change
  const loomTreeView = document.getElementById("loom-tree-view");
  if (loomTreeView) {
    loomTreeView.innerHTML = "";
    renderTree(focus, loomTreeView);
  }
}

function updateThumbState() {
  const thumbUp = document.getElementById("thumb-up");
  const thumbDown = document.getElementById("thumb-down");
  if (thumbUp && thumbDown) {
    thumbUp.classList.remove("chosen");
    thumbDown.classList.remove("chosen");
    if (focus.rating === true) {
      thumbUp.classList.add("chosen");
    } else if (focus.rating === false) {
      thumbDown.classList.add("chosen");
    }
  }
}

function diceSetup() {
  editor.readOnly = true;
  const die = document.getElementById("die");
  if (die) {
    die.classList.add("rolling");
  }
}

function diceTeardown() {
  editor.readOnly = false;
  const die = document.getElementById("die");
  if (die) {
    die.classList.remove("rolling");
  }
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function togetherGetResponses({
  endpoint,
  prompt,
  togetherParams = {},
  api = "openai",
}) {
  const tp = togetherParams;
  const auth_token = "Bearer " + tp["api-key"];
  const apiDelay = Number(tp["delay"]);

  // Debug logging
  console.log("togetherGetResponses called with:", {
    endpoint,
    api,
    auth_token: tp["api-key"] ? "Bearer ***" : "NO API KEY",
    model: tp["model-name"],
    prompt_length: prompt.length,
  });

  let batch_promises = [];
  // Together doesn't let you get more than one completion at a time
  // But OpenAI expects you to use the n parameter
  let calls = api === "openai" ? 1 : tp["output-branches"];
  for (let i = 1; i <= calls; i++) {
    const body = {
      model: tp["model-name"],
      prompt: prompt,
      max_tokens: Number(tp["tokens-per-branch"]),
      n: api === "openai" ? Number(tp["output-branches"]) : 1,
      temperature: Number(tp["temperature"]),
      top_p: Number(tp["top-p"]),
      top_k: Number(tp["top-k"]),
      repetition_penalty: Number(tp["repetition_penalty"]),
    };
    if (api === "openrouter") {
      body["provider"] = {};
      body["provider"]["require_parameters"] = true;
    }

    console.log("Making API request to:", endpoint);
    console.log("Request body:", body);

    const promise = delay(apiDelay * i)
      .then(async () => {
        let r = await fetch(endpoint, {
          method: "POST",
          body: JSON.stringify(body),
          headers: {
            accept: "application/json",
            "Content-type": "application/json; charset=UTF-8",
            Authorization: auth_token,
          },
        });

        console.log("API response status:", r.status);
        console.log(
          "API response headers:",
          Object.fromEntries(r.headers.entries())
        );

        if (!r.ok) {
          const errorText = await r.text();
          console.error("API error response:", errorText);
          throw new Error(`API request failed: ${r.status} ${r.statusText}`);
        }

        return r.json();
      })
      .then(response_json => {
        console.log("API response JSON:", response_json);
        let outs = [];
        let choices_length;
        if (api === "openai") {
          choices_length = response_json["choices"].length;
        } else if (api === "openrouter") {
          choices_length = response_json["choices"].length;
        } else {
          choices_length = response_json["output"]["choices"].length;
        }
        for (let i = 0; i < choices_length; i++) {
          if (api === "openai") {
            outs.push({
              text: response_json["choices"][i]["text"],
              model: response_json["model"],
            });
          } else if (api === "openrouter") {
            outs.push({
              text: response_json["choices"][i]["text"],
              model: response_json["model"],
            });
          } else {
            outs.push({
              text: response_json["output"]["choices"][i]["text"],
              model: response_json["model"],
            });
          }
        }
        if (api === "openai") {
          return outs;
        } else {
          return outs[0];
        }
      });
    batch_promises.push(promise);
  }
  let batch;
  if (api === "openai") {
    batch = await Promise.all(batch_promises);
    batch = batch[0];
  } else {
    batch = await Promise.all(batch_promises);
  }
  return batch;
}

async function reroll(id, weave = true) {
  const params = prepareRollParams();
  if (params["sampling-method"] === "base") {
    // Use togetherRoll for base method
    togetherRoll(id, "base");
  } else if (params["sampling-method"] === "vae-guided") {
    // vae-guided not implemented, fall back to base
    togetherRoll(id, "base");
  } else if (params["sampling-method"] === "together") {
    togetherRoll(id, "together");
  } else if (params["sampling-method"] === "openrouter") {
    togetherRoll(id, "openrouter");
  } else if (params["sampling-method"] === "openai") {
    togetherRoll(id, "openai");
  } else if (params["sampling-method"] === "openai-chat") {
    await openaiChatCompletionsRoll(id);
  } else {
    // Default fallback
    togetherRoll(id, "base");
  }
}

function readFileAsJson(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const json = JSON.parse(e.target.result);
        resolve(json);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => {
      reject(new Error("Error reading the file"));
    };
    reader.readAsText(file);
  });
}

async function togetherRoll(id, api = "openai") {
  diceSetup();
  await autoSaveTick();
  await updateFocusSummary();
  const rollFocus = loomTree.nodeStore[id];
  const lastChildIndex =
    rollFocus.children.length > 0 ? rollFocus.children.length - 1 : null;
  let prompt = loomTree.renderNode(rollFocus);
  const params = prepareRollParams();

  const apiDelay = params["api-delay"];
  const tp = {
    "api-key": params["api-key"],
    "model-name": params["model-name"],
    "output-branches": params["output-branches"],
    "tokens-per-branch": params["tokens-per-branch"],
    temperature: params["temperature"],
    "top-p": params["top-p"],
    "top-k": params["top-k"],
    repetition_penalty: params["repetition-penalty"],
    delay: apiDelay,
  };
  let newResponses;
  try {
    newResponses = await togetherGetResponses({
      endpoint: params["api-url"],
      prompt: prompt,
      togetherParams: tp,
      api: api,
    });
  } catch (error) {
    diceTeardown();
    errorMessage.textContent = "Error: " + error.message;
    console.warn(error);
    throw error;
  }
  for (let i = 0; i < newResponses.length; i++) {
    response = newResponses[i];
    const responseSummary = await delay(apiDelay).then(() => {
      return getSummary(response["text"]);
    });
    const childText = loomTree.renderNode(rollFocus) + response["text"];
    const responseNode = loomTree.createNode(
      "gen",
      rollFocus,
      childText,
      responseSummary
    );
    loomTree.nodeStore[responseNode.id]["model"] = response["model"];
  }
  // Focus on the first newly generated response, but only if we're still on the same node
  if (focus === rollFocus) {
    if (lastChildIndex === null) {
      // No children before, focus on the first one
      focus = loomTree.nodeStore[rollFocus.children[0]];
    } else {
      // Focus on the first new child (lastChildIndex + 1)
      focus = loomTree.nodeStore[rollFocus.children[lastChildIndex + 1]];
    }
  }
  diceTeardown();
  renderTick();
}

// Add this function for OpenAI Chat Completions API calls
async function openaiChatCompletionsRoll(id) {
  diceSetup();
  await autoSaveTick();
  await updateFocusSummary();
  const rollFocus = loomTree.nodeStore[id];
  const lastChildIndex =
    rollFocus.children.length > 0 ? rollFocus.children.length - 1 : null;
  let promptText = loomTree.renderNode(rollFocus);
  const params = prepareRollParams();

  try {
    // Parse the JSON from the editor
    let chatData = JSON.parse(promptText);

    if (!chatData.messages || !Array.isArray(chatData.messages)) {
      throw new Error("Invalid chat format: messages array not found");
    }

    const apiKey = params["api-key"];
    const modelName = params["model-name"];
    const temperature = parseFloat(params["temperature"]);
    const topP = parseFloat(params["top-p"]);
    const outputBranches = parseInt(params["output-branches"]);
    const tokensPerBranch = parseInt(params["tokens-per-branch"]);

    // Prepare the API request
    const requestBody = {
      model: modelName,
      messages: chatData.messages,
      max_tokens: tokensPerBranch,
      temperature: temperature,
      top_p: topP,
      n: outputBranches,
    };

    // Make the API call
    const response = await fetch(params["api-url"], {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `OpenAI API Error: ${errorData.error?.message || response.statusText}`
      );
    }

    const responseData = await response.json();

    // Process each choice (for multiple outputs)
    for (let i = 0; i < responseData.choices.length; i++) {
      const choice = responseData.choices[i];
      const assistantMessage = choice.message;

      // Create a new chat data object with the assistant's response
      const newChatData = JSON.parse(JSON.stringify(chatData)); // Deep clone
      newChatData.messages.push({
        role: assistantMessage.role,
        content: assistantMessage.content,
      });

      const newChatText = JSON.stringify(newChatData, null, 2);

      // Generate a summary for the new node
      const summary = await getSummary(
        assistantMessage.content || "Assistant response"
      );

      // Create the new node
      const responseNode = loomTree.createNode(
        "gen",
        rollFocus,
        newChatText,
        summary
      );

      // Store metadata
      loomTree.nodeStore[responseNode.id]["model"] = responseData.model;
      loomTree.nodeStore[responseNode.id]["usage"] = responseData.usage;
      loomTree.nodeStore[responseNode.id]["finish_reason"] =
        choice.finish_reason;
    }

    // Focus on the first newly generated response, but only if we're still on the same node
    if (focus === rollFocus) {
      if (lastChildIndex === null) {
        // No children before, focus on the first one
        focus = loomTree.nodeStore[rollFocus.children[0]];
      } else {
        // Focus on the first new child (lastChildIndex + 1)
        focus = loomTree.nodeStore[rollFocus.children[lastChildIndex + 1]];
      }
    }
  } catch (error) {
    diceTeardown();
    errorMessage.textContent = "Error: " + error.message;
    console.error("OpenAI Chat Completions Error:", error);
    return;
  }

  diceTeardown();
  renderTick();
}

function countCharacters(text) {
  return text.length;
}

function countWords(text) {
  return text
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0).length;
}

function updateCounterDisplay(text) {
  const charCount = countCharacters(text);
  const wordCount = countWords(text);

  promptTokenCounter.innerText = `${wordCount} Words (${charCount} Characters)`;
}

var secondsSinceLastTyped = 0;
var updatingNode = false;

editor.addEventListener("input", async e => {
  const prompt = editor.value;
  // Autosave users work when writing next prompt
  if (
    focus.children.length > 0 ||
    ["gen", "rewrite", "root"].includes(focus.type)
  ) {
    const child = loomTree.createNode("user", focus, prompt, "New Node");
    changeFocus(child.id);
  }
});

editor.addEventListener("keydown", async e => {
  secondsSinceLastTyped = 0;
  const prompt = editor.value;
  const params = prepareRollParams();

  if (focus.children.length == 0 && focus.type == "user" && !updatingNode) {
    updatingNode = true;
    loomTree.updateNode(focus, prompt, focus.summary);
    updatingNode = false;
  }

  // Update character/word count on every keystroke
  updateCounterDisplay(prompt);

  if (prompt.length % 32 == 0) {
    // Removed the fetch call to check-tokens endpoint

    // Update summary while user is writing next prompt
    if (
      focus.children.length == 0 &&
      focus.type == "user" &&
      [
        "base",
        "vae-base",
        "vae-guided",
        "vae-paragraph",
        "vae-bridge",
      ].includes(params["sampling-method"]) &&
      !updatingNode
    ) {
      try {
        updatingNode = true;
        const summary = await getSummary(prompt);
        loomTree.updateNode(focus, prompt, summary);
        updatingNode = false;
      } catch (error) {
        console.log(error);
        updatingNode = false;
      }
    }
    // Render only the loom tree so we don't interrupt their typing
    loomTreeView.innerHTML = "";
    renderTree(focus, loomTreeView);
  }
  // Check for Control+Enter or Command+Enter (Mac)
  if (e.key == "Enter" && (e.ctrlKey || e.metaKey)) {
    reroll(focus.id, settingUseWeave?.checked ?? true);
  }
});

function saveFile() {
  const data = {
    loomTree,
    focus: focus,
  };
  ipcRenderer
    .invoke("save-file", data)
    .catch(err => console.error("Save File Error:", err));
}

function loadFile() {
  return ipcRenderer
    .invoke("load-file")
    .then(data => {
      loomTreeRaw = data.loomTree;
      loomTree = Object.assign(new LoomTree(), loomTreeRaw);
      focus = loomTree.nodeStore[data.focus.id];
      renderTick();
      updateThumbState();
    })
    .catch(err => console.error("Load File Error:", err));
}

function autoSave() {
  const data = {
    loomTree,
    focus: focus,
    samplerSettingsStore: samplerSettingsStore,
  };
  ipcRenderer
    .invoke("auto-save", data)
    .catch(err => console.error("Auto-save Error:", err));
}

var secondsSinceLastSave = 0;
async function autoSaveTick() {
  secondsSinceLastSave += 1;
  secondsSinceLastTyped += 1;
  if (secondsSinceLastSave == 30 || secondsSinceLastSave > 40) {
    autoSave();
    secondsSinceLastSave = 0;
  }
}

ipcRenderer.on("update-filename", (event, filename, creationTime, filePath) => {
  const filenameElement = document.getElementById("current-filename");
  if (filenameElement) {
    filenameElement.innerHTML = `💾 ${filename}`;

    if (creationTime) {
      const formattedTime = new Date(creationTime).toLocaleString();
      filenameElement.title = `File: ${filePath || "Unknown"}
Created: ${formattedTime}`;
    } else {
      filenameElement.title = `File: ${filePath || "Unknown"}`;
    }
  }
});
const onSettingsUpdated = async () => {
  try {
    const data = await ipcRenderer.invoke("load-settings");
    if (data != null) {
      samplerSettingsStore = data;
      console.log("Settings updated, new data:", data);
      // Refresh the selectors with new data
      populateServiceSelector();
      populateSamplerSelector();
      populateApiKeySelector();
    } else {
      console.log("Settings update returned null data");
    }
  } catch (err) {
    console.error("Load Settings Error:", err);
  }
};

// attach once on startup
document.addEventListener("DOMContentLoaded", () => {
  ipcRenderer.on("settings-updated", onSettingsUpdated);
});

async function updateFocusSummary() {
  if (focus.type == "user" && focus.children.length == 0 && !updatingNode) {
    const currentFocus = focus; // Stop focus from changing out underneath us
    const newPrompt = editor.value;
    const prompt = loomTree.renderNode(currentFocus);
    updatingNode = true;
    try {
      let summary = await getSummary(prompt);
      if (summary.trim() === "") {
        summary = "Summary Not Given";
      }
      loomTree.updateNode(currentFocus, newPrompt, summary);
    } catch (error) {
      loomTree.updateNode(currentFocus, newPrompt, "Server Response Error");
    }
    updatingNode = false;
  }
}

var autoSaveIntervalId = setInterval(autoSaveTick, 1000);

ipcRenderer.on("invoke-action", (event, action) => {
  switch (action) {
    case "save-file":
      saveFile();
      break;
    case "load-file":
      loadFile();
      break;
    default:
      console.log("Action not recognized", action);
  }
});

// Helper function to validate chat JSON
function isValidChatJson(text) {
  try {
    const data = JSON.parse(text);
    return data.messages && Array.isArray(data.messages);
  } catch (e) {
    return false;
  }
}

editor.addEventListener("contextmenu", e => {
  e.preventDefault();
  ipcRenderer.send("show-context-menu");
});

let samplerSettingsStore;

function loadSettings() {
  return ipcRenderer
    .invoke("load-settings")
    .then(data => {
      if (data != null) {
        samplerSettingsStore = data;
      }
    })
    .catch(err => console.error("Load Settings Error:", err));
}

async function init() {
  await loadSettings();

  // Populate the new Services and Samplers selectors
  populateServiceSelector();
  populateSamplerSelector();
  populateApiKeySelector();

  // Add click handlers to thumbs
  const thumbUp = document.getElementById("thumb-up");
  const thumbDown = document.getElementById("thumb-down");

  if (thumbUp) {
    thumbUp.onclick = () => promptThumbsUp(focus.id);
  }
  if (thumbDown) {
    thumbDown.onclick = () => promptThumbsDown(focus.id);
  }

  renderTick();

  // Update initial thumb state
  updateThumbState();
}

function populateServiceSelector() {
  const serviceSelector = document.getElementById("service-selector");
  if (!serviceSelector) return;

  // Remember current selection
  const currentSelection = serviceSelector.value;
  console.log("populateServiceSelector - currentSelection:", currentSelection);

  // Clear existing options except the first one
  serviceSelector.innerHTML =
    '<option value="">-- Select a service --</option>';

  if (samplerSettingsStore && samplerSettingsStore.services) {
    const services = Object.keys(samplerSettingsStore.services);
    console.log("Available services:", services);
    services.forEach(serviceName => {
      const option = document.createElement("option");
      option.value = serviceName;
      option.textContent = serviceName;
      serviceSelector.appendChild(option);
    });
  }

  // Restore selection if it still exists
  if (
    currentSelection &&
    samplerSettingsStore &&
    samplerSettingsStore.services &&
    samplerSettingsStore.services[currentSelection]
  ) {
    serviceSelector.value = currentSelection;
    console.log("Restored service selection to:", currentSelection);
  } else {
    console.log("Could not restore service selection:", currentSelection);
  }
}

function populateSamplerSelector() {
  const samplerSelector = document.getElementById("sampler-selector");
  if (!samplerSelector) return;

  // Remember current selection
  const currentSelection = samplerSelector.value;

  // Clear existing options except the first one
  samplerSelector.innerHTML =
    '<option value="">-- Select a sampler --</option>';

  if (samplerSettingsStore && samplerSettingsStore.samplers) {
    const samplers = Object.keys(samplerSettingsStore.samplers);
    samplers.forEach(samplerName => {
      const option = document.createElement("option");
      option.value = samplerName;
      option.textContent = samplerName;
      samplerSelector.appendChild(option);
    });
  }

  // Restore selection if it still exists
  if (
    currentSelection &&
    samplerSettingsStore &&
    samplerSettingsStore.samplers &&
    samplerSettingsStore.samplers[currentSelection]
  ) {
    samplerSelector.value = currentSelection;
  }
}

function populateApiKeySelector() {
  const apiKeySelector = document.getElementById("api-key-selector");
  if (!apiKeySelector) return;

  // Remember current selection
  const currentSelection = apiKeySelector.value;

  // Clear existing options except the first one
  apiKeySelector.innerHTML = '<option value="">-- Select API key --</option>';

  if (samplerSettingsStore && samplerSettingsStore["api-keys"]) {
    const apiKeys = Object.keys(samplerSettingsStore["api-keys"]);
    apiKeys.forEach(apiKeyName => {
      const option = document.createElement("option");
      option.value = apiKeyName;
      option.textContent = apiKeyName;
      apiKeySelector.appendChild(option);
    });
  }

  // Restore selection if it still exists
  if (
    currentSelection &&
    samplerSettingsStore &&
    samplerSettingsStore["api-keys"] &&
    samplerSettingsStore["api-keys"][currentSelection]
  ) {
    apiKeySelector.value = currentSelection;
  }
}
init();
updateCounterDisplay(editor.value || "");
