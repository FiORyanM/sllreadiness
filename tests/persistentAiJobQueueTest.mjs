import assert from "node:assert/strict";
import { createPersistentAiJobQueue } from "../extraction/persistentAiJobQueue.js";
import { extractSllReadinessJson } from "../extraction/sllExtractionAdapter.js";
import { sllExtractionSchemaVersion } from "../extraction/sllExtractionSchema.js";

class MemoryRepository {
  constructor() {
    this.jobs = new Map();
    this.chunks = new Map();
    this.nextId = 1;
  }

  async createOrReuseJob({ metadata: jobMetadata, chunks }) {
    const id = `job-${this.nextId++}`;
    this.jobs.set(id, {
      id,
      metadata: jobMetadata,
      status: "queued",
      stage: "Queued for AI analysis",
      merge_provider_cursor: 0,
      merge_retry_used: false,
      result: null,
      error: null,
    });
    this.chunks.set(
      id,
      chunks.map((text, position) => ({ id: `${id}-${position}`, job_id: id, position, text, status: "queued", provider_cursor: 0, retry_used: false })),
    );
    return { job: this.snapshot(id), token: `token-${id}` };
  }

  async retryAuthorizedJob(id, token) {
    if (token !== `token-${id}` || !this.jobs.has(id)) return null;
    for (const chunk of this.chunks.get(id)) {
      if (chunk.status === "capacity_exhausted" || chunk.status === "failed") {
        Object.assign(chunk, { status: "queued", provider_cursor: 0, retry_used: false, last_error: null });
      }
    }
    Object.assign(this.jobs.get(id), { status: "queued", stage: "Queued for AI retry", merge_provider_cursor: 0, merge_retry_used: false, error: null });
    return this.snapshot(id);
  }

  async recoverInterruptedJobs() {}
  async cleanupExpired() {}
  async reserveProviderSlot() { return 0; }
  async listRunnableJobs() { return [...this.jobs.values()].filter((job) => ["queued", "processing", "merging"].includes(job.status)).map(({ id }) => ({ id })); }
  async getJob(id) { return this.jobs.get(id) ?? null; }
  async listChunks(id) { return [...(this.chunks.get(id) ?? [])].sort((a, b) => a.position - b.position); }
  async nextQueuedChunk(id) { return (await this.listChunks(id)).find((chunk) => chunk.status === "queued") ?? null; }
  async updateChunk(id, patch) { Object.assign(this.findChunk(id), patch); }
  async updateJob(id, patch) { Object.assign(this.jobs.get(id), patch); }

  snapshot(id) {
    const job = this.jobs.get(id);
    const chunks = this.chunks.get(id) ?? [];
    return {
      id,
      status: job.status,
      stage: job.stage,
      result: job.result,
      progress: {
        completed: chunks.filter((chunk) => chunk.status === "completed").length,
        total: chunks.length,
        exhausted: chunks.filter((chunk) => chunk.status === "capacity_exhausted").length,
      },
    };
  }

  findChunk(id) {
    for (const chunks of this.chunks.values()) {
      const found = chunks.find((chunk) => chunk.id === id);
      if (found) return found;
    }
    throw new Error(`Chunk ${id} not found.`);
  }
}

const metadata = {
  fileName: "persistent-test.pdf",
  fileSizeBytes: 1000,
  pageCount: 3,
  extractedCharCount: 0,
  truncated: false,
};

const sourceText = "Sustainability report: GHG emissions, Scope 1, Scope 2, targets, methodology, annual reporting and limited assurance. ".repeat(1_000);

const failoverRepository = new MemoryRepository();
let nvidiaCalls = 0;
let geminiCalls = 0;
const rateLimitDelays = [];
const failoverQueue = createPersistentAiJobQueue({
  repository: failoverRepository,
  providers: [
    {
      name: "nvidia",
      requestsPerMinute: 60_000,
      invoke: async () => {
        nvidiaCalls += 1;
        throw new Error("NVIDIA API failed with 429: rate limited");
      },
    },
    {
      name: "gemini",
      requestsPerMinute: 60_000,
      invoke: async (request) => {
        geminiCalls += 1;
        return responseFor(request);
      },
    },
  ],
  sleep: async (milliseconds) => rateLimitDelays.push(milliseconds),
});

const failoverCreated = await failoverQueue.createJob({ text: sourceText, metadata: { ...metadata, extractedCharCount: sourceText.length } });
await waitFor(() => failoverRepository.snapshot(failoverCreated.job.id).status === "completed");
const failoverResult = failoverRepository.snapshot(failoverCreated.job.id);
assert.equal(failoverResult.status, "completed");
assert.equal(failoverResult.progress.completed, failoverResult.progress.total);
assert.equal(nvidiaCalls > 0, true);
assert.equal(geminiCalls > 0, true);
assert.equal(rateLimitDelays.includes(60_000), false);
assert.equal(failoverResult.result.extraction.schemaVersion, sllExtractionSchemaVersion);

const retryRepository = new MemoryRepository();
let allowSecondChunk = false;
let completedEvidenceCalls = 0;
const retryQueue = createPersistentAiJobQueue({
  repository: retryRepository,
  providers: [
    {
      name: "nvidia",
      requestsPerMinute: 60_000,
      invoke: async (request) => {
        if (request.schemaVersion === "sll-chunk-evidence.v1") {
          completedEvidenceCalls += 1;
          if (!allowSecondChunk && completedEvidenceCalls > 1) throw new Error("NVIDIA API failed with 429: rate limited");
        }
        return responseFor(request);
      },
    },
  ],
  sleep: async () => {},
});

const retryCreated = await retryQueue.createJob({ text: sourceText, metadata: { ...metadata, extractedCharCount: sourceText.length } });
await waitFor(() => retryRepository.snapshot(retryCreated.job.id).status === "capacity_exhausted");
const beforeRetry = retryRepository.snapshot(retryCreated.job.id);
assert.equal(beforeRetry.progress.completed, 1);
assert.equal(beforeRetry.progress.exhausted > 0, true);

allowSecondChunk = true;
await retryQueue.retryJob(retryCreated.job.id, retryCreated.token);
await waitFor(() => retryRepository.snapshot(retryCreated.job.id).status === "completed");
const afterRetry = retryRepository.snapshot(retryCreated.job.id);
assert.equal(afterRetry.progress.completed, afterRetry.progress.total);
assert.equal(afterRetry.result.extraction.schemaVersion, sllExtractionSchemaVersion);

const transientRepository = new MemoryRepository();
const delays = [];
let transientCalls = 0;
const transientQueue = createPersistentAiJobQueue({
  repository: transientRepository,
  providers: [
    {
      name: "nvidia",
      requestsPerMinute: 60_000,
      invoke: async (request) => {
        transientCalls += 1;
        if (transientCalls === 1) throw new Error("NVIDIA API request timed out after 100ms.");
        return responseFor(request);
      },
    },
  ],
  sleep: async (milliseconds) => delays.push(milliseconds),
});

const transientCreated = await transientQueue.createJob({ text: "GHG target and assurance. ".repeat(30), metadata });
await waitFor(() => transientRepository.snapshot(transientCreated.job.id).status === "completed");
assert.equal(delays.includes(5_000), true);

const malformedJsonRepository = new MemoryRepository();
const malformedJsonDelays = [];
let malformedJsonCalls = 0;
const malformedJsonQueue = createPersistentAiJobQueue({
  repository: malformedJsonRepository,
  providers: [
    {
      name: "gemini",
      requestsPerMinute: 60_000,
      invoke: async (request) => {
        malformedJsonCalls += 1;
        if (malformedJsonCalls === 1) throw new Error("Unexpected end of JSON input");
        return responseFor(request);
      },
    },
  ],
  sleep: async (milliseconds) => malformedJsonDelays.push(milliseconds),
});

const malformedJsonCreated = await malformedJsonQueue.createJob({ text: "GHG target and assurance. ".repeat(30), metadata });
await waitFor(() => malformedJsonRepository.snapshot(malformedJsonCreated.job.id).status === "completed");
assert.equal(malformedJsonDelays.includes(5_000), true);

console.log("Persistent AI job queue tests passed.");

function responseFor(request) {
  if (request.schemaVersion === "sll-chunk-evidence.v1") {
    return {
      schemaVersion: "sll-chunk-evidence.v1",
      companyHints: { name: "Test company", reportTitle: "Test ESG report", reportingYear: "2024" },
      evidence: [{ topic: "KPI", finding: "GHG emissions target disclosed", sourceQuote: "GHG emissions target", pageNumbers: [1], confidence: "high" }],
      notes: [],
    };
  }

  return {
    ...extractSllReadinessJson({ text: "GHG emissions target methodology annual report limited assurance", metadata }),
    schemaVersion: sllExtractionSchemaVersion,
    extractionMode: "test-ai-merge",
  };
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("Timed out waiting for persistent queue state.");
}
