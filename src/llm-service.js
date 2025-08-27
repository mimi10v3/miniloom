// HTTP request utilities
class HTTPClient {
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
}

// API client implementations for different providers
class APIClient {
  static async baseProvider(endpoint, prompt, params) {
    return HTTPClient.makeRequest(endpoint + "generate", {
      body: {
        prompt: prompt,
        prompt_node: true,
        evaluationPrompt: "",
        tokens_per_branch: params.tokensPerBranch,
        output_branches: params.outputBranches,
      },
    });
  }

  static async openaiProvider(endpoint, prompt, params) {
    const headers = {
      Authorization: `Bearer ${params.apiKey}`,
    };
    const requestBody = {
      model: params.modelName,
      prompt: prompt,
      max_tokens: Number(params.tokensPerBranch),
      n: Number(params.outputBranches),
      temperature: Number(params.temperature),
      top_p: Number(params.topP),
    };

    return HTTPClient.makeRequest(endpoint, {
      headers,
      body: requestBody,
    });
  }

  static async openaiChatProvider(endpoint, prompt, params) {
    const headers = {
      Authorization: `Bearer ${params.apiKey}`,
    };
    const requestBody = {
      messages: [{ role: "system", content: prompt }],
      model: params.modelName,
      max_completion_tokens: params.tokensPerBranch,
      temperature: params.temperature,
      top_p: params.topP,
    };

    return HTTPClient.makeRequest(endpoint, {
      headers,
      body: requestBody,
    });
  }

  static async anthropicProvider(endpoint, prompt, params) {
    const headers = {
      "Content-Type": "application/json",
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
    };
    const requestBody = {
      model: params.modelName,
      messages: [{ role: "user", content: prompt }],
      max_tokens: Number(params.tokensPerBranch),
      temperature: Number(params.temperature),
      top_p: Number(params.topP),
    };

    return HTTPClient.makeRequest(endpoint, {
      headers,
      body: requestBody,
    });
  }

  static async togetherProvider(endpoint, prompt, params, apiType = "openai") {
    const authToken = `Bearer ${params.apiKey}`;
    const apiDelay = Number(params.delay || 0);

    const batchPromises = [];
    const calls = apiType === "openai" ? 1 : params.outputBranches;

    for (let i = 1; i <= calls; i++) {
      const body = {
        model: params.modelName,
        prompt: prompt,
        max_tokens: Number(params.tokensPerBranch),
        n: apiType === "openai" ? Number(params.outputBranches) : 1,
        temperature: Number(params.temperature),
        top_p: Number(params.topP),
        top_k: Number(params.topK),
        repetition_penalty: Number(params.repetitionPenalty),
      };

      if (apiType === "openrouter") {
        body.provider = { require_parameters: true };
      }

      const promise = HTTPClient.delay(apiDelay * i)
        .then(() =>
          HTTPClient.makeRequest(endpoint, {
            headers: {
              accept: "application/json",
              Authorization: authToken,
            },
            body,
          })
        )
        .then(responseJson => {
          const choices =
            apiType === "openai" || apiType === "openrouter"
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
    return apiType === "openai" ? batch[0] : batch.flat();
  }
}

// Main LLM Service class
class LLMService {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
  }

  // Configuration and parameter management
  prepareGenerationParams() {
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
      samplingMethod: serviceData["sampling-method"] || "base",
      apiUrl: serviceData["service-api-url"] || "",
      modelName: serviceData["service-model-name"] || "",
      apiDelay: parseInt(serviceData["service-api-delay"]) || 3000,
      apiKey: apiKey,

      // Sampler parameters
      outputBranches: parseInt(samplerData["output-branches"]) || 2,
      tokensPerBranch: parseInt(samplerData["tokens-per-branch"]) || 256,
      temperature: parseFloat(samplerData["temperature"]) || 0.9,
      topP: parseFloat(samplerData["top-p"]) || 1,
      topK: parseInt(samplerData["top-k"]) || 100,
      repetitionPenalty: parseFloat(samplerData["repetition-penalty"]) || 1,
    };
  }

  // Core generation methods
  async generateResponses(
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
      tokens_per_branch: weaveParams.tokens_per_branch,
      output_branches: weaveParams.output_branches,
    };

    return HTTPClient.makeRequest(finalEndpoint, { body: params });
  }

  async generateSummary(taskText) {
    if (!taskText || typeof taskText !== "string") {
      console.warn("generateSummary called with invalid taskText:", taskText);
      return "Summary Not Available";
    }

    const params = this.prepareGenerationParams();
    const endpoint = params.apiUrl;

    const summarizePromptTemplate =
      await window.electronAPI.readPromptFile("summarize.txt");
    const summarizePrompt = summarizePromptTemplate.replace(
      "{MODEL_NAME}",
      params.modelName
    );

    // Limit context to 8 * 512 characters (average word length * word count)
    const prompt =
      summarizePrompt +
      "\n\n<tasktext>\n" +
      taskText.slice(-4096) +
      "\n</tasktext>\n\nThree Words:";

    const samplingMethod = params.samplingMethod;

    if (
      ["together", "openrouter", "openai", "openai-chat"].includes(
        samplingMethod
      )
    ) {
      if (samplingMethod === "openai-chat") {
        const response = await APIClient.openaiChatProvider(endpoint, prompt, {
          ...params,
          tokensPerBranch: 10,
          outputBranches: 1,
        });

        const text = response.choices[0].message.content;
        return window.utils.extractThreeWords(text);
      } else if (samplingMethod === "openai") {
        const openaiParams = {
          apiKey: params.apiKey,
          outputBranches: 1,
          modelName: params.modelName,
          tokensPerBranch: 10,
          temperature: params.temperature,
          topP: params.topP,
        };

        const responseData = await APIClient.openaiProvider(
          endpoint,
          prompt,
          openaiParams
        );

        return window.utils.extractThreeWords(responseData.choices[0].text);
      } else {
        const togetherParams = {
          apiKey: params.apiKey,
          outputBranches: 1,
          modelName: params.modelName,
          tokensPerBranch: 10,
          temperature: params.temperature,
          topP: params.topP,
          topK: params.topK,
          repetitionPenalty: params.repetitionPenalty,
        };

        const batch = await APIClient.togetherProvider(
          endpoint,
          prompt,
          togetherParams,
          samplingMethod
        );

        return window.utils.extractThreeWords(batch[0].text);
      }
    } else {
      const response = await APIClient.baseProvider(endpoint, prompt, {
        tokensPerBranch: 10,
        outputBranches: 1,
      });

      return window.utils.extractThreeWords(response[1].text);
    }
  }

  // Main generation entry point
  async generateNewResponses(nodeId) {
    const params = this.prepareGenerationParams();
    const samplingMethod = params.samplingMethod;

    const methodMap = {
      base: () => this.generateWithTogether(nodeId, "base"),
      together: () => this.generateWithTogether(nodeId, "together"),
      openrouter: () => this.generateWithTogether(nodeId, "openrouter"),
      openai: () => this.generateWithOpenAI(nodeId),
      "openai-chat": () => this.generateWithOpenAIChat(nodeId),
      anthropic: () => this.generateWithAnthropic(nodeId),
    };

    const method = methodMap[samplingMethod] || methodMap["base"];
    await method();
  }

  // Generation implementation methods
  async generateWithTogether(nodeId, apiType = "openai") {
    await this.executeGeneration(nodeId, async () => {
      const params = this.prepareGenerationParams();
      const prompt = this.callbacks.getEditor().value;

      const togetherParams = {
        apiKey: params.apiKey,
        modelName: params.modelName,
        outputBranches: params.outputBranches,
        tokensPerBranch: params.tokensPerBranch,
        temperature: params.temperature,
        topP: params.topP,
        topK: params.topK,
        repetitionPenalty: params.repetitionPenalty,
        delay: params.apiDelay,
      };

      const newResponses = await APIClient.togetherProvider(
        params.apiUrl,
        prompt,
        togetherParams,
        apiType
      );

      return newResponses;
    });
  }

  async generateWithAnthropic(nodeId) {
    await this.executeGeneration(nodeId, async () => {
      const params = this.prepareGenerationParams();
      const prompt = this.callbacks.getEditor().value;

      const anthropicParams = {
        apiKey: params.apiKey,
        modelName: params.modelName,
        outputBranches: params.outputBranches,
        tokensPerBranch: params.tokensPerBranch,
        temperature: params.temperature,
        topP: params.topP,
      };

      const responseData = await APIClient.anthropicProvider(
        params.apiUrl,
        prompt,
        anthropicParams
      );

      return [
        {
          text: responseData.content[0].text,
          model: responseData.model,
        },
      ];
    });
  }

  async generateWithOpenAI(nodeId) {
    await this.executeGeneration(nodeId, async () => {
      const params = this.prepareGenerationParams();
      const prompt = this.callbacks.getEditor().value;

      const openaiParams = {
        apiKey: params.apiKey,
        modelName: params.modelName,
        outputBranches: params.outputBranches,
        tokensPerBranch: params.tokensPerBranch,
        temperature: params.temperature,
        topP: params.topP,
      };

      const responseData = await APIClient.openaiProvider(
        params.apiUrl,
        prompt,
        openaiParams
      );

      return responseData.choices.map(choice => ({
        text: choice.text,
        model: responseData.model,
      }));
    });
  }

  async generateWithOpenAIChat(nodeId) {
    await this.executeGeneration(nodeId, async () => {
      const params = this.prepareGenerationParams();
      const loomTree = this.callbacks.getLoomTree();
      const rollFocus = loomTree.nodeStore[nodeId];
      const promptText = loomTree.renderNode(rollFocus);

      const chatData = this.parseChatData(promptText);
      const requestBody = this.buildChatRequestBody(chatData, params);
      const headers = this.buildChatRequestHeaders(params);

      const responseData = await HTTPClient.makeRequest(params.apiUrl, {
        headers,
        body: requestBody,
      });

      await this.processChatResponses(
        responseData,
        chatData,
        rollFocus,
        this.getLastChildIndex(rollFocus)
      );

      return []; // Chat responses are processed separately
    });
  }

  // Common generation execution pattern
  async executeGeneration(nodeId, generationFunction) {
    if (this.callbacks.setLoading) this.callbacks.setLoading(true);

    const loomTree = this.callbacks.getLoomTree();
    loomTree.setNodeGenerationPending(nodeId, true);
    loomTree.clearNodeError(nodeId);

    try {
      if (this.callbacks.autoSaveTick) await this.callbacks.autoSaveTick();
      if (this.callbacks.updateFocusSummary)
        await this.callbacks.updateFocusSummary();

      const rollFocus = loomTree.nodeStore[nodeId];
      const lastChildIndex = this.getLastChildIndex(rollFocus);

      const newResponses = await generationFunction();

      if (newResponses.length > 0) {
        await this.processResponses(
          newResponses,
          rollFocus,
          lastChildIndex,
          this.prepareGenerationParams().apiDelay
        );
      }
    } catch (error) {
      const loomTree = this.callbacks.getLoomTree();
      loomTree.setNodeError(nodeId, error.message);

      if (this.callbacks.showError) this.callbacks.showError(error.message);
      throw error;
    } finally {
      const loomTree = this.callbacks.getLoomTree();
      loomTree.setNodeGenerationPending(nodeId, false);

      if (this.callbacks.setLoading) this.callbacks.setLoading(false);
    }
  }

  // Response processing
  async processResponses(newResponses, rollFocus, lastChildIndex, apiDelay) {
    const loomTree = this.callbacks.getLoomTree();

    if (!Array.isArray(newResponses) || newResponses.length === 0) {
      console.warn(
        "processResponses called with invalid responses:",
        newResponses
      );
      return;
    }

    loomTree.clearNodeError(rollFocus.id);

    for (const response of newResponses) {
      if (!response || typeof response.text !== "string") {
        console.warn("Invalid response object:", response);
        continue;
      }

      const responseSummary = await HTTPClient.delay(apiDelay).then(() => {
        return this.generateSummary(response.text);
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

    // Update tree view to show new badges
    if (this.callbacks.updateTreeView) {
      this.callbacks.updateTreeView();
    }

    this.updateFocus(rollFocus, lastChildIndex);
  }

  async processChatResponses(
    responseData,
    chatData,
    rollFocus,
    lastChildIndex
  ) {
    const loomTree = this.callbacks.getLoomTree();

    loomTree.clearNodeError(rollFocus.id);

    for (const choice of responseData.choices) {
      const assistantMessage = choice.message;
      const newChatData = JSON.parse(JSON.stringify(chatData));
      newChatData.messages.push({
        role: assistantMessage.role,
        content: assistantMessage.content,
      });

      const newChatText = JSON.stringify(newChatData, null, 2);
      const summary = await this.generateSummary(
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

    // Update tree view to show new badges
    if (this.callbacks.updateTreeView) {
      this.callbacks.updateTreeView();
    }

    this.updateFocus(rollFocus, lastChildIndex);
  }

  // Chat-specific utilities
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
      model: params.modelName,
      messages: chatData.messages,
      max_completion_tokens: parseInt(params.tokensPerBranch),
      temperature: parseFloat(params.temperature),
      top_p: parseFloat(params.topP),
      n: parseInt(params.outputBranches),
    };
  }

  buildChatRequestHeaders(params) {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    };
  }

  // Utility methods
  getLastChildIndex(rollFocus) {
    return rollFocus.children.length > 0 ? rollFocus.children.length - 1 : null;
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

window.LLMService = LLMService;
