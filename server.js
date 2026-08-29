import { randomBytes } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { configuredAiProviders } from "./extraction/aiProviderPool.js";
import { buildCreditEvidencePrompt, createCreditStrategyJobQueue, createLocalCreditStrategyRepository } from "./extraction/creditStrategyJobQueue.js";
import { createExtractionJobQueue } from "./extraction/extractionJobQueue.js";
import { createPersistentAiJobQueue } from "./extraction/persistentAiJobQueue.js";
import { SupabaseAnalysisRepository, createSupabaseCreditStrategyRepository, createSupabaseSustainabilityAnalysisRepository } from "./extraction/supabaseAnalysisRepository.js";
import { createLocalSustainabilityAnalysisRepository, createSustainabilityAnalysisJobQueue } from "./extraction/sustainabilityAnalysisJobQueue.js";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
loadDotEnv();

const port = Number(process.env.PORT ?? 3002);
const host = normalizeHost(process.env.HOST ?? (process.env.PORT ? "0.0.0.0" : "127.0.0.1"));
const maxJsonBytes = 2 * 1024 * 1024;
const maxReportHtmlChars = 1_500_000;
const maxConcurrentPdfExports = 2;
const extractionJobs = createPersistentExtractionJobs();
const sustainabilityJobs = createSustainabilityJobs(extractionJobs.repository);
const creditStrategyJobs = createCreditStrategyJobs(extractionJobs.repository, extractionJobs.primaryProvider);
const reportExportTemplate = readFileSync(join(rootDir, "report-export.html"), "utf8");
const reportStyles = readFileSync(join(rootDir, "styles.css"), "utf8");
const reportExportStyles = readFileSync(join(rootDir, "report-export.css"), "utf8");
let pdfBrowserPromise = null;
let activePdfExports = 0;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

const server = createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/health") {
      sendJson(response, 200, { ok: true, service: "sll-readiness-tool", providers: extractionJobs.providerNames ?? [] });
      return;
    }

    if (request.method === "POST" && request.url === "/api/report-pdf") {
      await handleCreateReportPdf(request, response);
      return;
    }

    if (request.method === "POST" && (request.url === "/api/extraction-jobs" || request.url === "/api/extract-sll")) {
      await handleCreateExtractionJob(request, response);
      return;
    }

    if (request.method === "POST" && extractionJobIdFromUrl(request.url, "/sustainability-analyses")) {
      await handleCreateSustainabilityAnalysis(request, response);
      return;
    }

    if (request.method === "POST" && extractionJobIdFromUrl(request.url, "/credit-strategy-analyses")) {
      await handleCreateCreditStrategyAnalysis(request, response);
      return;
    }

    if (request.method === "POST" && creditStrategyAnalysisIdFromUrl(request.url, "/retry")) {
      await handleRetryCreditStrategyAnalysis(request, response);
      return;
    }

    if (request.method === "POST" && creditStrategyAnalysisIdFromUrl(request.url, "/cancel")) {
      await handleCancelCreditStrategyAnalysis(request, response);
      return;
    }

    if (request.method === "GET" && creditStrategyAnalysisIdFromUrl(request.url)) {
      await handleGetCreditStrategyAnalysis(request, response);
      return;
    }

    if (request.method === "POST" && sustainabilityAnalysisIdFromUrl(request.url, "/retry")) {
      await handleRetrySustainabilityAnalysis(request, response);
      return;
    }

    if (request.method === "POST" && sustainabilityAnalysisIdFromUrl(request.url, "/cancel")) {
      await handleCancelSustainabilityAnalysis(request, response);
      return;
    }

    if (request.method === "GET" && sustainabilityAnalysisIdFromUrl(request.url)) {
      await handleGetSustainabilityAnalysis(request, response);
      return;
    }

    if (request.method === "POST" && extractionJobIdFromUrl(request.url, "/retry")) {
      await handleRetryExtractionJob(request, response);
      return;
    }

    if (request.method === "POST" && extractionJobIdFromUrl(request.url, "/cancel")) {
      await handleCancelExtractionJob(request, response);
      return;
    }

    if (request.method === "GET" && extractionJobIdFromUrl(request.url)) {
      await handleGetExtractionJob(request, response);
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      await serveStatic(request, response);
      return;
    }

    sendJson(response, 405, { ok: false, message: "Method not allowed." });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { ok: false, message: "Server error.", detail: error.message });
  }
});

server.listen(port, host, () => {
  console.log(`SLL Readiness Tool running at http://${host}:${port}`);
});

process.once("SIGTERM", () => void shutdownServer());
process.once("SIGINT", () => void shutdownServer());

async function shutdownServer() {
  const browserPromise = pdfBrowserPromise;
  pdfBrowserPromise = null;
  await browserPromise?.then((browser) => browser.close()).catch(() => {});
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5_000).unref();
}

async function handleCreateReportPdf(request, response) {
  if (activePdfExports >= maxConcurrentPdfExports) {
    sendJson(response, 429, { ok: false, message: "PDF export is busy. Try again in a moment." });
    return;
  }

  const body = await readJsonBody(request);
  const reportHtml = String(body.html ?? "").trim();
  const title = cleanReportTitle(body.title);

  if (!reportHtml || reportHtml.length > maxReportHtmlChars) {
    sendJson(response, 400, { ok: false, message: "The report snapshot is missing or too large to export." });
    return;
  }

  const sanitizedReportHtml = sanitizeReportHtml(reportHtml);
  if (!/class=(?:"[^"]*\breport-page\b[^"]*"|'[^']*\breport-page\b[^']*')/i.test(sanitizedReportHtml)) {
    sendJson(response, 400, { ok: false, message: "The submitted content is not a report snapshot." });
    return;
  }

  activePdfExports += 1;
  let context;

  try {
    const browser = await getPdfBrowser();
    context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.route("**/*", (route) => route.abort());
    await page.setContent(buildReportExportDocument({ title, reportHtml: sanitizedReportHtml }), {
      waitUntil: "load",
      timeout: 20_000,
    });
    await page.emulateMedia({ media: "print" });

    const pdf = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: `<div style="box-sizing:border-box;width:100%;padding:0 10mm;color:#667481;font-family:Arial,sans-serif;font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(title)}</div>`,
      footerTemplate: '<div style="box-sizing:border-box;display:flex;width:100%;padding:0 10mm;color:#667481;font-family:Arial,sans-serif;font-size:8px;"><span style="flex:1;">SLL Readiness Report</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>',
      timeout: 45_000,
    });

    const filename = `${safePdfFilename(title)}-sll-readiness-report.pdf`;
    response.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Length": pdf.length,
      "Content-Disposition": contentDisposition(filename),
      "Cache-Control": "no-store",
    });
    response.end(pdf);
  } catch (error) {
    console.error("PDF export failed:", error);
    sendJson(response, 503, {
      ok: false,
      code: "PDF_EXPORT_UNAVAILABLE",
      message: "Server-side PDF export is temporarily unavailable. Use browser print instead.",
    });
  } finally {
    activePdfExports -= 1;
    await context?.close().catch(() => {});
  }
}

function getPdfBrowser() {
  if (!pdfBrowserPromise) {
    pdfBrowserPromise = chromium
      .launch({
        headless: true,
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
        args: ["--disable-dev-shm-usage"],
      })
      .catch((error) => {
        pdfBrowserPromise = null;
        throw error;
      });
  }
  return pdfBrowserPromise;
}

function buildReportExportDocument({ title, reportHtml }) {
  return reportExportTemplate
    .replace("{{REPORT_TITLE}}", escapeHtml(title))
    .replace("{{REPORT_STYLES}}", reportStyles)
    .replace("{{EXPORT_STYLES}}", reportExportStyles)
    .replace("{{REPORT_CONTENT}}", reportHtml);
}

function sanitizeReportHtml(value) {
  return value
    .replace(/<(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|style|iframe|object|embed|link|meta|base)\b[^>]*\/?\s*>/gi, "")
    .replace(/\s(?:on[a-z]+|src|srcset|formaction)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript\s*:/gi, "");
}

function cleanReportTitle(value) {
  return String(value ?? "Company")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "Company";
}

function safePdfFilename(value) {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .toLowerCase() || "company";
}

function contentDisposition(filename) {
  const asciiName = filename.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function handleCreateExtractionJob(request, response) {
  const body = await readJsonBody(request);
  const text = String(body.text ?? "");
  const metadata = body.metadata ?? {};

  if (text.length < 500) {
    sendJson(response, 400, {
      ok: false,
      message: "Extracted text is too short for AI analysis.",
    });
    return;
  }

  if (!extractionJobs.queue) {
    sendJson(response, 503, { ok: false, message: extractionJobs.error });
    return;
  }

  const { job, token } = await extractionJobs.createJob({ text, metadata });
  sendJson(response, job.cacheHit ? 200 : 202, { ok: true, job, jobToken: token });
}

async function handleCreateSustainabilityAnalysis(request, response) {
  const sourceJobId = extractionJobIdFromUrl(request.url, "/sustainability-analyses");
  const token = request.headers["x-extraction-job-token"];
  const sourceJob = await extractionJobs.getAuthorizedJob(sourceJobId, token);
  if (!sourceJob) {
    sendJson(response, 404, { ok: false, message: "Extraction job was not found or the job token is invalid." });
    return;
  }
  const extraction = sourceJob.result?.extraction;
  if (sourceJob.status !== "completed" || !extraction) {
    sendJson(response, 409, { ok: false, message: "Complete the report extraction before generating sustainability analysis." });
    return;
  }
  const body = await readJsonBody(request);
  const sectorOverride = ["semiconductors", "ict_technology", "development_finance", "market_only"].includes(body.sectorOverride)
    ? body.sectorOverride
    : undefined;
  const job = await sustainabilityJobs.createJob({
    sourceJobId,
    token,
    profile: extraction.analysis?.sustainabilityProfile ?? {},
    options: { sectorOverride },
  });
  sendJson(response, job.status === "completed" ? 200 : 202, { ok: true, job });
}

async function handleCreateCreditStrategyAnalysis(request, response) {
  const sourceJobId = extractionJobIdFromUrl(request.url, "/credit-strategy-analyses");
  const token = request.headers["x-extraction-job-token"];
  const sourceJob = await extractionJobs.getAuthorizedJob(sourceJobId, token);
  if (!sourceJob) {
    sendJson(response, 404, { ok: false, message: "Extraction job was not found or the job token is invalid." });
    return;
  }
  const extraction = sourceJob.result?.extraction;
  if (sourceJob.status !== "completed" || !extraction) {
    sendJson(response, 409, { ok: false, message: "Complete report extraction before building a credit strategy." });
    return;
  }
  const body = await readJsonBody(request);
  const job = await creditStrategyJobs.createJob({
    sourceJobId,
    token,
    company: extraction.company?.name ?? extraction.company?.label ?? "Company",
    evidenceProfile: creditEvidenceFromSustainabilityProfile(extraction.analysis?.sustainabilityProfile ?? {}),
    questionnaire: body.questionnaire ?? {},
    confirmedOverrides: body.confirmedOverrides ?? {},
  });
  sendJson(response, job.status === "completed" ? 200 : 202, { ok: true, job });
}

async function handleGetCreditStrategyAnalysis(request, response) {
  const job = await creditStrategyJobs.getAuthorized(
    creditStrategyAnalysisIdFromUrl(request.url),
    request.headers["x-extraction-job-token"],
  );
  if (!job) {
    sendJson(response, 404, { ok: false, message: "Credit strategy analysis was not found or the job token is invalid." });
    return;
  }
  sendJson(response, 200, { ok: true, job });
}

async function handleRetryCreditStrategyAnalysis(request, response) {
  const job = await creditStrategyJobs.retry(
    creditStrategyAnalysisIdFromUrl(request.url, "/retry"),
    request.headers["x-extraction-job-token"],
  );
  if (!job) {
    sendJson(response, 404, { ok: false, message: "Credit strategy analysis was not found or the job token is invalid." });
    return;
  }
  sendJson(response, 202, { ok: true, job });
}

async function handleCancelCreditStrategyAnalysis(request, response) {
  const job = await creditStrategyJobs.cancel(
    creditStrategyAnalysisIdFromUrl(request.url, "/cancel"),
    request.headers["x-extraction-job-token"],
  );
  if (!job) {
    sendJson(response, 404, { ok: false, message: "Credit strategy analysis was not found or the job token is invalid." });
    return;
  }
  sendJson(response, 200, { ok: true, job });
}

async function handleGetSustainabilityAnalysis(request, response) {
  const job = await sustainabilityJobs.getAuthorized(
    sustainabilityAnalysisIdFromUrl(request.url),
    request.headers["x-extraction-job-token"],
  );
  if (!job) {
    sendJson(response, 404, { ok: false, message: "Sustainability analysis was not found or the job token is invalid." });
    return;
  }
  sendJson(response, 200, { ok: true, job });
}

async function handleRetrySustainabilityAnalysis(request, response) {
  const job = await sustainabilityJobs.retry(
    sustainabilityAnalysisIdFromUrl(request.url, "/retry"),
    request.headers["x-extraction-job-token"],
  );
  if (!job) {
    sendJson(response, 404, { ok: false, message: "Sustainability analysis was not found or the job token is invalid." });
    return;
  }
  sendJson(response, 202, { ok: true, job });
}

async function handleCancelSustainabilityAnalysis(request, response) {
  const job = await sustainabilityJobs.cancel(
    sustainabilityAnalysisIdFromUrl(request.url, "/cancel"),
    request.headers["x-extraction-job-token"],
  );
  if (!job) {
    sendJson(response, 404, { ok: false, message: "Sustainability analysis was not found or the job token is invalid." });
    return;
  }
  sendJson(response, 200, { ok: true, job });
}

async function handleGetExtractionJob(request, response) {
  if (!extractionJobs.queue) {
    sendJson(response, 503, { ok: false, message: extractionJobs.error });
    return;
  }

  const jobId = extractionJobIdFromUrl(request.url);
  const job = await extractionJobs.getAuthorizedJob(jobId, request.headers["x-extraction-job-token"]);

  if (!job) {
    sendJson(response, 404, { ok: false, message: "Extraction job was not found or the job token is invalid." });
    return;
  }

  sendJson(response, 200, { ok: true, job });
}

async function handleRetryExtractionJob(request, response) {
  if (!extractionJobs.queue) {
    sendJson(response, 503, { ok: false, message: extractionJobs.error });
    return;
  }

  const jobId = extractionJobIdFromUrl(request.url, "/retry");
  const job = await extractionJobs.retryJob(jobId, request.headers["x-extraction-job-token"]);
  if (!job) {
    sendJson(response, 404, { ok: false, message: "Extraction job was not found or the job token is invalid." });
    return;
  }
  sendJson(response, 202, { ok: true, job });
}

async function handleCancelExtractionJob(request, response) {
  if (!extractionJobs.queue) {
    sendJson(response, 503, { ok: false, message: extractionJobs.error });
    return;
  }
  const jobId = extractionJobIdFromUrl(request.url, "/cancel");
  const job = await extractionJobs.cancelJob(jobId, request.headers["x-extraction-job-token"]);
  if (!job) {
    sendJson(response, 404, { ok: false, message: "Extraction job was not found or the job token is invalid." });
    return;
  }
  sendJson(response, 200, { ok: true, job });
}

function createPersistentExtractionJobs() {
  const providers = configuredAiProviders();

  try {
    const repository = new SupabaseAnalysisRepository();
    if (!providers.length) throw new Error("Configure at least one complete AI provider: NVIDIA, Gemini, or Groq.");
    const providerNames = providers.map((provider) => provider.name);
    console.log(`Configured AI providers: ${providerNames.join(", ")}`);
    const queue = createPersistentAiJobQueue({ repository, providers });
    void queue.resume().catch((error) => console.error("Unable to resume AI extraction jobs:", error));
    return {
      queue,
      repository,
      providerNames,
      primaryProvider: providers[0],
      createJob: (jobInput) => queue.createJob(jobInput),
      getAuthorizedJob: (id, token) => repository.getAuthorizedJob(id, token),
      retryJob: (id, token) => queue.retryJob(id, token),
      cancelJob: (id, token) => queue.cancelJob(id, token),
    };
  } catch (error) {
    if (process.env.SUPABASE_URL || process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Persistent AI extraction is unavailable:", error.message);
      return { queue: null, repository: null, providerNames: [], error: error.message };
    }
    return createLocalExtractionJobs({ providers, reason: error.message });
  }
}

function createSustainabilityJobs(extractionRepository) {
  const repository = extractionRepository
    ? createSupabaseSustainabilityAnalysisRepository(extractionRepository)
    : createLocalSustainabilityAnalysisRepository();
  const queue = createSustainabilityAnalysisJobQueue({ repository });
  void queue.resume().catch((error) => console.error("Unable to resume sustainability analysis jobs:", error));
  return queue;
}

function createCreditStrategyJobs(extractionRepository, provider) {
  const repository = extractionRepository
    ? createSupabaseCreditStrategyRepository(extractionRepository)
    : createLocalCreditStrategyRepository();
  const evidenceMapper = provider
    ? async (profile) => provider.invoke({
        prompt: buildCreditEvidencePrompt(profile),
        schemaVersion: "credit-evidence-map.v1",
        config: { ...(provider.config ?? {}), maxTokens: 1_500, timeoutMs: localProviderTimeoutMs() },
      })
    : undefined;
  const queue = createCreditStrategyJobQueue({ repository, evidenceMapper });
  void queue.resume().catch((error) => console.error("Unable to resume credit strategy jobs:", error));
  return queue;
}

function createLocalExtractionJobs({ providers, reason }) {
  const primaryProvider = providers[0];
  const tokens = new Map();
  const cancelled = new Set();
  const queue = createExtractionJobQueue({
    provider: async ({ prompt, schemaVersion }) => {
      if (!primaryProvider) throw new Error("No AI provider configured; using local rules fallback.");
      try {
        return await primaryProvider.invoke({
          prompt,
          schemaVersion,
          config: { ...(primaryProvider.config ?? {}), maxTokens: 6_000, timeoutMs: localProviderTimeoutMs() },
        });
      } catch {
        throw new Error("Local AI provider unavailable; using rules fallback.");
      }
    },
    requestsPerMinute: primaryProvider?.requestsPerMinute ?? 20,
  });

  console.warn(
    `Persistent AI extraction is unavailable (${reason}). Using local in-memory extraction jobs${primaryProvider ? ` with ${primaryProvider.name}` : " with rules fallback only"}.`,
  );

  return {
    queue,
    repository: null,
    providerNames: primaryProvider ? [`local-${primaryProvider.name}`] : ["local-rules-fallback"],
    primaryProvider,
    async createJob(jobInput) {
      const job = queue.createJob(jobInput);
      const token = randomToken();
      tokens.set(job.id, token);
      return { job, token };
    },
    async getAuthorizedJob(id, token) {
      if (!authorized(tokens, id, token)) return null;
      const job = queue.getJob(id);
      if (!job) return null;
      return cancelled.has(id) ? { ...job, status: "cancelled", stage: "Cancelled locally" } : job;
    },
    async retryJob(id, token) {
      return authorized(tokens, id, token) ? queue.getJob(id) : null;
    },
    async cancelJob(id, token) {
      if (!authorized(tokens, id, token)) return null;
      cancelled.add(id);
      const job = queue.getJob(id);
      return job ? { ...job, status: "cancelled", stage: "Cancelled locally" } : null;
    },
  };
}

function authorized(tokens, id, token) {
  return Boolean(id && token && tokens.get(id) === token);
}

function randomToken() {
  return randomBytes(24).toString("hex");
}

function localProviderTimeoutMs() {
  const parsed = Number(process.env.LOCAL_AI_REQUEST_TIMEOUT_MS ?? 15_000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15_000;
}

function extractionJobIdFromUrl(requestUrl, suffix = "") {
  const pathname = new URL(requestUrl, "http://localhost").pathname;
  const prefix = "/api/extraction-jobs/";
  if (!pathname.startsWith(prefix) || (suffix && !pathname.endsWith(suffix))) return null;
  const id = pathname.slice(prefix.length, suffix ? -suffix.length : undefined);
  return id || null;
}

function sustainabilityAnalysisIdFromUrl(requestUrl, suffix = "") {
  const pathname = new URL(requestUrl, "http://localhost").pathname;
  const prefix = "/api/sustainability-analyses/";
  if (!pathname.startsWith(prefix) || (suffix && !pathname.endsWith(suffix))) return null;
  const id = pathname.slice(prefix.length, suffix ? -suffix.length : undefined);
  return id || null;
}

function creditStrategyAnalysisIdFromUrl(requestUrl, suffix = "") {
  const pathname = new URL(requestUrl, "http://localhost").pathname;
  const prefix = "/api/credit-strategy-analyses/";
  if (!pathname.startsWith(prefix) || (suffix && !pathname.endsWith(suffix))) return null;
  const id = pathname.slice(prefix.length, suffix ? -suffix.length : undefined);
  return id || null;
}

function creditEvidenceFromSustainabilityProfile(profile) {
  return {
    sector: "semiconductors",
    emissions: {
      ...profile.emissions,
      targetBoundaryTco2e: profile.emissions?.totalTco2e ?? null,
    },
    target: profile.target ?? {},
    projects: (profile.internalInvestments ?? []).map((project) => ({
      ...project,
      lever: project.category,
      requiredCapitalUsd: project.requiredCapitalUsd,
      committedCapitalUsd: project.committedCapitalUsd ?? project.amountUsd,
      deliveryYear: project.deliveryYear,
      mrvReady: project.mrvReady ?? project.verified,
      sourceCoverage: 0.5,
    })),
    currentPortfolio: {
      disclosureStatus: profile.carbonCredits?.disclosureStatus ?? "not_disclosed",
      credits: profile.carbonCredits?.credits ?? [],
      citations: profile.carbonCredits?.citations ?? [],
    },
  };
}

async function readJsonBody(request) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > maxJsonBytes) {
      throw new Error("Request body is too large.");
    }
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function serveStatic(request, response) {
  const requestUrl = new URL(request.url, `http://${host}:${port}`);
  const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(rootDir, safePath);

  if (!filePath.startsWith(rootDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("Not a file");

    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] ?? "application/octet-stream",
      "Content-Length": fileStat.size,
      ...(new Set([".html", ".js", ".css"]).has(extname(filePath)) ? { "Cache-Control": "no-cache" } : {}),
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    createReadStream(filePath).pipe(response);
  } catch {
    const fallback = await readFile(join(rootDir, "index.html"));
    response.writeHead(404, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
    response.end(fallback);
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function loadDotEnv() {
  try {
    const content = readFileSync(join(rootDir, ".env"), "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;
      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env is optional; deployment environments can provide variables directly.
  }
}

function normalizeHost(value) {
  if (value === "[::]") return "::";
  if (value === "localhost") return "127.0.0.1";
  return value;
}
