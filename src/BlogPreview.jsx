import React from "react";
import { Link } from "react-router-dom";
import { blogArticles } from "./blogData.js";

export function BlogPreview() {
  return (
    <section className="blog-preview" aria-labelledby="blog-preview-heading">
      <div className="blog-preview-inner">
        <div className="blog-preview-header">
          <span className="eyebrow">FROM THE BLOG</span>
          <h2 id="blog-preview-heading">Guides for clearer train travel</h2>
          <p>
            Practical reading on running status, PNR codes, schedules and finding trains between
            stations.
          </p>
        </div>
        <ul className="blog-card-grid">
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
        <div className="blog-preview-more">
          <Link className="blog-more-link" to="/blog">
            View all blog guides
          </Link>
        </div>
      </div>
    </section>
  );
}
