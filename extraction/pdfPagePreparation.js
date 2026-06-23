/**
 * Retains every unique PDF page for AI processing. Exact duplicate pages are
 * removed only after retaining their first page number; no relevance-based
 * selection or character cap is applied.
 */
export function prepareFullPdfText(text) {
  const pages = splitPages(text);
  if (!pages.length) {
    return {
      text,
      scope: { sourcePageCount: null, analyzedPageCount: null, omittedPageCount: null, duplicatePageCount: 0, fullCoverage: true },
    };
  }

  const fingerprints = new Set();
  const uniquePages = pages.filter((page) => {
    const fingerprint = page.text.replace(/\s+/g, " ").trim();
    if (fingerprints.has(fingerprint)) return false;
    fingerprints.add(fingerprint);
    return true;
  });

  return {
    text: uniquePages.map((page) => `--- PDF PAGE ${page.number} ---\n${page.text}`).join("\n\n"),
    scope: {
      sourcePageCount: pages.length,
      analyzedPageCount: uniquePages.length,
      omittedPageCount: 0,
      duplicatePageCount: pages.length - uniquePages.length,
      fullCoverage: true,
    },
  };
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
