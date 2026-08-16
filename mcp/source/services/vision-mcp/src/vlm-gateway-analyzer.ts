/**
 * VLM Gateway Analyzer — uses LiteLLM gateway (gemini-2.5-flash) for image analysis.
 *
 * Unlike the Ollama-based vlm-analyzer.js, this module calls the remote LiteLLM
 * gateway configured via VISION_MCP_VLM_GATEWAY_URL. It is designed for
 * non-vision-capable frontier models (e.g. GLM-5.2) that need a text-only
 * analysis result from the vision-mcp infrastructure.
 *
 * The gateway supports OpenAI-compatible /v1/chat/completions with image_url
 * content parts, so we send the image as a data URL or HTTP URL and receive
 * a text description back.
 */

import fetch from "node-fetch";

export interface VlmGatewayOptions {
  gatewayUrl?: string;
  gatewayKey?: string;
  model?: string;
  fallbackModels?: string[];
  timeoutMs?: number;
  maxTokens?: number;
  context?: string;
  temperature?: number;
}

export interface VlmAnalysisResult {
  ok: boolean;
  modelUsed?: string;
  text: string;
  error?: string;
  fallbackAttempted?: boolean;
  processingTimeMs?: number;
}

const DEFAULT_OPTIONS: Required<Omit<VlmGatewayOptions, "context">> = {
  gatewayUrl: process.env.VISION_MCP_VLM_GATEWAY_URL || "",
  gatewayKey: process.env.VISION_MCP_VLM_GATEWAY_KEY || "",
  model: process.env.VISION_MCP_VLM_MODEL || "gemini-2.5-flash",
  fallbackModels: (process.env.VISION_MCP_VLM_MODELS || "gemini-2.5-flash")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  timeoutMs: parseInt(process.env.VISION_MCP_VLM_TIMEOUT_MS || "60000", 10),
  maxTokens: parseInt(process.env.VISION_MCP_VLM_MAX_TOKENS || "2000", 10),
  temperature: 0.3,
};

/**
 * Build the prompt for the VLM based on the context.
 * The prompt asks for a structured text analysis that a non-vision model
 * can use to make decisions about the image.
 */
function buildAnalysisPrompt(context: string): string {
  const contextBlock = context ? `Additional context: ${context}\n\n` : "";

  return `${contextBlock}Analyze this image thoroughly and return a structured text report.

Focus on:
1. Overall layout and composition — describe what is where on the page
2. Text content — transcribe all visible text, noting its position
3. Visual issues — any overlapping elements, misalignment, cut-off text, cramped spacing, or unprofessional appearance
4. Color and contrast — any readability issues
5. Specific problems — if this is a document or letter, check formatting quality, header/footer alignment, signature blocks, table formatting
6. Verdict — is this document visually professional and ready for official submission? If not, list specific fixes needed.

Be specific and actionable. A non-vision AI model will use your description to decide whether changes are needed.`;
}

/**
 * Call the LiteLLM gateway with an image and get a text analysis back.
 *
 * @param imageUrlOrBase64 - URL of the image, or base64 data URI
 * @param options - Gateway configuration
 * @returns VlmAnalysisResult with the text analysis
 */
export async function analyzeImageWithVlmGateway(
  imageUrlOrBase64: string,
  options: VlmGatewayOptions = {},
): Promise<VlmAnalysisResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();

  if (!opts.gatewayUrl) {
    return {
      ok: false,
      text: "",
      error: "VLM gateway URL not configured (VISION_MCP_VLM_GATEWAY_URL missing)",
    };
  }

  // Determine if input is a URL or base64 data URI
  const isDataUri = imageUrlOrBase64.startsWith("data:");
  const imageUrl = isDataUri
    ? imageUrlOrBase64
    : imageUrlOrBase64;

  // Build the chat completion request (OpenAI-compatible format)
  const prompt = buildAnalysisPrompt(opts.context || "general analysis");

  const modelsToTry = [opts.model, ...opts.fallbackModels.filter((m) => m !== opts.model)];
  let lastError = "";

  for (const model of modelsToTry) {
    try {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(
        () => controller.abort(),
        opts.timeoutMs,
      );

      const body: Record<string, unknown> = {
        model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: imageUrl,
                },
              },
              {
                type: "text",
                text: prompt,
              },
            ],
          },
        ],
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
      };

      const response = await fetch(opts.gatewayUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.gatewayKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutHandle);

      if (!response.ok) {
        const errorText = await response.text();
        lastError = `Gateway HTTP ${response.status} for model ${model}: ${errorText.slice(0, 300)}`;
        console.error(`[vlm-gateway-analyzer] ${lastError}`);
        continue; // Try next fallback model
      }

      const data = (await response.json()) as Record<string, unknown>;
      const choices = Array.isArray(data?.choices) ? data.choices : [];
      const firstChoice = choices[0] as Record<string, unknown> | undefined;
      const message = firstChoice?.message as Record<string, unknown> | undefined;
      const text =
        (typeof message?.content === "string" ? message.content : "") ||
        (typeof firstChoice?.text === "string" ? firstChoice.text : "") ||
        "";

      if (!text || text.trim().length === 0) {
        lastError = `Empty response from model ${model}`;
        console.error(`[vlm-gateway-analyzer] ${lastError}`);
        continue;
      }

      const processingTimeMs = Date.now() - startTime;

      return {
        ok: true,
        modelUsed: model,
        text: text.trim(),
        processingTimeMs,
        fallbackAttempted: model !== opts.model,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = `Model ${model} failed: ${message}`;
      console.error(`[vlm-gateway-analyzer] ${lastError}`);
      continue; // Try next fallback model
    }
  }

  return {
    ok: false,
    text: "",
    error: `All VLM models failed. Last error: ${lastError}`,
    fallbackAttempted: true,
    processingTimeMs: Date.now() - startTime,
  };
}
