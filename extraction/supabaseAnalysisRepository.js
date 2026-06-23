import { createHash, randomBytes } from "node:crypto";

export class SupabaseAnalysisRepository {
  constructor({ url = process.env.SUPABASE_URL, serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY, fetchImpl = fetch } = {}) {
    if (!url || !serviceRoleKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for AI extraction jobs.");
    this.url = url.replace(/\/$/, "");
    this.serviceRoleKey = serviceRoleKey;
    this.fetch = fetchImpl;
  }

  async createOrReuseJob({ text, metadata, chunks }) {
    // Include the pipeline version so contract-valid but semantically invalid
    // results from earlier scoring logic are not reused from the cache.
    const reportHash = sha256(`sll-readiness-v8-evidence-page-selection:${text}`);
    const cached = await this.findCachedResult(reportHash);
    const token = createToken();
    const job = {
      report_hash: reportHash,
      metadata,
      status: cached ? "completed" : "queued",
      stage: cached ? "Completed from cache" : "Queued for AI analysis",
      job_token_hash: sha256(token),
      result: cached?.result ?? null,
      expires_at: expiresAt(),
    };
    const [created] = await this.request("/rest/v1/analysis_jobs", { method: "POST", body: job, prefer: "return=representation" });

    if (!cached) {
      await this.request("/rest/v1/analysis_chunks", {
        method: "POST",
        body: chunks.map((chunk, position) => ({ job_id: created.id, position, text: chunk, status: "queued" })),
      });
    }

    return { job: await this.snapshot(created.id), token };
  }

  async getAuthorizedJob(id, token) {
    if (!token) return null;
    const [job] = await this.request(`/rest/v1/analysis_jobs?select=*&id=eq.${encodeURIComponent(id)}&job_token_hash=eq.${sha256(token)}`);
    return job ? this.snapshot(job.id) : null;
  }

  async retryAuthorizedJob(id, token) {
    const job = await this.getAuthorizedJob(id, token);
    if (!job) return null;
    if (job.status === "completed") return job;

    await this.request(`/rest/v1/analysis_chunks?job_id=eq.${encodeURIComponent(id)}&status=in.(capacity_exhausted,failed)`, {
      method: "PATCH",
      body: { status: "queued", provider_cursor: 0, retry_used: false, last_error: null, updated_at: new Date().toISOString() },
    });
    await this.updateJob(id, {
      status: "queued",
      stage: "Queued for AI retry",
      error: null,
      merge_provider_cursor: 0,
      merge_retry_used: false,
    });
    return this.snapshot(id);
  }

  async recoverInterruptedJobs() {
    await this.request("/rest/v1/analysis_chunks?status=eq.processing", {
      method: "PATCH",
      body: { status: "queued", updated_at: new Date().toISOString() },
    });
    await this.request("/rest/v1/analysis_jobs?status=in.(processing,merging)", {
      method: "PATCH",
      body: { status: "queued", stage: "Resuming AI analysis", updated_at: new Date().toISOString() },
    });
  }

  async listRunnableJobs() {
    return this.request("/rest/v1/analysis_jobs?select=id&status=in.(queued,processing,merging)&order=created_at.asc");
  }

  async getJob(id) {
    const [job] = await this.request(`/rest/v1/analysis_jobs?select=*&id=eq.${encodeURIComponent(id)}`);
    return job ?? null;
  }

  async listChunks(jobId) {
    return this.request(`/rest/v1/analysis_chunks?select=*&job_id=eq.${encodeURIComponent(jobId)}&order=position.asc`);
  }

  async nextQueuedChunk(jobId) {
    const chunks = await this.request(
      `/rest/v1/analysis_chunks?select=*&job_id=eq.${encodeURIComponent(jobId)}&status=eq.queued&order=position.asc&limit=1`,
    );
    return chunks[0] ?? null;
  }

  async updateChunk(id, patch) {
    await this.request(`/rest/v1/analysis_chunks?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: { ...patch, updated_at: new Date().toISOString() },
    });
  }

  async updateJob(id, patch) {
    await this.request(`/rest/v1/analysis_jobs?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: { ...patch, updated_at: new Date().toISOString() },
    });
  }

  async reserveProviderSlot(providerName, requestsPerMinute) {
    const result = await this.request("/rest/v1/rpc/reserve_provider_slot", {
      method: "POST",
      body: { p_provider: providerName, p_requests_per_minute: requestsPerMinute },
    });
    return Number(result ?? 0);
  }

  async cleanupExpired() {
    await this.request(`/rest/v1/analysis_jobs?expires_at=lt.${encodeURIComponent(new Date().toISOString())}`, { method: "DELETE" });
  }

  async snapshot(id) {
    const job = await this.getJob(id);
    if (!job) return null;
    const chunks = await this.listChunks(id);
    const completed = chunks.filter((chunk) => chunk.status === "completed").length;
    const exhausted = chunks.filter((chunk) => chunk.status === "capacity_exhausted").length;
    return {
      id: job.id,
      status: job.status,
      stage: job.stage,
      progress: { completed, total: chunks.length, exhausted },
      cacheHit: job.stage === "Completed from cache",
      error: job.error,
      result: job.status === "completed" ? job.result : undefined,
    };
  }

  async findCachedResult(reportHash) {
    const jobs = await this.request(
      `/rest/v1/analysis_jobs?select=result&report_hash=eq.${reportHash}&status=eq.completed&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&order=created_at.desc&limit=1`,
    );
    return jobs[0] ?? null;
  }

  async request(path, { method = "GET", body, prefer } = {}) {
    const response = await this.fetch(`${this.url}${path}`, {
      method,
      headers: {
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
        "Content-Type": "application/json",
        ...(prefer ? { Prefer: prefer } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Supabase request failed with ${response.status}: ${text.slice(0, 500)}`);
    return text ? JSON.parse(text) : null;
  }
}

function createToken() {
  return randomBytes(32).toString("base64url");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function expiresAt() {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString();
}
