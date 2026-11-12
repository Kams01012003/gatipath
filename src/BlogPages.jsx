import React, { useEffect } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  blogArticles,
  getArticleBySlug,
  getBlogIndexMeta,
  getRelatedArticles,
} from "./blogData.js";
import { SiteNav } from "./SiteNav.jsx";
import { applyDocumentMeta } from "./seo.js";

export function BlogIndexPage() {
  useEffect(() => {
    applyDocumentMeta(getBlogIndexMeta());
  }, []);

  return (
    <div className="app blog-app">
      <SiteNav />
      <main className="blog-page">
        <div className="blog-page-inner">
          <span className="eyebrow">RAILDISHA BLOG</span>
          <h1>Train travel guides</h1>
          <p className="blog-lead">
            Clear explanations for live running status, PNR codes, schedules and route choices —
            with links to official Indian Railways sources.
          </p>
          <ul className="blog-card-grid blog-card-grid-index">
            {blogArticles.map((article) => (
              <li key={article.path}>
                <Link className="blog-card" to={article.path}>
                  <span className="blog-card-eyebrow">Guide</span>
                  <strong>{article.title}</strong>
                  <span className="blog-card-desc">{article.description}</span>
                  <span className="blog-card-cta">Read guide →</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
      <footer className="blog-footer">
        <Link to="/">← Back to RailDisha home</Link>
        <span>RailDisha</span>
      </footer>
    </div>
  );
}

export function BlogArticlePage() {
  const { slug } = useParams();
  const article = getArticleBySlug(slug);

  useEffect(() => {
    if (!article) return;
    applyDocumentMeta({
      title: article.seoTitle,
      description: article.description,
      canonical: article.canonical,
      path: article.path,
      ogType: "article",
    });
    window.scrollTo(0, 0);
  }, [article]);

  if (!article) {
    return <Navigate to="/blog" replace />;
  }

  const related = getRelatedArticles(article.slug);

  return (
    <div className="app blog-app">
      <SiteNav />
      <main className="blog-article-page">
        <article className="blog-article">
          <p className="blog-crumbs">
            <Link to="/">Home</Link>
            <span aria-hidden="true"> / </span>
            <Link to="/blog">Blog</Link>
          </p>
          <h1>{article.title}</h1>

          {article.sections.map((section, index) => (
            <section key={`${article.slug}-${index}`} className="blog-section">
              {section.heading ? <h2>{section.heading}</h2> : null}
              {section.paragraphs.map((paragraph, pIndex) => (
                <p
                  key={`${article.slug}-${index}-${pIndex}`}
                  dangerouslySetInnerHTML={{ __html: paragraph.html }}
                />
              ))}
            </section>
          ))}

          {article.sources?.length > 0 && (
            <section className="blog-sources" aria-labelledby="blog-sources-heading">
              <h2 id="blog-sources-heading">Official sources</h2>
              <ul>
                {article.sources.map((source) => (
                  <li key={source.label}>
                    <span>{source.label}: </span>
                    {(source.urls || []).map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {url}
                      </a>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {related.length > 0 && (
            <section className="blog-related" aria-labelledby="blog-related-heading">
              <h2 id="blog-related-heading">Related guides</h2>
              <ul>
                {related.map((item) => (
                  <li key={item.path}>
                    <Link to={item.path}>{item.title}</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <nav className="blog-article-nav" aria-label="Blog navigation">
            <Link to="/blog">← Back to blog</Link>
            <Link to="/">RailDisha home</Link>
          </nav>
        </article>
      </main>
    </div>
  );
}
