const fs = require("fs");
const path = require("path");
const { ipcRenderer } = require("electron");
const DiffMatchPatch = require("diff-match-patch");
const dmp = new DiffMatchPatch();
const MiniSearch = require("minisearch");

const settingUseWeave = document.getElementById("use-weave");
const settingNewTokens = document.getElementById("new-tokens");
const settingBudget = document.getElementById("budget");
const sampler = document.getElementById("sampler");
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
    const serializedChildren = node.children.map((child) =>
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

  link.onclick = (event) => {
    event.stopPropagation(); // Stop event bubbling
    changeFocus(node.id);
  };
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
  if (focus.type === "gen") {
    const rewriteButton = document.createElement("span");
    rewriteButton.id = "rewrite-button";
    rewriteButton.textContent = "💬";
    rewriteButton.onclick = () => promptRewriteNode(focus.id);
    //    branchControlButtonsDiv.append(rewriteButton);
  }
  const quickRollSpan = document.createElement("span");
  quickRollSpan.classList.add("reroll");
  quickRollSpan.textContent = "🖋️";
  quickRollSpan.onclick = () => reroll(focus.id, false);
  branchControlButtonsDiv.append(quickRollSpan);

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
  } else {
    renderTick();
    editor.selectionStart = editor.value.length;
    editor.selectionEnd = editor.value.length;
    editor.focus();
  }
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
  const endpoint = document.getElementById("api-url").value;
  const summarizePromptPath = path.join(__dirname, "prompts", "summarize.txt");
  const summarizePromptTemplate = fs.readFileSync(summarizePromptPath, "utf8");
  const summarizePrompt = summarizePromptTemplate.replace("{MODEL_NAME}", document.getElementById("model-name").value);
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
    !["together", "openrouter", "openai", "openai-chat"].includes(sampler.value)
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
    return batch[1]["text"].trim().split("\n")[0].split(" ").slice(0,3).join(" ");
  } // TODO: Figure out how I might have to change this if I end up supporting
  // multiple APIs
  else if (sampler.value == "openai-chat") {
    r = await fetch(endpoint, {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "system", content: prompt }],
        model: document.getElementById("model-name").value,
        max_tokens: 10,
        temperature: document.getElementById("temperature").value,
        top_p: document.getElementById("top-p").value,
        top_k: document.getElementById("top-k").value,
        repetition_penalty: document.getElementById("repetition-penalty").value,
      }),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    });
    let batch = await r.json();
    return batch.choices[0]["message"]["content"].trim().split("\n")[0].split(" ").slice(0,3).join(" ");
  } else {
    const tp = {
      "api-key": document.getElementById("api-key").value,
      "output-branches": 1,
      "model-name": document.getElementById("model-name").value,
      "tokens-per-branch": 10,
      temperature: document.getElementById("temperature").value,
      "top-p": document.getElementById("top-p").value,
      "top-k": document.getElementById("top-k").value,
      repetition_penalty: document.getElementById("repetition-penalty").value,
    };
    let batch;
    if (sampler.value === "openai") {
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
    return batch[0]["text"].trim().split("\n")[0].split(" ").slice(0,3).join(" ");
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
  loomTree.nodeStore[id].rating = true;
  promptBranchControls = document.getElementById("prompt-branch-controls");
  thumbUp = promptBranchControls.children.item(0).children.item(0);
  thumbUp.classList = ["chosen"];
  thumbDown = promptBranchControls.children.item(0).children.item(1);
  thumbDown.classList = ["thumbs"];
}

function promptThumbsDown(id) {
  loomTree.nodeStore[id].rating = false;
  promptBranchControls = document.getElementById("prompt-branch-controls");
  thumbUp = promptBranchControls.children.item(0).children.item(0);
  thumbUp.classList = ["thumbs"];
  thumbDown = promptBranchControls.children.item(0).children.item(1);
  thumbDown.classList = ["chosen"];
}

function diceSetup() {
  editor.readOnly = true;
  const diceHolder = document.getElementById("dice-holder");
  const die = document.createElement("p");
  die.innerText = "🎲";
  die.id = "die";
  diceHolder.appendChild(die);
}

function diceTeardown() {
  editor.readOnly = false;
  const die = document.getElementById("die");
  die.remove();
}

async function vaeGuidedGetResponses({ endpoint, params = {} }) {
  let batch = [];
  let r = await fetch(endpoint, {
    method: "POST",
    body: JSON.stringify(params),
    headers: {
      "Content-type": "application/json; charset=UTF-8",
      accept: "application/json",
    },
  });
  batch = await r.json();
  return batch;
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  let batch_promises = [];
  // Together doesn't let you get more than one completion at a time
  // But OpenAI expects you to use the n parameter
  let calls = api === "openai" ? 1 : tp["output-branches"];
  for (let i = 1; i <= calls; i++) {
    console.log("Together API called");
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
        return r.json();
      })
      .then((response_json) => {
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
  if (sampler.value === "base") {
    baseRoll(id, weave);
  } else if (sampler.value === "vae-guided") {
    await vaeGuidedRoll(id);
  } else if (sampler.value === "together") {
    togetherRoll(id, (api = "together"));
  } else if (sampler.value === "openrouter") {
    togetherRoll(id, (api = "openrouter"));
  } else if (sampler.value === "openai") {
    togetherRoll(id, (api = "openai"));
  } else if (sampler.value === "openai-chat") {
    await openaiChatCompletionsRoll(id);
  }
}

async function baseRoll(id, weave = true) {
  diceSetup();
  await autoSaveTick();
  await updateFocusSummary();
  const rerollFocus = loomTree.nodeStore[id];
  let prompt = loomTree.renderNode(rerollFocus);
  let includePrompt = false;
  let endpoint = document.getElementById("api-url").value;

  const wp = {
    tokens_per_branch: document.getElementById("tokens-per-branch").value,
    output_branches: document.getElementById("output-branches").value,
    temperature: document.getElementById("temperature").value,
  };
  let newResponses;
  try {
    newResponses = await getResponses(endpoint, {
      prompt: prompt,
      weave: weave,
      weaveParams: wp,
      focusId: rerollFocus.id,
      includePrompt: includePrompt,
    });
  } catch (error) {
    diceTeardown();
    errorMessage.textContent = "Error: " + error.message;
    throw error;
  }
  let responses = newResponses;
  for (let i = 0; i < responses.length; i++) {
    const response = responses[i];
    const responseSummary = await getSummary(response["text"]);
    const childText = loomTree.renderNode(rerollFocus) + response["text"];
    const responseNode = loomTree.createNode(
      "gen",
      rerollFocus,
      childText,
      responseSummary
    );
    loomTree.nodeStore[responseNode.id]["model"] = response["base_model"];
  }
  focus = loomTree.nodeStore[rerollFocus.children.at(-1)];
  diceTeardown();
  renderTick();
}

function readFileAsJson(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
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

async function vaeGuidedRoll(id) {
  diceSetup();
  await autoSaveTick();
  await updateFocusSummary();
  const rollFocus = loomTree.nodeStore[id];
  let prompt = loomTree.renderNode(rollFocus);

  const params = {
    output_branches: document.getElementById("output-branches").value,
    tokens_per_branch: document.getElementById("tokens-per-branch").value,
    prompt: prompt,
  };
  const fileInput = document.getElementById("task-vector");
  if (fileInput.files.length > 0) {
    const file = fileInput.files[0];
    try {
      params["task_vector"] = await readFileAsJson(file);
    } catch (error) {
      errorMessage.textContent = "Error: " + error.message;
      return;
    }
  }

  let responses;
  try {
    responses = await vaeGuidedGetResponses({
      endpoint: document.getElementById("api-url").value + "vae-guided",
      params: params,
    });
  } catch (error) {
    diceTeardown();
    errorMessage.textContent = "Error: " + error.message;
    throw error;
  }
  for (let i = 0; i < responses.length; i++) {
    const response = responses[i];
    const responseSummary = await getSummary(response["text"]);
    const childText = loomTree.renderNode(rerollFocus) + response["text"];
    const responseNode = loomTree.createNode(
      "gen",
      rollFocus,
      childText,
      responseSummary
    );
  }
  focus = loomTree.nodeStore[rollFocus.children.at(-1)];
  diceTeardown();
  renderTick();
}

async function togetherRoll(id, api = "openai") {
  diceSetup();
  await autoSaveTick();
  await updateFocusSummary();
  const rollFocus = loomTree.nodeStore[id];
  let prompt = loomTree.renderNode(rollFocus);

  const apiDelay = document.getElementById("api-delay").value;
  const tp = {
    "api-key": document.getElementById("api-key").value,
    "model-name": document.getElementById("model-name").value,
    "output-branches": document.getElementById("output-branches").value,
    "tokens-per-branch": document.getElementById("tokens-per-branch").value,
    temperature: document.getElementById("temperature").value,
    "top-p": document.getElementById("top-p").value,
    "top-k": document.getElementById("top-k").value,
    repetition_penalty: document.getElementById("repetition-penalty").value,
    delay: apiDelay,
  };
  let newResponses;
  try {
    newResponses = await togetherGetResponses({
      endpoint: document.getElementById("api-url").value,
      prompt: prompt,
      togetherParams: tp,
      api: api,
    });
  } catch (error) {
    diceTeardown();
    errorMessage.textContent = "Error: " + error.message;
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
  focus = loomTree.nodeStore[rollFocus.children.at(-1)];
  diceTeardown();
  renderTick();
}

// Add this function for OpenAI Chat Completions API calls
async function openaiChatCompletionsRoll(id) {
  diceSetup();
  await autoSaveTick();
  await updateFocusSummary();
  const rollFocus = loomTree.nodeStore[id];
  let promptText = loomTree.renderNode(rollFocus);

  try {
    // Parse the JSON from the editor
    let chatData = JSON.parse(promptText);

    if (!chatData.messages || !Array.isArray(chatData.messages)) {
      throw new Error("Invalid chat format: messages array not found");
    }

    const apiKey = document.getElementById("api-key").value;
    const modelName = document.getElementById("model-name").value;
    const temperature = parseFloat(
      document.getElementById("temperature").value
    );
    const topP = parseFloat(document.getElementById("top-p").value);
    const outputBranches = parseInt(
      document.getElementById("output-branches").value
    );
    const tokensPerBranch = parseInt(
      document.getElementById("tokens-per-branch").value
    );

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
    const response = await fetch(document.getElementById("api-url").value, {
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

    // Focus on the last generated response
    focus = loomTree.nodeStore[rollFocus.children.at(-1)];
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
    .filter((word) => word.length > 0).length;
}

function updateCounterDisplay(text) {
  const charCount = countCharacters(text);
  const wordCount = countWords(text);

  promptTokenCounter.innerText = `${wordCount} Words (${charCount} Characters)`;
}

var secondsSinceLastTyped = 0;
var updatingNode = false;

editor.addEventListener("input", async (e) => {
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

editor.addEventListener("keydown", async (e) => {
  secondsSinceLastTyped = 0;
  const prompt = editor.value;

  if (focus.children.length == 0 && focus.type == "user" && !updatingNode) {
    updatingNode = true;
    loomTree.updateNode(focus, prompt, focus.summary);
    updatingNode = false;
  }

  if (e.key != "Enter") {
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
        ].includes(sampler.value) &&
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
    return null;
  } else if (!e.shiftKey) {
    return null;
  }
  reroll(focus.id, settingUseWeave.checked);
});

function saveFile() {
  const data = {
    loomTree,
    focus: focus,
  };
  ipcRenderer
    .invoke("save-file", data)
    .catch((err) => console.error("Save File Error:", err));
}

function loadFile() {
  return ipcRenderer
    .invoke("load-file")
    .then((data) => {
      loomTreeRaw = data.loomTree;
      loomTree = Object.assign(new LoomTree(), loomTreeRaw);
      focus = loomTree.nodeStore[data.focus.id];
      renderTick();
    })
    .catch((err) => console.error("Load File Error:", err));
}

function autoSave() {
  const data = {
    loomTree,
    focus: focus,
    samplerSettingsStore: samplerSettingsStore,
  };
  ipcRenderer
    .invoke("auto-save", data)
    .catch((err) => console.error("Auto-save Error:", err));
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

document.getElementById('openSettingsBtn').addEventListener('click', () => {
  ipcRenderer.invoke('open-settings');
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

editor.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  ipcRenderer.send("show-context-menu");
});

renderTick();
updateCounterDisplay(editor.value || "");
