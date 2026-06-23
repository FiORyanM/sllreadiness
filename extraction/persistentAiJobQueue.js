import { chunkText } from "./llmExtractionAdapter.js";
import { buildChunkEvidencePrompt, buildFinalMergePrompt, validateChunkEvidence, validateFinalExtraction } from "./aiEvidenceSchema.js";
import { normalizeAiExtraction } from "./aiExtractionNormalizer.js";

const retryDelayMs = 5_000;
const rateLimitRetryDelayMs = 60_000;
const chunkMaxTokens = 4_000;
const mergeMaxTokens = 6_000;

export function createPersistentAiJobQueue({ repository, providers, sleep = delay, now = () => Date.now() }) {
  let workerRunning = false;
  let cleanupAt = 0;

  async function createJob({ text, metadata }) {
    const chunks = chunkText(text, { chunkSize: 10_000, overlap: 500 });
    const created = await repository.createOrReuseJob({ text, metadata, chunks });
    if (!created.job.cacheHit) void run();
    return created;
  }

  async function retryJob(id, token) {
    const job = await repository.retryAuthorizedJob(id, token);
    if (job && job.status !== "completed") void run();
    return job;
  }

  async function resume() {
    await repository.recoverInterruptedJobs();
    void run();
  }

  async function run() {
    if (workerRunning) return;
    workerRunning = true;
    try {
      if (now() >= cleanupAt) {
        await repository.cleanupExpired();
        cleanupAt = now() + 24 * 60 * 60 * 1_000;
      }
      const jobs = await repository.listRunnableJobs();
      for (const { id } of jobs) await processJob(id);
    } finally {
      workerRunning = false;
    }
  }

  async function processJob(jobId) {
    const job = await repository.getJob(jobId);
    if (!job || job.status === "completed" || job.status === "capacity_exhausted") return;
    await repository.updateJob(jobId, { status: "processing", stage: "AI analysis" });

    while (true) {
      const chunk = await repository.nextQueuedChunk(jobId);
      if (!chunk) break;
      await processChunk(job, chunk);
    }

    const chunks = await repository.listChunks(jobId);
    if (chunks.some((chunk) => chunk.status === "capacity_exhausted")) {
      await repository.updateJob(jobId, { status: "capacity_exhausted", stage: "Waiting for AI capacity", error: "All configured AI providers were unavailable for one or more sections." });
      return;
    }
    if (chunks.every((chunk) => chunk.status === "completed")) await mergeJob(jobId, job, chunks);
  }

  async function processChunk(job, chunk) {
    const candidate = providers[chunk.provider_cursor];
    if (!candidate) {
      await repository.updateChunk(chunk.id, { status: "capacity_exhausted", last_error: chunk.last_error || "All configured AI providers were unavailable." });
      return;
    }

    await repository.updateChunk(chunk.id, { status: "processing" });
    await repository.updateJob(job.id, { status: "processing", stage: `AI analysis ${chunk.position + 1}` });
    const metadata = { ...job.metadata, extractedCharCount: chunk.text.length, truncated: true, chunkIndex: chunk.position + 1 };

    try {
      await waitForProvider(candidate);
      const evidence = await candidate.invoke({
        prompt: buildChunkEvidencePrompt({ text: chunk.text, metadata }),
        schemaVersion: "sll-chunk-evidence.v1",
        config: { maxTokens: chunkMaxTokens, ...(candidate.config ?? {}) },
      });
      const validation = validateChunkEvidence(evidence, chunk.text);
      if (!validation.ok) throw new Error(`AI chunk JSON is incomplete: ${validation.missing.join(", ")}`);
      await repository.updateChunk(chunk.id, { status: "completed", evidence, last_error: null });
    } catch (error) {
      await handleChunkError(job.id, chunk, error);
    }
  }

  async function handleChunkError(jobId, chunk, error) {
    const message = error.message || "Unknown AI provider failure.";
    if (isTransient(message) && !chunk.retry_used) {
      await repository.updateChunk(chunk.id, { status: "queued", retry_used: true, last_error: message });
      await repository.updateJob(jobId, { stage: isRateLimited(message) ? `Rate limited by ${providers[chunk.provider_cursor]?.name ?? "AI provider"}; retrying section ${chunk.position + 1}` : `Retrying AI analysis ${chunk.position + 1}` });
      await sleep(retryDelayFor(message));
      return;
    }
    const nextProvider = chunk.provider_cursor + 1;
    await repository.updateChunk(chunk.id, {
      status: nextProvider >= providers.length ? "capacity_exhausted" : "queued",
      provider_cursor: nextProvider,
      retry_used: false,
      last_error: message,
    });
    await repository.updateJob(jobId, {
      stage: nextProvider >= providers.length ? "Waiting for AI capacity" : `Switching provider for section ${chunk.position + 1}`,
    });
  }

  async function mergeJob(jobId, job, chunks) {
    let mergeState = job;

    while (true) {
      const candidate = providers[mergeState.merge_provider_cursor];
      if (!candidate) {
        await repository.updateJob(jobId, { status: "capacity_exhausted", stage: "Waiting for AI capacity", error: "No AI provider could merge the completed sections." });
        return;
      }

      await repository.updateJob(jobId, { status: "merging", stage: "Merging AI analysis" });
      try {
        await waitForProvider(candidate);
        const rawExtraction = await candidate.invoke({
          prompt: buildFinalMergePrompt({ metadata: job.metadata, evidences: chunks.map((chunk) => chunk.evidence) }),
          schemaVersion: "sll-readiness-extraction.v1",
          config: { maxTokens: mergeMaxTokens, ...(candidate.config ?? {}) },
        });
        const extraction = normalizeAiExtraction(rawExtraction, {
          evidences: chunks.map((chunk) => chunk.evidence),
          metadata: job.metadata,
        });
        const validation = validateFinalExtraction(extraction);
        if (!validation.ok) throw new Error(`AI merge JSON is incomplete: ${validation.missing.join(", ")}`);
        await repository.updateJob(jobId, { status: "completed", stage: "Completed", result: { extraction, validation } });
        return;
      } catch (error) {
        const message = error.message || "Unknown AI merge failure.";
        if (isTransient(message) && !mergeState.merge_retry_used) {
          await repository.updateJob(jobId, { status: "merging", stage: "Retrying AI merge", merge_retry_used: true, error: message });
          mergeState = { ...mergeState, merge_retry_used: true };
          await sleep(retryDelayMs);
          continue;
        }
        const nextProvider = mergeState.merge_provider_cursor + 1;
        await repository.updateJob(jobId, {
          status: nextProvider >= providers.length ? "capacity_exhausted" : "merging",
          stage: nextProvider >= providers.length ? "Waiting for AI capacity" : "Switching merge provider",
          merge_provider_cursor: nextProvider,
          merge_retry_used: false,
          error: message,
        });
        mergeState = { ...mergeState, merge_provider_cursor: nextProvider, merge_retry_used: false };
      }
    }
  }

  async function waitForProvider(provider) {
    const waitMs = await repository.reserveProviderSlot(provider.name, provider.requestsPerMinute);
    if (waitMs > 0) await sleep(waitMs);
  }

  return { createJob, retryJob, resume, run };
}

function isTransient(message) {
  return /timeout|timed out|socket|network|econnreset|und_err|\b429\b|\b5\d\d\b|incomplete|unexpected end|unterminated string|expected ',' or '}'/i.test(message);
}

function isRateLimited(message) {
  return /\b429\b|rate limit|resource exhausted|quota/i.test(message);
}

function retryDelayFor(message) {
  return isRateLimited(message) ? rateLimitRetryDelayMs : retryDelayMs;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
