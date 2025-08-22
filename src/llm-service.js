class LLMService {
  constructor(callbacks = {}) {
    this.errorMessage = document.getElementById("error-message");
    this.callbacks = callbacks;
  }

  prepareRollParams() {
    const serviceSelector = document.getElementById("service-selector");
    const samplerSelector = document.getElementById("sampler-selector");
    const apiKeySelector = document.getElementById("api-key-selector");

    // Get selected service, sampler, and API key
    const selectedServiceName = serviceSelector ? serviceSelector.value : "";
    const selectedSamplerName = samplerSelector ? samplerSelector.value : "";
    const selectedApiKeyName = apiKeySelector ? apiKeySelector.value : "";

    // Get service data
    let serviceData = {};
    const samplerSettingsStore = this.callbacks.getSamplerSettingsStore();
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

    return params;
  }

  async getResponses(
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
      const loomTree = this.callbacks.getLoomTree();
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

  async getSummary(taskText) {
    const params = this.prepareRollParams();
    const endpoint = params["api-url"];

    const summarizePromptTemplate =
      await window.electronAPI.readPromptFile("summarize.txt");
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
      // Check if this is Anthropic API
      const isAnthropic = endpoint.includes("api.anthropic.com");

      let requestUrl = endpoint;
      let headers = {
        "Content-type": "application/json; charset=UTF-8",
      };
      let requestBody;

      if (isAnthropic) {
        // Anthropic API format
        requestUrl = "https://api.anthropic.com/v1/messages";
        headers["x-api-key"] = params["api-key"];
        headers["anthropic-version"] = "2023-06-01";

        requestBody = {
          model: params["model-name"],
          messages: [{ role: "user", content: prompt }],
          max_tokens: 10,
          temperature: params["temperature"],
          top_p: params["top-p"],
        };
      } else {
        // OpenAI format
        headers.Authorization = `Bearer ${params["api-key"]}`;

        requestBody = {
          messages: [{ role: "system", content: prompt }],
          model: params["model-name"],
          max_tokens: 10,
          temperature: params["temperature"],
          top_p: params["top-p"],
          top_k: params["top-k"],
          repetition_penalty: params["repetition-penalty"],
        };
      }

      r = await fetch(requestUrl, {
        method: "POST",
        body: JSON.stringify(requestBody),
        headers: headers,
      });

      if (!r.ok) {
        let errorMessage = r.statusText;
        try {
          const errorData = await r.json();
          errorMessage = errorData.error?.message || errorMessage;
        } catch (jsonError) {
          try {
            const errorText = await r.text();
            errorMessage = errorText || errorMessage;
          } catch (textError) {
            errorMessage = r.statusText;
          }
        }
        throw new Error(`API Error: ${errorMessage}`);
      }

      let batch;
      try {
        batch = await r.json();
      } catch (jsonError) {
        throw new Error(`Invalid JSON response from API: ${jsonError.message}`);
      }

      if (isAnthropic) {
        return batch.content[0].text
          .trim()
          .split("\n")[0]
          .split(" ")
          .slice(0, 3)
          .join(" ");
      } else {
        return batch.choices[0]["message"]["content"]
          .trim()
          .split("\n")[0]
          .split(" ")
          .slice(0, 3)
          .join(" ");
      }
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
        batch = await this.togetherGetResponses({
          endpoint: endpoint,
          prompt: prompt,
          togetherParams: tp,
          openai: true,
        });
      } else {
        batch = await this.togetherGetResponses({
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

  async togetherGetResponses({
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

      const promise = this.delay(apiDelay * i)
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

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async reroll(id, weave = true) {
    const params = this.prepareRollParams();
    if (params["sampling-method"] === "base") {
      // Use togetherRoll for base method
      this.togetherRoll(id, "base");
    } else if (params["sampling-method"] === "vae-guided") {
      // vae-guided not implemented, fall back to base
      this.togetherRoll(id, "base");
    } else if (params["sampling-method"] === "together") {
      this.togetherRoll(id, "together");
    } else if (params["sampling-method"] === "openrouter") {
      this.togetherRoll(id, "openrouter");
    } else if (params["sampling-method"] === "openai") {
      this.togetherRoll(id, "openai");
    } else if (params["sampling-method"] === "openai-chat") {
      await this.openaiChatCompletionsRoll(id);
    } else {
      // Default fallback
      this.togetherRoll(id, "base");
    }
  }

  async togetherRoll(id, api = "openai") {
    this.diceSetup();
    if (this.callbacks.autoSaveTick) await this.callbacks.autoSaveTick();
    if (this.callbacks.updateFocusSummary)
      await this.callbacks.updateFocusSummary();

    const loomTree = this.callbacks.getLoomTree();
    const rollFocus = loomTree.nodeStore[id];
    const lastChildIndex =
      rollFocus.children.length > 0 ? rollFocus.children.length - 1 : null;
    // Use current editor content instead of rendered tree content
    let prompt = this.callbacks.getEditor().value;
    const params = this.prepareRollParams();

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
      newResponses = await this.togetherGetResponses({
        endpoint: params["api-url"],
        prompt: prompt,
        togetherParams: tp,
        api: api,
      });
    } catch (error) {
      this.diceTeardown();
      this.errorMessage.textContent = "Error: " + error.message;
      document.getElementById("errors").classList.add("has-error");
      console.warn(error);
      throw error;
    }
    for (let i = 0; i < newResponses.length; i++) {
      const response = newResponses[i];
      const responseSummary = await this.delay(apiDelay).then(() => {
        return this.getSummary(response["text"]);
      });
      const childText = loomTree.renderNode(rollFocus) + response["text"];
      const responseNode = loomTree.createNode(
        "gen",
        rollFocus,
        childText,
        responseSummary
      );
      this.callbacks.updateNodeMetadata(responseNode.id, {
        model: response["model"],
      });
    }
    // Focus on the first newly generated response, but only if we're still on the same node
    const currentFocus = this.callbacks.getFocus();
    if (currentFocus === rollFocus) {
      if (lastChildIndex === null) {
        // No children before, focus on the first one
        if (this.callbacks.setFocus) {
          this.callbacks.setFocus(loomTree.nodeStore[rollFocus.children[0]]);
        }
      } else {
        // Focus on the first new child (lastChildIndex + 1)
        if (this.callbacks.setFocus) {
          this.callbacks.setFocus(
            loomTree.nodeStore[rollFocus.children[lastChildIndex + 1]]
          );
        }
      }
    }
    this.diceTeardown();
    if (this.callbacks.renderTick) this.callbacks.renderTick();
  }

  // Add this function for OpenAI Chat Completions API calls
  async openaiChatCompletionsRoll(id) {
    this.diceSetup();
    if (this.callbacks.autoSaveTick) await this.callbacks.autoSaveTick();
    if (this.callbacks.updateFocusSummary)
      await this.callbacks.updateFocusSummary();

    const loomTree = this.callbacks.getLoomTree();
    const rollFocus = loomTree.nodeStore[id];
    const lastChildIndex =
      rollFocus.children.length > 0 ? rollFocus.children.length - 1 : null;
    let promptText = loomTree.renderNode(rollFocus);
    const params = this.prepareRollParams();

    try {
      // Try to parse as JSON first, if it fails, convert regular text to chat format
      let chatData;
      try {
        chatData = JSON.parse(promptText);
        if (!chatData.messages || !Array.isArray(chatData.messages)) {
          throw new Error("Invalid chat format: messages array not found");
        }
      } catch (jsonError) {
        // If it's not valid JSON, convert the text to a chat format
        chatData = {
          messages: [
            {
              role: "user",
              content: promptText.trim(),
            },
          ],
        };
      }

      const apiKey = params["api-key"];
      const modelName = params["model-name"];
      const temperature = parseFloat(params["temperature"]);
      const topP = parseFloat(params["top-p"]);
      const outputBranches = parseInt(params["output-branches"]);
      const tokensPerBranch = parseInt(params["tokens-per-branch"]);

      // Check if this is Anthropic API
      const isAnthropic = params["api-url"].includes("api.anthropic.com");

      // Prepare the API request
      let requestBody;
      let requestUrl = params["api-url"];
      let headers = {
        "Content-Type": "application/json",
      };

      if (isAnthropic) {
        // Anthropic API format
        requestUrl = "https://api.anthropic.com/v1/messages";
        headers["x-api-key"] = apiKey;
        headers["anthropic-version"] = "2023-06-01";

        requestBody = {
          model: modelName,
          messages: chatData.messages,
          max_tokens: tokensPerBranch,
          temperature: temperature,
          top_p: topP,
        };
      } else {
        // OpenAI format
        headers.Authorization = `Bearer ${apiKey}`;

        requestBody = {
          model: modelName,
          messages: chatData.messages,
          max_tokens: tokensPerBranch,
          temperature: temperature,
          top_p: topP,
          n: outputBranches,
        };
      }

      // Make the API call
      const response = await fetch(requestUrl, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        let errorMessage = response.statusText;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error?.message || errorMessage;
        } catch (jsonError) {
          // If response is not JSON, try to get text content
          try {
            const errorText = await response.text();
            errorMessage = errorText || errorMessage;
          } catch (textError) {
            // If we can't even get text, use status text
            errorMessage = response.statusText;
          }
        }
        throw new Error(`OpenAI API Error: ${errorMessage}`);
      }

      let responseData;
      try {
        responseData = await response.json();
      } catch (jsonError) {
        throw new Error(`Invalid JSON response from API: ${jsonError.message}`);
      }

      // Process responses based on API type
      if (isAnthropic) {
        // Handle Anthropic response format
        const assistantMessage = responseData.content[0];

        // Create a new chat data object with the assistant's response
        const newChatData = JSON.parse(JSON.stringify(chatData)); // Deep clone
        newChatData.messages.push({
          role: "assistant",
          content: assistantMessage.text,
        });

        const newChatText = JSON.stringify(newChatData, null, 2);

        // Generate a summary for the new node
        const summary = await this.getSummary(
          assistantMessage.text || "Assistant response"
        );

        // Create the new node
        const responseNode = loomTree.createNode(
          "gen",
          rollFocus,
          newChatText,
          summary
        );

        // Store metadata
        this.callbacks.updateNodeMetadata(responseNode.id, {
          model: responseData.model,
          usage: responseData.usage,
          finish_reason: responseData.stop_reason,
        });
      } else {
        // Handle OpenAI response format
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
          const summary = await this.getSummary(
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
          this.callbacks.updateNodeMetadata(responseNode.id, {
            model: responseData.model,
            usage: responseData.usage,
            finish_reason: choice.finish_reason,
          });
        }
      }

      // Focus on the first newly generated response, but only if we're still on the same node
      const currentFocus = this.callbacks.getFocus();
      if (currentFocus === rollFocus) {
        if (lastChildIndex === null) {
          // No children before, focus on the first one
          if (this.callbacks.setFocus) {
            this.callbacks.setFocus(loomTree.nodeStore[rollFocus.children[0]]);
          }
        } else {
          // Focus on the first new child (lastChildIndex + 1)
          if (this.callbacks.setFocus) {
            this.callbacks.setFocus(
              loomTree.nodeStore[rollFocus.children[lastChildIndex + 1]]
            );
          }
        }
      }
    } catch (error) {
      this.diceTeardown();
      this.errorMessage.textContent = "Error: " + error.message;
      document.getElementById("errors").classList.add("has-error");
      console.error("OpenAI Chat Completions Error:", error);
      return;
    }

    this.diceTeardown();
    if (this.callbacks.renderTick) this.callbacks.renderTick();
  }

  async rewriteNode(id) {
    const endpoint = document.getElementById("api-url").value;
    const rewriteNodePrompt = document.getElementById("rewrite-node-prompt");

    // Use safe API to read prompt file
    const rewritePrompt =
      await window.electronAPI.readPromptFile("rewrite.txt");
    const rewriteFeedback = rewriteNodePrompt.value;
    const rewriteContext = this.callbacks.getEditor().value;

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

    this.diceSetup();
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

    const loomTree = this.callbacks.getLoomTree();
    const currentFocus = this.callbacks.getFocus();
    const focusParent = loomTree.nodeStore[currentFocus.parent];
    const focusParentText = loomTree.renderNode(focusParent);
    for (i = 0; i < batch.length; i++) {
      let response = batch[i];
      let summary = await this.getSummary(response["text"]);
      const responseNode = loomTree.createNode(
        "rewrite",
        currentFocus,
        focusParentText + response["text"],
        summary
      );
      this.callbacks.updateNodeMetadata(responseNode.id, {
        feedback: rewriteFeedback,
        rewritePrompt: prompt,
        model: response["base_model"],
      });
    }
    const chatPane = document.getElementById("chat-pane");
    chatPane.innerHTML = "";
    this.diceTeardown();
    if (this.callbacks.renderTick) this.callbacks.renderTick();
  }

  diceSetup() {
    this.callbacks.setEditorReadOnly(true);
    const die = document.getElementById("die");
    if (die) {
      die.classList.add("rolling");
    }
  }

  diceTeardown() {
    this.callbacks.setEditorReadOnly(false);
    const die = document.getElementById("die");
    if (die) {
      die.classList.remove("rolling");
    }
    // Clear any existing errors when generation completes
    this.errorMessage.textContent = "";
    document.getElementById("errors").classList.remove("has-error");
  }
}

// Export the LLMService class
window.LLMService = LLMService;
