import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

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

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ acceptDownloads: true });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.click("#demo-button");
  await page.locator("#report-view:not(.is-hidden)").waitFor();

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    page.click("#export-pdf-button"),
  ]);

  await mkdir(new URL("../output/pdf/", import.meta.url), { recursive: true });
  await download.saveAs(outputPath);
  const pdf = await readFile(outputPath);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 20_000, `Expected a substantive PDF, received ${pdf.length} bytes.`);
  assert.match(download.suggestedFilename(), /aiib.*sll-readiness-report\.pdf/i);

  const invalidResponse = await page.request.post(`${baseUrl}/api/report-pdf`, {
    data: { title: "Invalid", html: "<p>Not a report</p>" },
  });
  assert.equal(invalidResponse.status(), 400);
  console.log(`PDF export integration test passed (${pdf.length.toLocaleString()} bytes).`);
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([
      once(server, "exit"),
      new Promise((resolve) => setTimeout(resolve, 6_000)),
    ]);
  }
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
