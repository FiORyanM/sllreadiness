const maxAnalysisChars = 360_000;
const maxSelectedPages = 90;
const relevancePattern = /\b(ghg|greenhouse gas|emissions?|scope\s*[123]|climate|energy|renewable|target|baseline|methodolog|assurance|verif|audit|science[-\s]?based|sbti|sustainab|materiality|gri|sasb|issb|tcfd|governance|transition|net[-\s]?zero|kpi|metric)\b/gi;

/**
 * Selects the most SLL-relevant unique pages to bound AI calls. The exact
 * skipped page numbers are retained in scope metadata and shown in the report.
 */
export function prepareFullPdfText(text) {
  const pages = splitPages(text);
  if (!pages.length) {
    return {
      text,
      scope: { sourcePageCount: null, analyzedPageCount: null, omittedPageCount: null, duplicatePageCount: 0, fullCoverage: true, analyzedPages: [], skippedPages: [] },
    };
  }

  const fingerprints = new Set();
  const uniquePages = pages.filter((page) => {
    const fingerprint = page.text.replace(/\s+/g, " ").trim();
    if (fingerprints.has(fingerprint)) return false;
    fingerprints.add(fingerprint);
    return true;
  });

  const ranked = uniquePages
    .map((page) => ({ ...page, relevance: scorePage(page.text), introductory: page.number <= 3 }))
    .sort((left, right) => right.relevance - left.relevance || Number(right.introductory) - Number(left.introductory) || left.number - right.number);
  const selected = [];
  let usedChars = 0;
  for (const page of ranked) {
    if (selected.length >= maxSelectedPages || usedChars >= maxAnalysisChars) continue;
    if (!page.introductory && page.relevance === 0) continue;
    const remaining = maxAnalysisChars - usedChars - 32;
    const selectedPage = { ...page, text: page.text.slice(0, remaining) };
    selected.push(selectedPage);
    usedChars += `--- PDF PAGE ${selectedPage.number} ---\n${selectedPage.text}`.length;
  }
  if (!selected.length) selected.push(...uniquePages.slice(0, 3));
  selected.sort((left, right) => left.number - right.number);
  const analyzedPages = selected.map((page) => page.number);
  const skippedPages = pages.map((page) => page.number).filter((pageNumber) => !analyzedPages.includes(pageNumber));

  return {
    text: selected.map((page) => `--- PDF PAGE ${page.number} ---\n${page.text}`).join("\n\n"),
    scope: {
      sourcePageCount: pages.length,
      analyzedPageCount: selected.length,
      omittedPageCount: skippedPages.length,
      duplicatePageCount: pages.length - uniquePages.length,
      fullCoverage: skippedPages.length === 0,
      analyzedPages,
      skippedPages,
    },
  };
}

function scorePage(text) {
  return text.match(relevancePattern)?.length ?? 0;
}

function splitPages(text) {
  const marker = /--- PDF PAGE (\d+) ---\s*/g;
  const matches = [...text.matchAll(marker)];
  return matches
    .map((match, index) => ({
      number: Number(match[1]),
      text: text.slice(match.index + match[0].length, matches[index + 1]?.index ?? text.length).trim(),
    }))
    .filter((page) => page.text.length > 0);
}
