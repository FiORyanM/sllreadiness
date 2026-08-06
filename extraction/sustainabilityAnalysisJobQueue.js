import { createHash, randomUUID } from "node:crypto";
import { sustainabilityBenchmarkData } from "../data/sustainabilityBenchmarks.js";
import { buildSustainabilityAnalysis, sustainabilityAnalysisFrameworkVersion } from "../models/sustainabilityAnalysisModel.js";

const cacheTtlMs = 7 * 24 * 60 * 60 * 1_000;

export function createSustainabilityAnalysisJobQueue({ repository = createLocalRepository(), now = () => Date.now() } = {}) {
  const processing = new Set();

  async function createJob({ sourceJobId, token, profile, options = {} }) {
    const cacheKey = analysisCacheKey(sourceJobId, profile, options);
    const created = await repository.createOrReuse({
      sourceJobId,
      token,
      cacheKey,
      input: { profile, options },
      frameworkVersion: sustainabilityAnalysisFrameworkVersion,
      benchmarkVersion: sustainabilityBenchmarkData.version,
      expiresAt: new Date(now() + cacheTtlMs).toISOString(),
    });
    if (created.job.status !== "completed") void processJob(created.job.id);
    return created.job;
  }

  async function processJob(id) {
    if (processing.has(id)) return;
    processing.add(id);
    try {
      const job = await repository.get(id);
      if (!job || ["completed", "cancelled"].includes(job.status)) return;
      await repository.update(id, { status: "processing", stage: "Building sustainability benchmark analysis", error: null });
      const latest = await repository.get(id);
      if (!latest || latest.status === "cancelled") return;
      const result = buildSustainabilityAnalysis(latest.input.profile, latest.input.options);
      const afterBuild = await repository.get(id);
      if (!afterBuild || afterBuild.status === "cancelled") return;
      await repository.update(id, { status: "completed", stage: "Completed", result, error: null });
    } catch (error) {
      await repository.update(id, { status: "failed", stage: "Analysis failed", error: error.message });
    } finally {
      processing.delete(id);
    }
  }

  async function getAuthorized(id, token) {
    return repository.getAuthorized(id, token);
  }

  async function retry(id, token) {
    const job = await repository.getAuthorized(id, token);
    if (!job) return null;
    if (job.status === "completed") return job;
    await repository.update(id, { status: "queued", stage: "Queued for retry", error: null });
    void processJob(id);
    return repository.getAuthorized(id, token);
  }

  async function cancel(id, token) {
    const job = await repository.getAuthorized(id, token);
    if (!job) return null;
    if (job.status === "completed") return job;
    await repository.update(id, { status: "cancelled", stage: "Cancelled by user", error: null });
    return repository.getAuthorized(id, token);
  }

  async function resume() {
    const jobs = await repository.listRunnable();
    jobs.forEach((job) => void processJob(job.id));
  }

  return { createJob, getAuthorized, retry, cancel, resume };
}

export function createLocalSustainabilityAnalysisRepository({ now = () => Date.now() } = {}) {
  return createLocalRepository(now);
}

function createLocalRepository(now = () => Date.now()) {
  const jobs = new Map();

  return {
    async createOrReuse({ sourceJobId, token, cacheKey, input, frameworkVersion, benchmarkVersion, expiresAt }) {
      const cached = [...jobs.values()].find((job) => job.cacheKey === cacheKey && job.status === "completed" && Date.parse(job.expiresAt) > now());
      if (cached) return { job: snapshot({ ...cached, cacheHit: true }) };
      const job = {
        id: randomUUID(),
        sourceJobId,
        tokenHash: sha256(token),
        cacheKey,
        input,
        frameworkVersion,
        benchmarkVersion,
        status: "queued",
        stage: "Queued for sustainability analysis",
        result: null,
        error: null,
        cacheHit: false,
        expiresAt,
        createdAt: new Date(now()).toISOString(),
      };
      jobs.set(job.id, job);
      return { job: snapshot(job) };
    },
    async get(id) {
      return jobs.get(id) ?? null;
    },
    async getAuthorized(id, token) {
      const job = jobs.get(id);
      return job && token && job.tokenHash === sha256(token) ? snapshot(job) : null;
    },
    async update(id, patch) {
      const job = jobs.get(id);
      if (job) Object.assign(job, patch, { updatedAt: new Date(now()).toISOString() });
    },
    async listRunnable() {
      return [...jobs.values()].filter((job) => ["queued", "processing"].includes(job.status));
    },
  };
}

function analysisCacheKey(sourceJobId, profile, options) {
  return sha256(JSON.stringify({
    sourceJobId,
    profile,
    sector: options.sectorOverride,
    frameworkVersion: sustainabilityAnalysisFrameworkVersion,
    benchmarkVersion: sustainabilityBenchmarkData.version,
  }));
}

function snapshot(job) {
  return {
    id: job.id,
    sourceJobId: job.sourceJobId,
    status: job.status,
    stage: job.stage,
    cacheHit: job.cacheHit ?? false,
    frameworkVersion: job.frameworkVersion,
    benchmarkVersion: job.benchmarkVersion,
    error: job.error,
    result: job.status === "completed" ? job.result : undefined,
  };
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
