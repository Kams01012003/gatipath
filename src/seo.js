const SITE = "https://raildisha.com";

function upsertMeta(selector, attributes) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement(attributes.property || attributes.name ? "meta" : "link");
    document.head.appendChild(el);
  }
  Object.entries(attributes).forEach(([key, value]) => {
    if (value == null) el.removeAttribute(key);
    else el.setAttribute(key, value);
  });
  return el;
}

export function applyDocumentMeta({
  title,
  description,
  canonical,
  path,
  ogType = "website",
  robots,
}) {
  if (title) document.title = title;

  upsertMeta('meta[name="description"]', {
    name: "description",
    content: description || "",
  });

  if (robots) {
    upsertMeta('meta[name="robots"]', {
      name: "robots",
      content: robots,
    });
  } else {
    const existing = document.head.querySelector('meta[name="robots"]');
    if (existing) existing.remove();
  }

  const canonicalUrl = canonical || `${SITE}${path || "/"}`;
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", canonicalUrl);

  upsertMeta('meta[property="og:title"]', {
    property: "og:title",
    content: title || "",
  });
  upsertMeta('meta[property="og:description"]', {
    property: "og:description",
    content: description || "",
  });
  upsertMeta('meta[property="og:url"]', {
    property: "og:url",
    content: canonicalUrl,
  });
  upsertMeta('meta[property="og:type"]', {
    property: "og:type",
    content: ogType,
  });
  upsertMeta('meta[property="og:site_name"]', {
    property: "og:site_name",
    content: "RailDisha",
  });
}
