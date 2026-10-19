(() => {
  "use strict";

  const config = window.STEVEPICS_SUPABASE;
  if (!config || config.url.includes("YOUR_PROJECT_ID") || config.anonKey.includes("YOUR_SUPABASE_ANON_KEY")) {
    return;
  }

  const updateMedia = (element, media) => {
    if (!media || typeof media.url !== "string" || !["image", "video"].includes(media.mediaType)) {
      return;
    }
    if (media.hidden) {
      const portfolioCard = element.closest("figure.portfolio-card");
      if (portfolioCard) portfolioCard.remove();
      else element.remove();
      return;
    }
    let url;
    try {
      url = new URL(media.url, window.location.href);
    } catch (error) {
      console.error("Invalid saved site media URL.", error);
      return;
    }
    if (!["http:", "https:"].includes(url.protocol)) {
      console.error("Blocked site media URL using an unsupported protocol.", media.url);
      return;
    }

    const replacement = document.createElement(media.mediaType === "video" ? "video" : "img");
    replacement.className = element.className;
    replacement.dataset.cmsMedia = element.dataset.cmsMedia;
    replacement.dataset.cmsLabel = element.dataset.cmsLabel || "";
    if (media.mediaType === "video") {
      replacement.src = url.href;
      replacement.controls = true;
      replacement.playsInline = true;
      replacement.setAttribute("aria-label", media.alt || element.alt || "Studio video");
    } else {
      replacement.src = url.href;
      replacement.alt = media.alt || element.alt || "";
    }
    element.replaceWith(replacement);
  };

  const renderAddedMedia = (records, page) => {
    const additions = records.filter((record) =>
      record.key.startsWith("page-media.") && record.value?.page === page && !record.value?.hidden,
    );
    if (!additions.length) return;

    let targetGrid = document.querySelector(".portfolio-grid");
    if (!targetGrid) {
      const main = document.querySelector("main");
      if (!main) return;
      const section = document.createElement("section");
      section.className = "section container cms-added-media-section";
      const heading = document.createElement("div");
      heading.className = "section-heading";
      const eyebrow = document.createElement("p");
      eyebrow.className = "eyebrow";
      eyebrow.textContent = "More from the studio";
      const title = document.createElement("h2");
      title.textContent = "Featured work";
      heading.append(eyebrow, title);
      targetGrid = document.createElement("div");
      targetGrid.className = "portfolio-grid";
      section.append(heading, targetGrid);
      main.append(section);
    }

    additions.forEach(({ key, value }) => {
      if (targetGrid.querySelector(`[data-cms-added-media="${CSS.escape(key)}"]`)) return;
      let url;
      try {
        url = new URL(value.url, window.location.href);
      } catch (error) {
        console.error("Invalid added site media URL.", error);
        return;
      }
      if (!["http:", "https:"].includes(url.protocol) || !["image", "video"].includes(value.mediaType)) return;

      const card = document.createElement("figure");
      card.className = "portfolio-card";
      card.dataset.cmsAddedMedia = key;
      const media = document.createElement(value.mediaType === "video" ? "video" : "img");
      media.src = url.href;
      if (value.mediaType === "video") {
        media.controls = true;
        media.playsInline = true;
        media.setAttribute("aria-label", value.description || value.title || "Studio video");
      } else {
        media.alt = value.description || "";
        media.loading = "lazy";
      }
      const caption = document.createElement("figcaption");
      const captionTitle = document.createElement("strong");
      captionTitle.textContent = value.title || "Studio media";
      const description = document.createElement("div");
      description.textContent = value.description || "";
      caption.append(captionTitle, description);
      card.append(media, caption);
      targetGrid.append(card);
    });
  };

  const loadSiteContent = async () => {
    const response = await fetch(
      `${config.url.replace(/\/$/, "")}/rest/v1/site_content?select=key,value`,
      { headers: { apikey: config.anonKey } },
    );
    if (!response.ok) {
      throw new Error(`Content request failed (${response.status}).`);
    }
    const records = await response.json();
    const content = new Map(records.map((record) => [record.key, record.value]));

    document.querySelectorAll("[data-cms-key]").forEach((element) => {
      const value = content.get(element.dataset.cmsKey);
      if (typeof value === "string") {
        element.textContent = value;
      } else if (value && typeof value.value === "string") {
        element.textContent = value.value;
      }
    });

    document.querySelectorAll("[data-cms-media]").forEach((element) => {
      const value = content.get(element.dataset.cmsMedia);
      if (value && typeof value === "object") {
        updateMedia(element, value);
      }
    });

    document.querySelectorAll("[data-cms-href]").forEach((element) => {
      const value = content.get(element.dataset.cmsHref);
      if (typeof value === "string" && ["https:", "mailto:", "tel:"].some((protocol) => value.startsWith(protocol))) {
        element.href = value;
      }
    });

    const page = window.location.pathname.split("/").pop() || "index.html";
    renderAddedMedia(records, page);
  };

  loadSiteContent().catch((error) => {
    console.error("Unable to load shared website content. Showing the built-in page content.", error);
  });
})();
