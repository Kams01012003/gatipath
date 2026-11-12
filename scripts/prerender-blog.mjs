import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const indexHtml = readFileSync(join(dist, "index.html"), "utf8");

const { blogArticles, getBlogIndexMeta, getHomeMeta, renderArticleBodyHtml } =
  await import(pathToFileURL(join(root, "src/blogData.js")).href);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function injectHead(html, { title, description, canonical, ogType = "website" }) {
  let next = html;
  next = next.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`);
  next = next.replace(
    /<meta\s+name="description"[^>]*>/i,
    `<meta name="description" content="${escapeHtml(description)}" />`
  );
  next = next.replace(
    /<link\s+rel="canonical"[^>]*>/i,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`
  );
  next = next.replace(
    /<meta\s+property="og:title"[^>]*>/i,
    `<meta property="og:title" content="${escapeHtml(title)}" />`
  );
  next = next.replace(
    /<meta\s+property="og:description"[^>]*>/i,
    `<meta property="og:description" content="${escapeHtml(description)}" />`
  );
  next = next.replace(
    /<meta\s+property="og:url"[^>]*>/i,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`
  );
  next = next.replace(
    /<meta\s+property="og:type"[^>]*>/i,
    `<meta property="og:type" content="${escapeHtml(ogType)}" />`
  );
  if (!/property="og:site_name"/i.test(next)) {
    next = next.replace(
      "</head>",
      `    <meta property="og:site_name" content="RailDisha" />\n  </head>`
    );
  }
  return next;
}

function writePage(relativePath, head, bodyHtml) {
  const filePath = join(dist, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  const html = injectHead(indexHtml, head).replace(
    '<div id="root"></div>',
    `<div id="root">${bodyHtml}</div>`
  );
  writeFileSync(filePath, html);
  console.log("prerendered", relativePath);
}

const home = getHomeMeta();
writePage(
  "index.html",
  home,
  `<main><h1>RailDisha</h1><p>${escapeHtml(home.description)}</p><p><a href="/blog">Blog</a></p></main>`
);

const blogIndex = getBlogIndexMeta();
const indexCards = blogArticles
  .map(
    (article) =>
      `<li><a href="${escapeHtml(article.path)}"><strong>${escapeHtml(article.title)}</strong><span>${escapeHtml(article.description)}</span></a></li>`
  )
  .join("");
writePage(
  "blog/index.html",
  blogIndex,
  `<main><h1>Train travel guides</h1><p>${escapeHtml(blogIndex.description)}</p><ul>${indexCards}</ul><p><a href="/">Home</a></p></main>`
);

for (const article of blogArticles) {
  const related = blogArticles
    .filter((item) => item.slug !== article.slug)
    .slice(0, 3)
    .map((item) => `<li><a href="${escapeHtml(item.path)}">${escapeHtml(item.title)}</a></li>`)
    .join("");
  const body = `
    <article>
      <nav><a href="/">Home</a> / <a href="/blog">Blog</a></nav>
      <h1>${escapeHtml(article.title)}</h1>
      ${renderArticleBodyHtml(article)}
      <section><h2>Related guides</h2><ul>${related}</ul></section>
      <p><a href="/blog">Back to blog</a> · <a href="/">RailDisha home</a></p>
    </article>
  `;
  writePage(`blog/${article.slug}/index.html`, {
    title: article.seoTitle,
    description: article.description,
    canonical: article.canonical,
    ogType: "article",
  }, body);
}

const sitemapUrls = [
  "https://raildisha.com/",
  "https://raildisha.com/blog",
  ...blogArticles.map((article) => article.canonical),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls
  .map(
    (loc) => `  <url>
    <loc>${loc}</loc>
  </url>`
  )
  .join("\n")}
</urlset>
`;
writeFileSync(join(dist, "sitemap.xml"), sitemap);
copyFileSync(join(root, "public/robots.txt"), join(dist, "robots.txt"));
console.log("wrote sitemap.xml and robots.txt");
