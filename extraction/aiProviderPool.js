import { geminiProvider } from "./providers/geminiProvider.js";
import { groqProvider } from "./providers/groqProvider.js";
import { nvidiaProvider } from "./providers/nvidiaProvider.js";

export function configuredAiProviders(environment = process.env) {
  return [
    provider("nvidia", nvidiaProvider, environment.NVIDIA_API_KEY, environment.NVIDIA_MODEL, environment.NVIDIA_REQUESTS_PER_MINUTE),
    provider("nvidia-qwen", nvidiaProvider, environment.NVIDIA_API_KEY, environment.NVIDIA_QWEN_MODEL, environment.NVIDIA_QWEN_REQUESTS_PER_MINUTE),
    provider("gemini", geminiProvider, environment.GEMINI_API_KEY, environment.GEMINI_MODEL, environment.GEMINI_REQUESTS_PER_MINUTE),
    provider("groq", groqProvider, environment.GROQ_API_KEY, environment.GROQ_MODEL, environment.GROQ_REQUESTS_PER_MINUTE),
  ].filter(Boolean);
}

function provider(name, invoke, apiKey, model, rpm) {
  if (!apiKey || !model) return null;
  // NVIDIA model variants share one API key and therefore one upstream quota.
  const rateLimitKey = name.startsWith("nvidia") ? "nvidia-shared-api-key" : name;
  return { name, rateLimitKey, invoke, config: { apiKey, model }, requestsPerMinute: positiveInteger(rpm, 20) };
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
