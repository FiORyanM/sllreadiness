import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { aiibFixture } from "../fixtures/aiib.js";

const port = 3099;
const baseUrl = `http://127.0.0.1:${port}`;
const outputPath = fileURLToPath(new URL("../output/pdf/aiib-demo-sll-readiness-report.pdf", import.meta.url));
const server = spawn(process.execPath, ["server.js"], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverLog = "";
server.stdout.on("data", (chunk) => {
  serverLog += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverLog += chunk.toString();
});

try {
  await waitForServer();
  const response = await fetch(`${baseUrl}/api/report-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reportPayload()),
  });
  assert.equal(response.status, 200, `Expected a PDF response, received HTTP ${response.status}.`);
  assert.match(response.headers.get("content-type") ?? "", /^application\/pdf/);
  assert.match(response.headers.get("content-disposition") ?? "", /aiib.*sll-readiness-report\.pdf/i);

  const pdf = Buffer.from(await response.arrayBuffer());
  await mkdir(new URL("../output/pdf/", import.meta.url), { recursive: true });
  await writeFile(outputPath, pdf);
  const savedPdf = await readFile(outputPath);
  assert.equal(savedPdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(savedPdf.length > 20_000, `Expected a substantive PDF, received ${savedPdf.length} bytes.`);

  const invalidResponse = await fetch(`${baseUrl}/api/report-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: "unsupported" }),
  });
  assert.equal(invalidResponse.status, 400);
  console.log(`PDF export integration test passed (${savedPdf.length.toLocaleString()} bytes).`);
} finally {
  if (server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([
      once(server, "exit"),
      new Promise((resolve) => setTimeout(resolve, 6_000)),
    ]);
  }
}

function reportPayload() {
  return {
    version: "sll-readiness-report.v1",
    company: aiibFixture.company,
    verdict: aiibFixture.verdict,
    deal: aiibFixture.dealDefaults,
    analysis: {
      readinessScore: 84,
      readinessBand: "Strong",
      assessmentState: "assessed",
      executionCost: { best: 100_000, worst: 250_000 },
      baseMarginNote: aiibFixture.analysis.baseMarginNote,
      components: Object.values(aiibFixture.modelInputs.componentsByKey),
      gaps: aiibFixture.analysis.gaps,
      kpis: aiibFixture.analysis.kpis,
    },
  };
}

async function waitForServer() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Server exited before startup.\n${serverLog}`);
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not start in time.\n${serverLog}`);
}
