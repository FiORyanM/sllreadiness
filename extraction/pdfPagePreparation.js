const evidenceSignals = {
  emissions: /\b(ghg|greenhouse gas|emissions?|scope\s*[123]|carbon footprint)\b/i,
  targets: /\b(target|baseline|base year|spt|net[-\s]?zero|science[-\s]?based|sbti)\b/i,
  methodology: /\b(methodolog|calculation|ghg protocol|iso 14064|organizational boundary|operational boundary)\b/i,
  verification: /\b(limited assurance|reasonable assurance|independent assurance|external verification|third[-\s]?party verification|audit)\b/i,
  reporting: /\b(gri|sasb|issb|tcfd|annual sustainability report|integrated report)\b/i,
  strategy: /\b(transition plan|climate strategy|materiality|sustainability governance|climate action plan)\b/i,
};

/**
 * Selects pages using an explainable, no-cap SLL evidence rule. The exact
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

  const selected = uniquePages.filter((page) => shouldAnalyzePage(pageSignals(page.text)));
  if (!selected.length) selected.push(...uniquePages.slice(0, 1));
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
      selectionRule: "Any page with emissions, targets, methodology, or independent verification; or a page with at least two distinct signals among emissions, targets, methodology, verification, reporting, and strategy. A single generic reporting or strategy reference is not enough.",
    },
  };
}

function pageSignals(text) {
  return Object.entries(evidenceSignals)
    .filter(([, pattern]) => pattern.test(text))
    .map(([name]) => name);
}

function shouldAnalyzePage(signals) {
  const strongStandaloneSignals = new Set(["emissions", "targets", "methodology", "verification"]);
  return signals.some((signal) => strongStandaloneSignals.has(signal)) || signals.length >= 2;
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
