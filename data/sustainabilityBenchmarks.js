export const sustainabilityBenchmarkData = Object.freeze({
  version: "sustainability-benchmarks.v1.0.0",
  asOfDate: "2026-07-15",
  currency: "USD",
  units: { price: "USD/tCO2e", volume: "tCO2e" },
  methodologyNote:
    "Peer disclosure is a reference, not an industry standard. Percentiles are published only when at least three peers disclose a comparable numerator and denominator.",
  standards: [
    {
      id: "icvcm-ccp",
      name: "ICVCM Core Carbon Principles",
      url: "https://icvcm.org/assessment-framework/",
      use: "Credit integrity and methodology quality screen",
    },
    {
      id: "vcmi-claims-3.1",
      name: "VCMI Claims Code of Practice v3.1",
      url: "https://vcmintegrity.org/library/?_topic=claims-code",
      use: "Corporate claims, retirement, disclosure and assurance controls",
    },
    {
      id: "sbti-corporate-net-zero-2",
      name: "SBTi Corporate Net-Zero Standard v2.0",
      url: "https://sciencebasedtargets.org/corporate-net-zero-standard-v2",
      use: "Internal decarbonization priority and ongoing-emissions responsibility",
    },
    {
      id: "oxford-offsetting-2024",
      name: "Oxford Principles for Net Zero Aligned Carbon Offsetting (2024)",
      url: "https://climate.web.ox.ac.uk/publication/2127012/ora-hyrax",
      use: "Progressive shift toward removals and durable storage",
    },
  ],
  marketSources: [
    {
      name: "MSCI — USD 22 Billion Points to Future Carbon-Market Demand",
      url: "https://www.msci.com/research-and-insights/blog-post/usd-22-billion-points-to-future-carbon-market-demand",
      publishedDate: "2026-05-14",
      access: "public",
      note: "Used for market direction only; public figures are not treated as sector portfolio percentages or price quotes.",
    },
    {
      name: "Ecosystem Marketplace — 2025 State of the Voluntary Carbon Market",
      url: "https://www.ecosystemmarketplace.com/publications/2025-state-of-the-voluntary-carbon-market-sovcm/",
      publishedDate: "2025",
      access: "public-summary",
      note: "Category prices are left unavailable unless a licensed, citable table is loaded into this data pack.",
    },
  ],
  categories: [
    { key: "nature_reduction", label: "Nature reduction / avoidance" },
    { key: "nature_removal", label: "Nature removal" },
    { key: "durable_removal", label: "Durable / engineered removal" },
    { key: "methane_industrial", label: "Methane / waste / industrial reduction" },
    { key: "community_energy", label: "Household / community / energy transition" },
    { key: "other", label: "Other / unspecified" },
  ],
  // Price fields intentionally remain null until a public or licensed source
  // supplies a category-comparable range. The model abstains instead of
  // inventing an indicative market price.
  priceBands: {
    nature_reduction: null,
    nature_removal: null,
    durable_removal: null,
    methane_industrial: null,
    community_energy: null,
    other: null,
  },
  sectors: {
    semiconductors: {
      label: "Semiconductors",
      peers: peerRoster([
        ["TSMC", "https://esg.tsmc.com/en-US/file/public/e-all_2024.pdf"],
        ["Intel", "https://www.intel.com/content/www/us/en/corporate-responsibility/corporate-responsibility.html"],
        ["Samsung Electronics", "https://www.samsung.com/global/sustainability/"],
        ["SK hynix", "https://www.skhynix.com/eng/sustainability/sustainabilityReport.do"],
        ["Micron", "https://www.micron.com/about/sustainability"],
      ]),
    },
    ict_technology: {
      label: "ICT / Technology",
      peers: peerRoster([
        ["Microsoft", "https://www.microsoft.com/en-us/corporate-responsibility/sustainability/report"],
        ["Alphabet", "https://sustainability.google/reports/"],
        ["Meta", "https://sustainability.atmeta.com/"],
        ["Apple", "https://www.apple.com/environment/"],
        ["Salesforce", "https://www.salesforce.com/company/sustainability/"],
      ]),
    },
    development_finance: {
      label: "Finance / Development Finance",
      peers: peerRoster([
        ["AIIB", "https://www.aiib.org/en/about-aiib/sustainability/index.html"],
        ["ADB", "https://www.adb.org/who-we-are/sustainability"],
        ["World Bank / IFC", "https://www.worldbank.org/en/about/annual-report"],
        ["EIB", "https://www.eib.org/en/publications/sustainability-report-2024"],
        ["EBRD", "https://www.ebrd.com/home/news-and-events/publications/sustainability-report.html"],
      ]),
    },
    market_only: { label: "Market reference only", peers: [] },
  },
});

function peerRoster(entries) {
  return entries.map(([name, sourceUrl]) => ({
    name,
    sourceUrl,
    reportingYear: null,
    disclosureConfidence: "Low",
    comparable: false,
    internalInvestmentIntensity: null,
    carbonCoverageRatio: null,
    portfolioMix: null,
  }));
}
