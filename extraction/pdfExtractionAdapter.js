import * as pdfjsLib from "../node_modules/pdfjs-dist/legacy/build/pdf.mjs";

export const PDF_UPLOAD_LIMIT_BYTES = 20 * 1024 * 1024;

const MIN_TEXT_CHARS_PER_PAGE = 80;

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();

export function validatePdfFile(file, options = {}) {
  const maxBytes = options.maxBytes ?? PDF_UPLOAD_LIMIT_BYTES;

  if (!file) {
    return { ok: false, reason: "Please choose a PDF file before starting analysis." };
  }

  const fileName = file.name ?? "";
  const isPdfName = fileName.toLowerCase().endsWith(".pdf");
  const isPdfType =
    file.type === "application/pdf" ||
    file.type === "application/x-pdf" ||
    file.type === "application/octet-stream" ||
    file.type === "";

  if (!isPdfName && !isPdfType) {
    return { ok: false, reason: "Only PDF files are supported for this MVP." };
  }

  if (file.size > maxBytes) {
    return { ok: false, reason: "File is larger than 20MB. Please upload a smaller text-based PDF." };
  }

  return { ok: true };
}

export async function extractPdfText(file) {
  const validation = validatePdfFile(file);
  if (!validation.ok) {
    return {
      ok: false,
      stage: "validation",
      message: validation.reason,
    };
  }

  let document;

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const loadingTask = pdfjsLib.getDocument({ data: bytes });
    document = await loadingTask.promise;
  } catch (error) {
    return {
      ok: false,
      stage: "text_extraction",
      message: `This PDF could not be read: ${error.message}`,
    };
  }

  const pageText = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pageText.push(content.items.map((item) => item.str).join(" "));
  }

  const text = normalizeExtractedText(pageText.join("\n\n"));
  const pageCount = document.numPages;
  const imageObjectCount = 0;
  const textOperatorCount = pageText.filter(Boolean).length;
  const isLikelyScanned = isLikelyScannedPdf({
    text,
    pageCount,
    imageObjectCount,
    textOperatorCount,
  });

  if (isLikelyScanned) {
    return {
      ok: false,
      stage: "text_extraction",
      message: "This PDF appears to be a scanned document. Please upload a text-based PDF.",
      diagnostics: {
        pageCount,
        extractedCharCount: text.length,
        imageObjectCount,
        textOperatorCount,
      },
    };
  }

  return {
    ok: true,
    text,
    metadata: {
      fileName: file.name,
      fileSizeBytes: file.size,
      pageCount,
      extractedCharCount: text.length,
      imageObjectCount,
      textOperatorCount,
      truncated: false,
    },
  };
}

export function extractTextFromPdfSource(source) {
  const literalStrings = [];
  const literalPattern = /\((?:\\.|[^\\()]){2,}\)\s*(?:Tj|'|"|TJ)?/g;
  let literalMatch;

  while ((literalMatch = literalPattern.exec(source)) !== null) {
    const raw = literalMatch[0].replace(/\)\s*(?:Tj|'|"|TJ)?$/, "").slice(1);
    literalStrings.push(decodePdfLiteralString(raw));
  }

  const hexStrings = [];
  const hexPattern = /<([0-9a-fA-F\s]{6,})>\s*(?:Tj|TJ)/g;
  let hexMatch;

  while ((hexMatch = hexPattern.exec(source)) !== null) {
    hexStrings.push(decodePdfHexString(hexMatch[1]));
  }

  return normalizeExtractedText([...literalStrings, ...hexStrings].join(" "));
}

export function estimatePageCount(source) {
  const pageMatches = source.match(/\/Type\s*\/Page\b/g);
  const pagesMatches = source.match(/\/Type\s*\/Pages\b/g);
  return Math.max((pageMatches?.length ?? 0) - (pagesMatches?.length ?? 0), 1);
}

export function isLikelyScannedPdf({ text, pageCount, imageObjectCount, textOperatorCount }) {
  const textCharsPerPage = text.length / Math.max(pageCount, 1);
  const hasVeryLittleText = text.length < 500 || textCharsPerPage < MIN_TEXT_CHARS_PER_PAGE;
  const imageDominant = imageObjectCount >= Math.max(pageCount, 1) && textOperatorCount < pageCount * 3;
  return hasVeryLittleText && (imageDominant || textOperatorCount === 0);
}

function decodePdfLiteralString(value) {
  return value
    .replace(/\\n/g, " ")
    .replace(/\\r/g, " ")
    .replace(/\\t/g, " ")
    .replace(/\\b/g, " ")
    .replace(/\\f/g, " ")
    .replace(/\\([\\()])/g, "$1")
    .replace(/\\\d{1,3}/g, " ");
}

function decodePdfHexString(value) {
  const hex = value.replace(/\s+/g, "");
  const pairs = hex.match(/[0-9a-fA-F]{2}/g) ?? [];
  return pairs
    .map((pair) => String.fromCharCode(parseInt(pair, 16)))
    .join("")
    .replace(/[^\x20-\x7E]+/g, " ");
}

function normalizeExtractedText(value) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s([,.;:%])/g, "$1")
    .trim();
}

function countMatches(source, pattern) {
  return source.match(pattern)?.length ?? 0;
}
