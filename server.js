import { createReadStream, readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { configuredAiProviders } from "./extraction/aiProviderPool.js";
import { createPersistentAiJobQueue } from "./extraction/persistentAiJobQueue.js";
import { SupabaseAnalysisRepository } from "./extraction/supabaseAnalysisRepository.js";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
loadDotEnv();

const port = Number(process.env.PORT ?? 3002);
const host = normalizeHost(process.env.HOST ?? (process.env.PORT ? "0.0.0.0" : "127.0.0.1"));
const maxJsonBytes = 2 * 1024 * 1024;
const extractionJobs = createPersistentExtractionJobs();

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

    if (request.method === "POST" && (request.url === "/api/extraction-jobs" || request.url === "/api/extract-sll")) {
      await handleCreateExtractionJob(request, response);
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

  const { job, token } = await extractionJobs.queue.createJob({ text, metadata });
  sendJson(response, job.cacheHit ? 200 : 202, { ok: true, job, jobToken: token });
}

async function handleGetExtractionJob(request, response) {
  if (!extractionJobs.queue) {
    sendJson(response, 503, { ok: false, message: extractionJobs.error });
    return;
  }

  const jobId = extractionJobIdFromUrl(request.url);
  const job = await extractionJobs.repository.getAuthorizedJob(jobId, request.headers["x-extraction-job-token"]);

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
  const job = await extractionJobs.queue.retryJob(jobId, request.headers["x-extraction-job-token"]);
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
  const job = await extractionJobs.queue.cancelJob(jobId, request.headers["x-extraction-job-token"]);
  if (!job) {
    sendJson(response, 404, { ok: false, message: "Extraction job was not found or the job token is invalid." });
    return;
  }
  sendJson(response, 200, { ok: true, job });
}

function createPersistentExtractionJobs() {
  try {
    const repository = new SupabaseAnalysisRepository();
    const providers = configuredAiProviders();
    if (!providers.length) throw new Error("Configure at least one complete AI provider: NVIDIA, Gemini, or Groq.");
    const providerNames = providers.map((provider) => provider.name);
    console.log(`Configured AI providers: ${providerNames.join(", ")}`);
    const queue = createPersistentAiJobQueue({ repository, providers });
    void queue.resume().catch((error) => console.error("Unable to resume AI extraction jobs:", error));
    return { queue, repository, providerNames };
  } catch (error) {
    console.error("Persistent AI extraction is unavailable:", error.message);
    return { queue: null, repository: null, providerNames: [], error: error.message };
  }
}

function extractionJobIdFromUrl(requestUrl, suffix = "") {
  const pathname = new URL(requestUrl, "http://localhost").pathname;
  const prefix = "/api/extraction-jobs/";
  if (!pathname.startsWith(prefix) || (suffix && !pathname.endsWith(suffix))) return null;
  const id = pathname.slice(prefix.length, suffix ? -suffix.length : undefined);
  return id || null;
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
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    createReadStream(filePath).pipe(response);
  } catch {
    const fallback = await readFile(join(rootDir, "index.html"));
    response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
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
