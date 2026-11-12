import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  blogArticles,
  getArticleBySlug,
  getBlogIndexMeta,
  getHomeMeta,
  renderArticleBodyHtml,
} from "../src/blogData.js";

describe("RailDisha blog content and SEO data", () => {
  it("publishes all four prepared articles with required paths", () => {
    expect(blogArticles).toHaveLength(4);
    expect(blogArticles.map((item) => item.path).sort()).toEqual(
      [
        "/blog/how-to-check-live-train-running-status",
        "/blog/how-to-find-trains-between-stations",
        "/blog/indian-railways-train-schedule-guide",
        "/blog/pnr-status-cnf-rac-wl-guide",
      ].sort()
    );
  });

  it("keeps full article bodies and official source URLs", () => {
    for (const article of blogArticles) {
      expect(article.title).toBeTruthy();
      expect(article.seoTitle).toBeTruthy();
      expect(article.description).toBeTruthy();
      expect(article.canonical).toBe(`https://raildisha.com${article.path}`);
      expect(article.sections.length).toBeGreaterThan(3);
      const bodyText = article.sections
        .flatMap((section) => section.paragraphs.map((p) => p.text))
        .join(" ");
      expect(bodyText.length).toBeGreaterThan(400);
      expect(article.sources.length).toBeGreaterThan(0);
      for (const source of article.sources) {
        expect(source.urls[0]).toMatch(/^https:\/\//);
      }
    }
  });

  it("wires required internal links without fabricating PNR tools", () => {
    const live = getArticleBySlug("how-to-check-live-train-running-status");
    const html = renderArticleBodyHtml(live);
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/blog/indian-railways-train-schedule-guide"');
    expect(html).toContain('href="/blog/pnr-status-cnf-rac-wl-guide"');
    expect(html).not.toMatch(/href="\/(?:api\/)?pnr(?:-tool)?(?:\/|"|\?)/i);

    const pnr = getArticleBySlug("pnr-status-cnf-rac-wl-guide");
    const pnrHtml = renderArticleBodyHtml(pnr);
    expect(pnrHtml).toContain('href="/blog/how-to-check-live-train-running-status"');
    expect(pnrHtml).toContain("https://www.indianrail.gov.in/enquiry/PNR/PnrEnquiry.html?locale=en3");
  });

  it("uses visitor-safe home and blog index metadata on raildisha.com", () => {
    expect(getHomeMeta().canonical).toBe("https://raildisha.com/");
    expect(getBlogIndexMeta().canonical).toBe("https://raildisha.com/blog");
    expect(getHomeMeta().title).toMatch(/RailDisha/);
  });

  it("ships robots.txt pointing at the production sitemap", () => {
    const robots = readFileSync(resolve("public/robots.txt"), "utf8");
    expect(robots).toContain("Sitemap: https://raildisha.com/sitemap.xml");
    expect(existsSync(resolve("src/blog-articles.json"))).toBe(true);
  });
});
