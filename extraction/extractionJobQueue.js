import { createHash, randomUUID } from "node:crypto";
import {
  chunkText,
  extractSllReadinessWithLlm,
  mergeChunkExtractions,
} from "./llmExtractionAdapter.js";
import { extractSllReadinessJson } from "./sllExtractionAdapter.js";

const retryDelaysMs = [5_000, 15_000, 45_000];
const cacheTtlMs = 24 * 60 * 60 * 1_000;
const cacheLimit = 30;

export function createExtractionJobQueue({ provider, requestsPerMinute = 20, now = () => Date.now(), sleep = delay } = {}) {
  if (!provider) throw new Error("An AI provider is required for extraction jobs.");

  const jobs = new Map();
  const cache = new Map();
  const activeJobsByCacheKey = new Map();
  const pending = [];
  const requestIntervalMs = Math.ceil(60_000 / requestsPerMinute);
  let workerRunning = false;
  let nextRequestAt = 0;

  function createJob({ text, metadata }) {
    const cacheKey = createCacheKey(text);
    const cached = cache.get(cacheKey);

    if (cached && cached.expiresAt > now()) {
      const job = completedJob({ cacheKey, metadata, result: cached.result, cacheHit: true });
      jobs.set(job.id, job);
      return snapshot(job);
    }

    if (cached) cache.delete(cacheKey);

    const activeJobId = activeJobsByCacheKey.get(cacheKey);
    if (activeJobId) {
      const activeJob = jobs.get(activeJobId);
      if (activeJob) return snapshot(activeJob);
      activeJobsByCacheKey.delete(cacheKey);
    }

    const chunks = prioritizeChunks(chunkText(text, { chunkSize: 16_000, overlap: 700 }));
    const job = {
      id: randomUUID(),
      cacheKey,
      text,
      metadata,
      chunks,
      results: [],
      status: "queued",
      stage: "Queued for AI analysis",
      completedChunks: 0,
      totalChunks: chunks.length,
      fallbackChunks: 0,
      createdAt: now(),
      updatedAt: now(),
      error: null,
      result: null,
    };

    jobs.set(job.id, job);
    activeJobsByCacheKey.set(cacheKey, job.id);
    pending.push(job.id);
    void runWorker();
    return snapshot(job);
  }

  function getJob(id) {
    const job = jobs.get(id);
    return job ? snapshot(job) : null;
  }

  async function runWorker() {
    if (workerRunning) return;
    workerRunning = true;

    while (pending.length) {
      const job = jobs.get(pending.shift());
      if (!job || job.status !== "queued") continue;

      try {
        await processJob(job);
      } catch (error) {
        job.status = "failed";
        job.stage = "Analysis failed";
        job.error = error.message;
        job.updatedAt = now();
      } finally {
        activeJobsByCacheKey.delete(job.cacheKey);
      }
    }

    workerRunning = false;
  }

  async function processJob(job) {
    job.status = "processing";
    job.stage = "Running local pre-screen";
    job.updatedAt = now();

    for (const [index, chunk] of job.chunks.entries()) {
      job.stage = `AI analysis ${index + 1} / ${job.chunks.length} sections`;
      job.updatedAt = now();

      const chunkMetadata = {
        ...job.metadata,
        extractedCharCount: chunk.text.length,
        truncated: true,
        chunkIndex: index + 1,
        chunkCount: job.chunks.length,
      };

      try {
        const result = await extractWithBackoff({ text: chunk.text, metadata: chunkMetadata });
        if (!result.ok) throw new Error(`Chunk validation failed: ${result.validation?.missing?.join(", ") || "unknown"}`);
        job.results.push(result.extraction);
      } catch (error) {
        // A rules-based extraction keeps the report usable after persistent provider failures.
        job.results.push(extractSllReadinessJson({ text: chunk.text, metadata: chunkMetadata }));
        job.fallbackChunks += 1;
      }

      job.completedChunks = index + 1;
      job.updatedAt = now();
    }

    job.stage = "Merging SLL readiness report";
    job.updatedAt = now();
    const extraction = mergeChunkExtractions(job.results, job.metadata);
    const result = {
      extraction,
      validation: { ok: true, missing: [] },
      fallbackChunks: job.fallbackChunks,
    };

    job.result = result;
    job.status = "completed";
    job.stage = job.fallbackChunks ? "Completed with rules fallback" : "Completed";
    job.updatedAt = now();
    remember(job.cacheKey, result);
  }

  async function extractWithBackoff({ text, metadata }) {
    let lastError;

    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
      try {
        await waitForRateLimit();
        return await extractSllReadinessWithLlm({ text, metadata, provider });
      } catch (error) {
        lastError = error;
        if (attempt === retryDelaysMs.length || !isRetryable(error)) break;
        await sleep(retryDelaysMs[attempt]);
      }
    }

    throw lastError;
  }

  async function waitForRateLimit() {
    const waitMs = Math.max(0, nextRequestAt - now());
    if (waitMs) await sleep(waitMs);
    nextRequestAt = now() + requestIntervalMs;
  }

  function remember(cacheKey, result) {
    cache.set(cacheKey, { result, expiresAt: now() + cacheTtlMs });
    while (cache.size > cacheLimit) cache.delete(cache.keys().next().value);
  }

  function snapshot(job) {
    return {
      id: job.id,
      status: job.status,
      stage: job.stage,
      progress: { completed: job.completedChunks, total: job.totalChunks },
      cacheHit: job.cacheHit ?? false,
      fallbackChunks: job.fallbackChunks,
      error: job.error,
      result: job.status === "completed" ? job.result : undefined,
    };
  }

  function completedJob({ cacheKey, metadata, result, cacheHit }) {
    return {
      id: randomUUID(),
      cacheKey,
      metadata,
      status: "completed",
      stage: "Completed from cache",
      completedChunks: 0,
      totalChunks: 0,
      fallbackChunks: result.fallbackChunks,
      createdAt: now(),
      updatedAt: now(),
      error: null,
      result,
      cacheHit,
    };
  }

  return { createJob, getJob };
}

function prioritizeChunks(chunks) {
  return chunks
    .map((text, index) => ({ text, index, score: preScreenScore(text) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

function preScreenScore(text) {
  const matches = text.match(/ghg|emissions|energy|target|assurance|sustainability indicators?|about this report|scope [123]|invest|capex|capital expenditure|green project|carbon credit|offset|residual emissions/gi);
  return matches?.length ?? 0;
}

function createCacheKey(text) {
  return createHash("sha256").update(text).digest("hex");
}

function isRetryable(error) {
  return /\b429\b|timeout|timed out|socket|network|econnreset|und_err/i.test(error.message);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
