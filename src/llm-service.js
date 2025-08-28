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

// Unified API client for all providers
class APIClient {
  static async callProvider(providerType, endpoint, prompt, params) {
    switch (providerType) {
      case "base":
        return this.baseProvider(endpoint, prompt, params);
      case "openai":
        return this.openaiProvider(endpoint, prompt, params);
      case "openai-chat":
        return this.openaiChatProvider(endpoint, prompt, params);
      case "openrouter":
        return this.openrouterProvider(endpoint, prompt, params);
      case "together":
        return this.togetherProvider(endpoint, prompt, params);
      case "anthropic":
        return this.anthropicProvider(endpoint, prompt, params);
      default:
        throw new Error(`Unknown provider type: ${providerType}`);
    }
  }

  static async baseProvider(endpoint, prompt, params) {
    const response = await HTTPClient.makeRequest(endpoint + "generate", {
      body: {
        prompt: prompt,
        prompt_node: true,
        evaluationPrompt: "",
        tokens_per_branch: params.tokensPerBranch,
        output_branches: params.outputBranches,
      },
    });

    // Base provider returns an array of responses, extract finish reasons
    return response.map((item, index) => ({
      text: item.text,
      model: item.model || "base-model",
      finish_reason: item.finish_reason || "stop", // Base provider typically stops naturally
    }));
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

    const response = await HTTPClient.makeRequest(endpoint, {
      headers,
      body: requestBody,
    });

    // Extract finish reasons from OpenAI response
    return response.choices.map(choice => ({
      text: choice.text,
      model: response.model,
      finish_reason: choice.finish_reason,
    }));
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

    const response = await HTTPClient.makeRequest(endpoint, {
      headers,
      body: requestBody,
    });

    // Extract finish reasons from OpenAI Chat response
    return response.choices.map(choice => ({
      text: choice.message.content,
      model: response.model,
      finish_reason: choice.finish_reason,
    }));
  }

  static async openrouterProvider(endpoint, prompt, params) {
    const authToken = `Bearer ${params.apiKey}`;
    const apiDelay = Number(params.delay || 0);

    const batchPromises = [];
    const calls = params.outputBranches;

    for (let i = 1; i <= calls; i++) {
      const body = {
        model: params.modelName,
        prompt: prompt,
        max_tokens: Number(params.tokensPerBranch),
        n: 1,
        temperature: Number(params.temperature),
        top_p: Number(params.topP),
        top_k: Number(params.topK),
        repetition_penalty: Number(params.repetitionPenalty),
        provider: { require_parameters: true },
      };

      const promise = HTTPClient.delay(apiDelay * i)
        .then(() => {
          const headers = {
            accept: "application/json",
            Authorization: authToken,
            "HTTP-Referer": "https://github.com/JD-P/miniloom",
            "X-Title": "MiniLoom",
          };

          return HTTPClient.makeRequest(endpoint, {
            headers,
            body,
          });
        })
        .then(responseJson => {
          return responseJson.choices.map(choice => ({
            text: choice.text,
            model: responseJson.model,
            finish_reason: choice.finish_reason,
          }));
        });

      batchPromises.push(promise);
    }

    const batch = await Promise.all(batchPromises);
    return batch.flat();
  }

  static async togetherProvider(endpoint, prompt, params) {
    const authToken = `Bearer ${params.apiKey}`;
    const apiDelay = Number(params.delay || 0);

    const batchPromises = [];
    const calls = params.outputBranches;

    for (let i = 1; i <= calls; i++) {
      const body = {
        model: params.modelName,
        prompt: prompt,
        max_tokens: Number(params.tokensPerBranch),
        n: 1,
        temperature: Number(params.temperature),
        top_p: Number(params.topP),
        top_k: Number(params.topK),
        repetition_penalty: Number(params.repetitionPenalty),
      };

      const promise = HTTPClient.delay(apiDelay * i)
        .then(() => {
          const headers = {
            accept: "application/json",
            Authorization: authToken,
          };

          return HTTPClient.makeRequest(endpoint, {
            headers,
            body,
          });
        })
        .then(responseJson => {
          return responseJson.output.choices.map(choice => ({
            text: choice.text,
            model: responseJson.model,
            finish_reason: choice.finish_reason,
          }));
        });

      batchPromises.push(promise);
    }

    const batch = await Promise.all(batchPromises);
    return batch.flat();
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

    const response = await HTTPClient.makeRequest(endpoint, {
      headers,
      body: requestBody,
    });

    // Extract finish reasons from Anthropic response
    return [
      {
        text: response.content[0].text,
        model: response.model,
        finish_reason: response.stop_reason,
      },
    ];
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

    // Use unified provider call for summary generation
    if (
      [
        "base",
        "openai",
        "openai-chat",
        "openrouter",
        "together",
        "anthropic",
      ].includes(samplingMethod)
    ) {
      const summaryParams = {
        ...params,
        tokensPerBranch: 10,
        outputBranches: 1,
      };

      try {
        const response = await APIClient.callProvider(
          samplingMethod,
          endpoint,
          prompt,
          summaryParams
        );

        if (samplingMethod === "openai-chat") {
          return window.utils.extractThreeWords(response[0].text);
        } else if (samplingMethod === "anthropic") {
          return window.utils.extractThreeWords(response[0].text);
        } else if (samplingMethod === "base") {
          return window.utils.extractThreeWords(response[0].text);
        } else {
          // openai, openrouter, together
          return window.utils.extractThreeWords(response[0].text);
        }
      } catch (error) {
        console.warn("Summary generation failed:", error);
        return "Summary Failed";
      }
    } else {
      return "Summary Not Available";
    }
  }

  // Main generation entry point - now directly maps to provider methods
  async generateNewResponses(nodeId) {
    const params = this.prepareGenerationParams();
    const samplingMethod = params.samplingMethod;

    // Direct method mapping - names now match settings dropdown exactly
    const methodMap = {
      base: () => this.generateWithProvider(nodeId, "base"),
      openai: () => this.generateWithProvider(nodeId, "openai"),
      "openai-chat": () => this.generateWithOpenAIChat(nodeId),
      openrouter: () => this.generateWithProvider(nodeId, "openrouter"),
      together: () => this.generateWithProvider(nodeId, "together"),
      anthropic: () => this.generateWithProvider(nodeId, "anthropic"),
    };

    const method = methodMap[samplingMethod] || methodMap["base"];
    await method();
  }

  // Unified generation method for most providers
  async generateWithProvider(nodeId, providerType) {
    await this.executeGeneration(nodeId, async () => {
      const params = this.prepareGenerationParams();
      const prompt = this.callbacks.getEditor().value;

      const providerParams = {
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

      const newResponses = await APIClient.callProvider(
        providerType,
        params.apiUrl,
        prompt,
        providerParams
      );

      return newResponses;
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

      // Check if no tokens were generated and model finished
      const hasNoContent = !response.text || response.text.trim() === "";
      const isFinished =
        response.finish_reason === "stop" ||
        response.finish_reason === "end_turn" ||
        response.finish_reason === "assistant";

      let responseSummary;
      if (hasNoContent && isFinished) {
        responseSummary = "Text Complete";
      } else {
        responseSummary = await HTTPClient.delay(apiDelay).then(() => {
          return this.generateSummary(response.text);
        });
      }

      const childText = loomTree.renderNode(rollFocus) + response.text;
      const responseNode = loomTree.createNode(
        "gen",
        rollFocus,
        childText,
        responseSummary
      );

      this.callbacks.updateNodeMetadata(responseNode.id, {
        model: response.model,
        finishReason: response.finish_reason,
      });

      // Update search index
      if (this.callbacks.updateSearchIndex) {
        this.callbacks.updateSearchIndex(
          responseNode,
          loomTree.renderNode(responseNode)
        );
      }
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

      // Check if no tokens were generated and model finished
      const hasNoContent =
        !assistantMessage.content || assistantMessage.content.trim() === "";
      const isFinished =
        choice.finish_reason === "stop" ||
        choice.finish_reason === "end_turn" ||
        choice.finish_reason === "assistant";

      let summary;
      if (hasNoContent && isFinished) {
        summary = "Text Complete";
      } else {
        summary = await this.generateSummary(
          assistantMessage.content || "Assistant response"
        );
      }

      const responseNode = loomTree.createNode(
        "gen",
        rollFocus,
        newChatText,
        summary
      );
      this.callbacks.updateNodeMetadata(responseNode.id, {
        model: responseData.model,
        usage: responseData.usage,
        finishReason: choice.finish_reason,
      });

      // Update search index
      if (this.callbacks.updateSearchIndex) {
        this.callbacks.updateSearchIndex(
          responseNode,
          loomTree.renderNode(responseNode)
        );
      }
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
