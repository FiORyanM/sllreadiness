import { createHash, randomUUID } from "node:crypto";
import { illustrativeCreditStrategyMarket } from "../data/creditStrategyMarket.js";
import { buildCreditStrategyAnalysis, creditStrategyFrameworkVersion } from "../models/creditStrategyModel.js";

const cacheTtlMs = 7 * 24 * 60 * 60 * 1_000;
export const creditEvidencePromptVersion = "credit-evidence-map.v1";

export function createCreditStrategyJobQueue({ repository = createLocalCreditStrategyRepository(), evidenceMapper, now = () => Date.now() } = {}) {
  const processing = new Set();

  async function createJob({ sourceJobId, token, company, evidenceProfile, questionnaire, confirmedOverrides = {} }) {
    const input = { company, evidenceProfile, questionnaire, confirmedOverrides };
    const cacheKey = sha256(JSON.stringify({
      sourceJobId,
      evidenceProfile,
      promptVersion: creditEvidencePromptVersion,
      frameworkVersion: creditStrategyFrameworkVersion,
      marketVersion: illustrativeCreditStrategyMarket.version,
    }));
    const created = await repository.createOrReuse({
      sourceJobId,
      token,
      cacheKey,
      input,
      frameworkVersion: creditStrategyFrameworkVersion,
      marketVersion: illustrativeCreditStrategyMarket.version,
      expiresAt: new Date(now() + cacheTtlMs).toISOString(),
    });
    if (created.job.status === "completed" && created.job.cacheHit && created.job.result?.evidenceProfile) {
      const result = buildCreditStrategyAnalysis({
        company,
        evidenceProfile: mergeConfirmedOverrides(created.job.result.evidenceProfile, confirmedOverrides),
        questionnaire,
      });
      result.aiEnrichment = created.job.result.aiEnrichment ?? { used: false, fallback: false, promptVersion: creditEvidencePromptVersion };
      return { ...created.job, result };
    }
    if (created.job.status !== "completed") void processJob(created.job.id);
    return created.job;
  }

  async function processJob(id) {
    if (processing.has(id)) return;
    processing.add(id);
    try {
      const job = await repository.get(id);
      if (!job || ["completed", "cancelled"].includes(job.status)) return;
      await repository.update(id, { status: "processing", stage: "Mapping cited semiconductor evidence", error: null });
      let mappedEvidence = mergeConfirmedOverrides(job.input.evidenceProfile, job.input.confirmedOverrides);
      let aiEnrichment = { used: false, fallback: false, promptVersion: creditEvidencePromptVersion };
      if (evidenceMapper) {
        try {
          const mapped = await evidenceMapper(mappedEvidence);
          mappedEvidence = applySafeAiMappings(mappedEvidence, mapped);
          aiEnrichment = { used: true, fallback: false, promptVersion: creditEvidencePromptVersion };
        } catch {
          aiEnrichment = { used: false, fallback: true, promptVersion: creditEvidencePromptVersion };
        }
      }
      const latest = await repository.get(id);
      if (!latest || latest.status === "cancelled") return;
      const result = buildCreditStrategyAnalysis({
        company: job.input.company,
        evidenceProfile: mappedEvidence,
        questionnaire: job.input.questionnaire,
      });
      result.aiEnrichment = aiEnrichment;
      if (aiEnrichment.fallback) {
        result.scores.capitalAllocation.confidence = lowerConfidence(result.scores.capitalAllocation.confidence);
        result.scores.currentPortfolio.confidence = lowerConfidence(result.scores.currentPortfolio.confidence);
      }
      await repository.update(id, { status: "completed", stage: aiEnrichment.fallback ? "Completed with deterministic fallback" : "Completed", result, error: null });
    } catch (error) {
      await repository.update(id, { status: "failed", stage: "Credit strategy analysis failed", error: error.message });
    } finally {
      processing.delete(id);
    }
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

  return { createJob, getAuthorized: repository.getAuthorized, retry, cancel, resume };
}

export function createLocalCreditStrategyRepository({ now = () => Date.now() } = {}) {
  const jobs = new Map();
  return {
    async createOrReuse({ sourceJobId, token, cacheKey, input, frameworkVersion, marketVersion, expiresAt }) {
      const cached = [...jobs.values()].find((job) => job.cacheKey === cacheKey && job.status === "completed" && Date.parse(job.expiresAt) > now());
      if (cached) return { job: snapshot({ ...cached, cacheHit: true }) };
      const job = {
        id: randomUUID(),
        sourceJobId,
        tokenHash: sha256(token),
        cacheKey,
        input,
        frameworkVersion,
        marketVersion,
        status: "queued",
        stage: "Queued for credit strategy analysis",
        result: null,
        error: null,
        cacheHit: false,
        expiresAt,
      };
      jobs.set(job.id, job);
      return { job: snapshot(job) };
    },
    async get(id) { return jobs.get(id) ?? null; },
    async getAuthorized(id, token) {
      const job = jobs.get(id);
      return job && token && job.tokenHash === sha256(token) ? snapshot(job) : null;
    },
    async update(id, patch) { const job = jobs.get(id); if (job) Object.assign(job, patch, { updatedAt: new Date(now()).toISOString() }); },
    async listRunnable() { return [...jobs.values()].filter((job) => ["queued", "processing"].includes(job.status)); },
  };
}

export function buildCreditEvidencePrompt(profile) {
  return [
    "Map cited sustainability evidence to semiconductor decarbonization levers.",
    "Return strict JSON only. Do not add or estimate any numeric amount, emissions, abatement, year, volume or price.",
    "Only classify projects that already contain a valid citation.",
    "Allowed levers: process_gases, renewable_electricity, energy_efficiency, scope3_supply_chain, low_carbon_materials, other.",
    'Shape: {"projectMappings":[{"name":"existing project name","lever":"allowed lever","interpretation":"short evidence-grounded explanation","citationQuote":"exact supplied quote"}],"unknowns":["string"]}',
    JSON.stringify(profile),
  ].join("\n");
}

function applySafeAiMappings(profile, value) {
  const mappings = Array.isArray(value?.projectMappings) ? value.projectMappings : [];
  const projects = (profile.projects ?? profile.internalInvestments ?? []).map((project) => {
    const citationQuotes = (project.citations ?? []).map((citation) => citation.quote);
    const mapping = mappings.find((item) =>
      item?.name === project.name &&
      citationQuotes.includes(item.citationQuote) &&
      ["process_gases", "renewable_electricity", "energy_efficiency", "scope3_supply_chain", "low_carbon_materials", "other"].includes(item.lever),
    );
    return mapping ? { ...project, lever: mapping.lever, interpretation: String(mapping.interpretation ?? "") } : project;
  });
  return { ...profile, projects };
}

function mergeConfirmedOverrides(profile, overrides) {
  return {
    ...profile,
    ...overrides,
    emissions: { ...(profile.emissions ?? {}), ...(overrides.emissions ?? {}) },
    target: { ...(profile.target ?? {}), ...(overrides.target ?? {}) },
    projects: Array.isArray(overrides.projects) ? overrides.projects : (profile.projects ?? profile.internalInvestments ?? []),
    currentPortfolio: overrides.currentPortfolio ?? profile.currentPortfolio ?? profile.carbonCredits,
  };
}

function snapshot(job) {
  return {
    id: job.id,
    sourceJobId: job.sourceJobId,
    status: job.status,
    stage: job.stage,
    cacheHit: job.cacheHit ?? false,
    frameworkVersion: job.frameworkVersion,
    marketVersion: job.marketVersion,
    error: job.error,
    result: job.status === "completed" ? job.result : undefined,
  };
}

function lowerConfidence(value) {
  return value === "High" ? "Medium" : "Low";
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
