import { createReadStream, readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { mockLlmProvider } from "./extraction/llmExtractionAdapter.js";
import { createExtractionJobQueue } from "./extraction/extractionJobQueue.js";
import { deepseekProvider } from "./extraction/providers/deepseekProvider.js";
import { nvidiaProvider } from "./extraction/providers/nvidiaProvider.js";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
loadDotEnv();

const port = Number(process.env.PORT ?? 3002);
const host = normalizeHost(process.env.HOST ?? (process.env.PORT ? "0.0.0.0" : "127.0.0.1"));
const maxJsonBytes = 2 * 1024 * 1024;
const extractionJobs = createExtractionJobQueue({
  provider: selectAiProvider(),
  requestsPerMinute: Number(process.env.AI_REQUESTS_PER_MINUTE ?? 20),
});

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
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
      sendJson(response, 200, { ok: true, service: "sll-readiness-tool" });
      return;
    }

    if (request.method === "POST" && (request.url === "/api/extraction-jobs" || request.url === "/api/extract-sll")) {
      await handleCreateExtractionJob(request, response);
      return;
    }

    if (request.method === "GET" && request.url.startsWith("/api/extraction-jobs/")) {
      handleGetExtractionJob(request, response);
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

  const job = extractionJobs.createJob({ text, metadata });
  sendJson(response, job.cacheHit ? 200 : 202, { ok: true, job });
}

function handleGetExtractionJob(request, response) {
  const jobId = request.url.slice("/api/extraction-jobs/".length);
  const job = extractionJobs.getJob(jobId);

  if (!job) {
    sendJson(response, 404, { ok: false, message: "Extraction job was not found." });
    return;
  }

  sendJson(response, 200, { ok: true, job });
}

function selectAiProvider() {
  const providerName = (process.env.AI_PROVIDER ?? "").toLowerCase();

  if (providerName === "local" || providerName === "rules" || providerName === "off") return mockLlmProvider;
  if (providerName === "nvidia") return nvidiaProvider;
  if (providerName === "deepseek") return deepseekProvider;
  if (process.env.NVIDIA_API_KEY) return nvidiaProvider;
  return deepseekProvider;
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
