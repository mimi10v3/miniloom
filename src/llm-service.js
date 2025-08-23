// Utility functions for API handling
class APIUtils {
  static async makeRequest(url, options) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        ...options.headers,
      },
      body: JSON.stringify(options.body),
    });

    if (!response.ok) {
      const errorMessage = await this.extractErrorMessage(response);
      throw new Error(`API Error: ${errorMessage}`);
    }

    try {
      return await response.json();
    } catch (jsonError) {
      throw new Error(`Invalid JSON response from API: ${jsonError.message}`);
    }
  }

  static async extractErrorMessage(response) {
    try {
      const errorData = await response.json();
      return errorData.error?.message || response.statusText;
    } catch (jsonError) {
      try {
        const errorText = await response.text();
        return errorText || response.statusText;
      } catch (textError) {
        return response.statusText;
      }
    }
  }

  static delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static extractThreeWords(text) {
    return text.trim().split("\n")[0].split(" ").slice(0, 3).join(" ");
  }
}

// API providers for different services
class APIProviders {
  static async baseProvider(endpoint, prompt, params) {
    return APIUtils.makeRequest(endpoint + "generate", {
      body: {
        prompt: prompt,
        prompt_node: true,
        evaluationPrompt: "",
        tokens_per_branch: params["tokens-per-branch"],
        output_branches: params["output-branches"],
      },
    });
  }

  static async openaiChatProvider(endpoint, prompt, params) {
    const headers = {
      Authorization: `Bearer ${params["api-key"]}`,
    };
    const requestBody = {
      messages: [{ role: "system", content: prompt }],
      model: params["model-name"],
      max_completion_tokens: params["tokens-per-branch"],
      temperature: params["temperature"],
      top_p: params["top-p"],
    };

    return APIUtils.makeRequest(endpoint, {
      headers,
      body: requestBody,
    });
  }

  static async openaiProvider(endpoint, prompt, params) {
    const headers = {
      Authorization: `Bearer ${params["api-key"]}`,
    };
    const requestBody = {
      model: params["model-name"],
      prompt: prompt,
      max_tokens: Number(params["tokens-per-branch"]),
      n: Number(params["output-branches"]),
      temperature: Number(params["temperature"]),
      top_p: Number(params["top-p"]),
    };

    return APIUtils.makeRequest(endpoint, {
      headers,
      body: requestBody,
    });
  }

  static async anthropicProvider(endpoint, prompt, params) {
    const headers = {
      "Content-Type": "application/json",
      "x-api-key": params["api-key"],
      "anthropic-version": "2023-06-01",
    };
    const requestBody = {
      model: params["model-name"],
      messages: [{ role: "user", content: prompt }],
      max_tokens: Number(params["tokens-per-branch"]),
      temperature: Number(params["temperature"]),
      top_p: Number(params["top-p"]),
    };

    return APIUtils.makeRequest(endpoint, {
      headers,
      body: requestBody,
    });
  }

  static async togetherProvider(endpoint, prompt, params, api = "openai") {
    const auth_token = `Bearer ${params["api-key"]}`;
    const apiDelay = Number(params["delay"] || 0);

    const batchPromises = [];
    const calls = api === "openai" ? 1 : params["output-branches"];

    for (let i = 1; i <= calls; i++) {
      const body = {
        model: params["model-name"],
        prompt: prompt,
        max_tokens: Number(params["tokens-per-branch"]),
        n: api === "openai" ? Number(params["output-branches"]) : 1,
        temperature: Number(params["temperature"]),
        top_p: Number(params["top-p"]),
        top_k: Number(params["top-k"]),
        repetition_penalty: Number(params["repetition-penalty"]),
      };

      if (api === "openrouter") {
        body.provider = { require_parameters: true };
      }

      const promise = APIUtils.delay(apiDelay * i)
        .then(() =>
          APIUtils.makeRequest(endpoint, {
            headers: {
              accept: "application/json",
              Authorization: auth_token,
            },
            body,
          })
        )
        .then(responseJson => {
          const choices =
            api === "openai" || api === "openrouter"
              ? responseJson.choices
              : responseJson.output.choices;

          return choices.map(choice => ({
            text: choice.text,
            model: responseJson.model,
          }));
        });

      batchPromises.push(promise);
    }

    const batch = await Promise.all(batchPromises);
    // For OpenAI, batch[0] is an array of choices, so we return it directly
    // For other APIs, batch is an array of arrays, so we flatten it
    return api === "openai" ? batch[0] : batch.flat();
  }
}

// Main LLM Service class
class LLMService {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
  }

  prepareRollParams() {
    const settings = this.callbacks.getSamplerSettings();
    const samplerSettingsStore = this.callbacks.getSamplerSettingsStore();

    if (!samplerSettingsStore) {
      throw new Error("Sampler settings store not available");
    }

    const serviceData =
      samplerSettingsStore.services?.[settings.selectedServiceName] || {};
    const samplerData =
      samplerSettingsStore.samplers?.[settings.selectedSamplerName] || {};
    const apiKey =
      samplerSettingsStore["api-keys"]?.[settings.selectedApiKeyName] || "";

    return {
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
    if (focusId) {
      const loomTree = this.callbacks.getLoomTree();
      loomTree.renderNode(loomTree.nodeStore[focusId]);
    }

    const finalEndpoint = endpoint + (weave ? "weave" : "generate");
    const params = {
      prompt: prompt,
      prompt_node: includePrompt,
      tokens_per_branch: weaveParams["tokens_per_branch"],
      output_branches: weaveParams["output_branches"],
    };

    return APIUtils.makeRequest(finalEndpoint, { body: params });
  }

  async getSummary(taskText) {
    // Safety check for undefined or null taskText
    if (!taskText || typeof taskText !== "string") {
      console.warn("getSummary called with invalid taskText:", taskText);
      return "Summary Not Available";
    }

    const params = this.prepareRollParams();
    const endpoint = params["api-url"];

    const summarizePromptTemplate =
      await window.electronAPI.readPromptFile("summarize.txt");
    const summarizePrompt = summarizePromptTemplate.replace(
      "{MODEL_NAME}",
      params["model-name"]
    );

    // Limit context to 8 * 512 characters (average word length * word count)
    const prompt =
      summarizePrompt +
      "\n\n<tasktext>\n" +
      taskText.slice(-4096) +
      "\n</tasktext>\n\nThree Words:";

    const samplingMethod = params["sampling-method"];

    if (
      ["together", "openrouter", "openai", "openai-chat"].includes(
        samplingMethod
      )
    ) {
      if (samplingMethod === "openai-chat") {
        const response = await APIProviders.openaiChatProvider(
          endpoint,
          prompt,
          {
            ...params,
            "tokens-per-branch": 10,
            "output-branches": 1,
          }
        );

        const text = response.choices[0].message.content;
        return APIUtils.extractThreeWords(text);
      } else if (samplingMethod === "openai") {
        // Use openaiProvider for OpenAI completions
        const openaiParams = {
          "api-key": params["api-key"],
          "output-branches": 1,
          "model-name": params["model-name"],
          "tokens-per-branch": 10,
          temperature: params["temperature"],
          "top-p": params["top-p"],
        };

        const responseData = await APIProviders.openaiProvider(
          endpoint,
          prompt,
          openaiParams
        );

        return APIUtils.extractThreeWords(responseData.choices[0].text);
      } else {
        const togetherParams = {
          "api-key": params["api-key"],
          "output-branches": 1,
          "model-name": params["model-name"],
          "tokens-per-branch": 10,
          temperature: params["temperature"],
          "top-p": params["top-p"],
          "top-k": params["top-k"],
          repetition_penalty: params["repetition-penalty"],
        };

        const batch = await APIProviders.togetherProvider(
          endpoint,
          prompt,
          togetherParams,
          samplingMethod
        );

        return APIUtils.extractThreeWords(batch[0].text);
      }
    } else {
      const response = await APIProviders.baseProvider(endpoint, prompt, {
        "tokens-per-branch": 10,
        "output-branches": 1,
      });

      return APIUtils.extractThreeWords(response[1].text);
    }
  }

  async reroll(id) {
    const params = this.prepareRollParams();
    const samplingMethod = params["sampling-method"];

    const methodMap = {
      base: () => this.togetherRoll(id, "base"),
      "vae-guided": () => this.togetherRoll(id, "base"), // fallback to base
      together: () => this.togetherRoll(id, "together"),
      openrouter: () => this.togetherRoll(id, "openrouter"),
      openai: () => this.openaiRoll(id),
      "openai-chat": () => this.openaiChatCompletionsRoll(id),
      anthropic: () => this.anthropicRoll(id),
    };

    const method = methodMap[samplingMethod] || methodMap["base"];
    await method();
  }

  async togetherRoll(id, api = "openai") {
    if (this.callbacks.setLoading) this.callbacks.setLoading(true);

    try {
      if (this.callbacks.autoSaveTick) await this.callbacks.autoSaveTick();
      if (this.callbacks.updateFocusSummary)
        await this.callbacks.updateFocusSummary();

      const loomTree = this.callbacks.getLoomTree();
      const rollFocus = loomTree.nodeStore[id];
      const lastChildIndex =
        rollFocus.children.length > 0 ? rollFocus.children.length - 1 : null;

      const prompt = this.callbacks.getEditor().value;
      const params = this.prepareRollParams();

      const togetherParams = {
        "api-key": params["api-key"],
        "model-name": params["model-name"],
        "output-branches": params["output-branches"],
        "tokens-per-branch": params["tokens-per-branch"],
        temperature: params["temperature"],
        "top-p": params["top-p"],
        "top-k": params["top-k"],
        repetition_penalty: params["repetition-penalty"],
        delay: params["api-delay"],
      };

      const newResponses = await APIProviders.togetherProvider(
        params["api-url"],
        prompt,
        togetherParams,
        api
      );

      await this.processResponses(
        newResponses,
        rollFocus,
        lastChildIndex,
        params["api-delay"]
      );
    } catch (error) {
      if (this.callbacks.showError) this.callbacks.showError(error.message);
      throw error;
    } finally {
      if (this.callbacks.setLoading) this.callbacks.setLoading(false);
      if (this.callbacks.renderTick) this.callbacks.renderTick();
    }
  }

  async anthropicRoll(id) {
    if (this.callbacks.setLoading) this.callbacks.setLoading(true);

    try {
      if (this.callbacks.autoSaveTick) await this.callbacks.autoSaveTick();
      if (this.callbacks.updateFocusSummary)
        await this.callbacks.updateFocusSummary();

      const loomTree = this.callbacks.getLoomTree();
      const rollFocus = loomTree.nodeStore[id];
      const lastChildIndex =
        rollFocus.children.length > 0 ? rollFocus.children.length - 1 : null;

      const prompt = this.callbacks.getEditor().value;
      const params = this.prepareRollParams();

      const anthropicParams = {
        "api-key": params["api-key"],
        "model-name": params["model-name"],
        "output-branches": params["output-branches"],
        "tokens-per-branch": params["tokens-per-branch"],
        temperature: params["temperature"],
        "top-p": params["top-p"],
      };

      const responseData = await APIProviders.anthropicProvider(
        params["api-url"],
        prompt,
        anthropicParams
      );

      // Anthropic returns a single response, not multiple choices like OpenAI
      const newResponses = [
        {
          text: responseData.content[0].text,
          model: responseData.model,
        },
      ];

      await this.processResponses(
        newResponses,
        rollFocus,
        lastChildIndex,
        params["api-delay"]
      );
    } catch (error) {
      if (this.callbacks.showError) this.callbacks.showError(error.message);
      throw error;
    } finally {
      if (this.callbacks.setLoading) this.callbacks.setLoading(false);
      if (this.callbacks.renderTick) this.callbacks.renderTick();
    }
  }

  async openaiRoll(id) {
    if (this.callbacks.setLoading) this.callbacks.setLoading(true);

    try {
      if (this.callbacks.autoSaveTick) await this.callbacks.autoSaveTick();
      if (this.callbacks.updateFocusSummary)
        await this.callbacks.updateFocusSummary();

      const loomTree = this.callbacks.getLoomTree();
      const rollFocus = loomTree.nodeStore[id];
      const lastChildIndex =
        rollFocus.children.length > 0 ? rollFocus.children.length - 1 : null;

      const prompt = this.callbacks.getEditor().value;
      const params = this.prepareRollParams();

      const openaiParams = {
        "api-key": params["api-key"],
        "model-name": params["model-name"],
        "output-branches": params["output-branches"],
        "tokens-per-branch": params["tokens-per-branch"],
        temperature: params["temperature"],
        "top-p": params["top-p"],
      };

      const responseData = await APIProviders.openaiProvider(
        params["api-url"],
        prompt,
        openaiParams
      );

      const newResponses = responseData.choices.map(choice => ({
        text: choice.text,
        model: responseData.model,
      }));

      await this.processResponses(
        newResponses,
        rollFocus,
        lastChildIndex,
        params["api-delay"]
      );
    } catch (error) {
      if (this.callbacks.showError) this.callbacks.showError(error.message);
      throw error;
    } finally {
      if (this.callbacks.setLoading) this.callbacks.setLoading(false);
      if (this.callbacks.renderTick) this.callbacks.renderTick();
    }
  }

  async openaiChatCompletionsRoll(id) {
    if (this.callbacks.setLoading) this.callbacks.setLoading(true);

    try {
      if (this.callbacks.autoSaveTick) await this.callbacks.autoSaveTick();
      if (this.callbacks.updateFocusSummary)
        await this.callbacks.updateFocusSummary();

      const loomTree = this.callbacks.getLoomTree();
      const rollFocus = loomTree.nodeStore[id];
      const lastChildIndex =
        rollFocus.children.length > 0 ? rollFocus.children.length - 1 : null;
      const promptText = loomTree.renderNode(rollFocus);
      const params = this.prepareRollParams();

      const chatData = this.parseChatData(promptText);

      const requestBody = this.buildChatRequestBody(chatData, params);
      const headers = this.buildChatRequestHeaders(params);

      const responseData = await APIUtils.makeRequest(params["api-url"], {
        headers,
        body: requestBody,
      });

      await this.processChatResponses(
        responseData,
        chatData,
        rollFocus,
        lastChildIndex
      );
    } catch (error) {
      if (this.callbacks.showError) this.callbacks.showError(error.message);
      return;
    } finally {
      if (this.callbacks.setLoading) this.callbacks.setLoading(false);
      if (this.callbacks.renderTick) this.callbacks.renderTick();
    }
  }

  parseChatData(promptText) {
    try {
      const chatData = JSON.parse(promptText);
      if (!chatData.messages || !Array.isArray(chatData.messages)) {
        throw new Error("Invalid chat format: messages array not found");
      }
      return chatData;
    } catch (jsonError) {
      return {
        messages: [{ role: "user", content: promptText.trim() }],
      };
    }
  }

  buildChatRequestBody(chatData, params) {
    return {
      model: params["model-name"],
      messages: chatData.messages,
      max_completion_tokens: parseInt(params["tokens-per-branch"]),
      temperature: parseFloat(params["temperature"]),
      top_p: parseFloat(params["top-p"]),
      n: parseInt(params["output-branches"]),
    };
  }

  buildChatRequestHeaders(params) {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params["api-key"]}`,
    };
  }

  async processChatResponses(
    responseData,
    chatData,
    rollFocus,
    lastChildIndex
  ) {
    const loomTree = this.callbacks.getLoomTree();

    for (const choice of responseData.choices) {
      const assistantMessage = choice.message;
      const newChatData = JSON.parse(JSON.stringify(chatData));
      newChatData.messages.push({
        role: assistantMessage.role,
        content: assistantMessage.content,
      });

      const newChatText = JSON.stringify(newChatData, null, 2);
      const summary = await this.getSummary(
        assistantMessage.content || "Assistant response"
      );

      const responseNode = loomTree.createNode(
        "gen",
        rollFocus,
        newChatText,
        summary
      );
      this.callbacks.updateNodeMetadata(responseNode.id, {
        model: responseData.model,
        usage: responseData.usage,
        finish_reason: choice.finish_reason,
      });
    }

    this.updateFocus(rollFocus, lastChildIndex);
  }

  async processResponses(newResponses, rollFocus, lastChildIndex, apiDelay) {
    const loomTree = this.callbacks.getLoomTree();

    // Safety check for valid responses
    if (!Array.isArray(newResponses) || newResponses.length === 0) {
      console.warn(
        "processResponses called with invalid responses:",
        newResponses
      );
      return;
    }

    for (const response of newResponses) {
      // Safety check for valid response object
      if (!response || typeof response.text !== "string") {
        console.warn("Invalid response object:", response);
        continue;
      }

      const responseSummary = await APIUtils.delay(apiDelay).then(() => {
        return this.getSummary(response.text);
      });

      const childText = loomTree.renderNode(rollFocus) + response.text;
      const responseNode = loomTree.createNode(
        "gen",
        rollFocus,
        childText,
        responseSummary
      );

      this.callbacks.updateNodeMetadata(responseNode.id, {
        model: response.model,
      });
    }

    this.updateFocus(rollFocus, lastChildIndex);
  }

  updateFocus(rollFocus, lastChildIndex) {
    const currentFocus = this.callbacks.getFocus();
    const loomTree = this.callbacks.getLoomTree();

    if (currentFocus === rollFocus && this.callbacks.setFocus && loomTree) {
      if (lastChildIndex === null) {
        this.callbacks.setFocus(loomTree.nodeStore[rollFocus.children[0]]);
      } else {
        this.callbacks.setFocus(
          loomTree.nodeStore[rollFocus.children[lastChildIndex + 1]]
        );
      }
    }
  }
}

// Export the LLMService class
window.LLMService = LLMService;
