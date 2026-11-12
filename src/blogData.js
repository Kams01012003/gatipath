import rawArticles from "./blog-articles.json" with { type: "json" };

const SITE = "https://raildisha.com";

const INTERNAL_LINK_RULES = {
  "/blog/how-to-check-live-train-running-status": [
    { phrase: "Open RailDisha", href: "/" },
    { phrase: "train schedules", href: "/blog/indian-railways-train-schedule-guide" },
    { phrase: "PNR status", href: "/blog/pnr-status-cnf-rac-wl-guide" },
  ],
  "/blog/pnr-status-cnf-rac-wl-guide": [
    { phrase: "live train running status guide", href: "/blog/how-to-check-live-train-running-status" },
    { phrase: "PNR Status", href: "/" },
    { phrase: "RailDisha homepage", href: "/" },
    { phrase: "RailDisha’s train tracker", href: "/" },
    { phrase: "RailDisha's train tracker", href: "/" },
  ],
  "/blog/indian-railways-train-schedule-guide": [
    { phrase: "open RailDisha", href: "/" },
    { phrase: "trains between stations guide", href: "/blog/how-to-find-trains-between-stations" },
    { phrase: "current status", href: "/blog/how-to-check-live-train-running-status" },
  ],
  "/blog/how-to-find-trains-between-stations": [
    { phrase: "use RailDisha", href: "/" },
    { phrase: "schedule", href: "/blog/indian-railways-train-schedule-guide" },
    { phrase: "PNR guides", href: "/blog/pnr-status-cnf-rac-wl-guide" },
  ],
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function linkifyOnce(text, rules) {
  const used = new Set();
  let result = "";
  let remaining = text;

  while (remaining.length) {
    let earliest = null;
    for (const rule of rules) {
      if (used.has(rule.phrase.toLowerCase())) continue;
      const idx = remaining.toLowerCase().indexOf(rule.phrase.toLowerCase());
      if (idx === -1) continue;
      if (!earliest || idx < earliest.idx) {
        earliest = { idx, rule, match: remaining.slice(idx, idx + rule.phrase.length) };
      }
    }
    if (!earliest) {
      result += remaining;
      break;
    }
    result += remaining.slice(0, earliest.idx);
    result += `<a href="${earliest.rule.href}">${escapeHtml(earliest.match)}</a>`;
    used.add(earliest.rule.phrase.toLowerCase());
    remaining = remaining.slice(earliest.idx + earliest.match.length);
  }

  return result;
}

function enrichParagraph(text, path) {
  const rules = INTERNAL_LINK_RULES[path] || [];
  // Prefer longer phrases first so nested matches do not steal shorter ones.
  const ordered = [...rules].sort((a, b) => b.phrase.length - a.phrase.length);
  return linkifyOnce(escapeHtml(text), ordered);
}

function slugFromPath(path) {
  return String(path || "").replace(/^\/blog\//, "").replace(/\/$/, "");
}

export const SITE_ORIGIN = SITE;

export const blogArticles = rawArticles.map((article) => {
  const path = article.path;
  const slug = slugFromPath(path);
  const sections = (article.sections || []).map((section) => ({
    heading: section.heading || null,
    paragraphs: (section.paragraphs || []).map((paragraph) => ({
      text: paragraph,
      html: enrichParagraph(paragraph, path),
    })),
  }));

  return {
    title: article.title,
    path,
    slug,
    seoTitle: article.seoTitle,
    description: article.description,
    sources: article.sources || [],
    sections,
    canonical: `${SITE}${path}`,
  };
});

export function getArticleBySlug(slug) {
  return blogArticles.find((article) => article.slug === slug) || null;
}

export function getRelatedArticles(slug, limit = 3) {
  return blogArticles.filter((article) => article.slug !== slug).slice(0, limit);
}

export function getBlogIndexMeta() {
  return {
    title: "RailDisha Blog — Train travel guides",
    description:
      "Practical guides to live train running status, PNR codes, train schedules and finding trains between stations.",
    canonical: `${SITE}/blog`,
    path: "/blog",
  };
}

export function getHomeMeta() {
  return {
    title: "RailDisha — Know where your train is.",
    description:
      "Search Indian trains by name or number and follow live journey information station by station.",
    canonical: `${SITE}/`,
    path: "/",
  };
}

export function renderArticleBodyHtml(article) {
  const parts = [];
  for (const section of article.sections) {
    if (section.heading) {
      parts.push(`<h2>${escapeHtml(section.heading)}</h2>`);
    }
    for (const paragraph of section.paragraphs) {
      parts.push(`<p>${paragraph.html}</p>`);
    }
  }
  if (article.sources?.length) {
    parts.push(`<h2>Official sources</h2><ul>`);
    for (const source of article.sources) {
      const links = (source.urls || [])
        .map(
          (url) =>
            `<a href="${escapeHtml(url)}" rel="noopener noreferrer" target="_blank">${escapeHtml(url)}</a>`
        )
        .join(" ");
      parts.push(`<li><span>${escapeHtml(source.label)}:</span> ${links}</li>`);
    }
    parts.push(`</ul>`);
  }
  return parts.join("\n");
}
