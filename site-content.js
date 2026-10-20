(() => {
  "use strict";

  const scrollKey = `stevepics.pageScroll:${window.location.pathname}${window.location.search}${window.location.hash}`;
  const navigation = performance.getEntriesByType?.("navigation")?.[0];
  const isReload = navigation
    ? navigation.type === "reload"
    : performance.navigation?.type === 1;
  let restoreStarted = false;
  let scrollSaveTimer = 0;

  if (isReload && "scrollRestoration" in window.history) {
    window.history.scrollRestoration = "manual";
  }

  const saveScrollPosition = () => {
    try {
      sessionStorage.setItem(scrollKey, JSON.stringify({ x: window.scrollX, y: window.scrollY }));
    } catch (error) {
      console.error("Unable to save the current page position.", error);
    }
  };

  window.addEventListener("scroll", () => {
    window.clearTimeout(scrollSaveTimer);
    scrollSaveTimer = window.setTimeout(saveScrollPosition, 100);
  }, { passive: true });
  window.addEventListener("pagehide", saveScrollPosition);

  const restoreScrollPosition = () => {
    if (!isReload || restoreStarted) return;
    restoreStarted = true;
    try {
      const saved = sessionStorage.getItem(scrollKey);
      if (!saved) return;
      const position = JSON.parse(saved);
      if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return;
      let attempts = 0;
      const restore = () => {
        window.scrollTo(position.x, position.y);
        attempts += 1;
        const positionReached = Math.abs(window.scrollY - position.y) < 2;
        if (attempts < 100 && (!positionReached || document.readyState !== "complete")) {
          window.setTimeout(() => requestAnimationFrame(restore), 100);
        } else {
          sessionStorage.removeItem(scrollKey);
        }
      };
      requestAnimationFrame(() => requestAnimationFrame(restore));
    } catch (error) {
      console.error("Unable to restore the current page position.", error);
    }
  };

  window.addEventListener("load", restoreScrollPosition, { once: true });

  const config = window.STEVEPICS_SUPABASE;
  if (!config || config.url.includes("YOUR_PROJECT_ID") || config.anonKey.includes("YOUR_SUPABASE_ANON_KEY")) {
    restoreScrollPosition();
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
    const additions = records
      .filter((record) =>
        record.key.startsWith("page-media.") && record.value?.page === page && !record.value?.hidden,
      )
      .sort((first, second) => {
        const firstCreated = first.value.createdAt || "";
        const secondCreated = second.value.createdAt || "";
        return firstCreated.localeCompare(secondCreated) || first.key.localeCompare(second.key);
      });
    if (!additions.length) return;

    let defaultTargetGrid = document.querySelector(".portfolio-grid");

    additions.forEach(({ key, value }) => {
      let targetGrid = page === "gallery.html" || value.section === "more-projects"
        ? document.querySelector("#more-projects-grid")
        : defaultTargetGrid;
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
        defaultTargetGrid = targetGrid;
      }
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
      let projectLink = "";
      if (typeof value.link === "string" && value.link.trim()) {
        try {
          const linkUrl = new URL(value.link, window.location.href);
          if (linkUrl.protocol === "https:") projectLink = linkUrl.href;
        } catch (error) {
          console.error("Invalid added project click-through URL.", error);
        }
      }
      if (projectLink && media.tagName === "IMG") {
        const link = document.createElement("a");
        link.className = "other-project-link";
        link.href = projectLink;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.setAttribute("aria-label", `View ${value.title || "featured project"}`);
        link.append(media);
        card.append(link);
      } else {
        card.append(media);
      }
      const caption = document.createElement("figcaption");
      const captionTitle = document.createElement("strong");
      captionTitle.textContent = value.title || "Studio media";
      const description = document.createElement("div");
      description.textContent = value.description || "";
      caption.append(captionTitle, description);
      if (projectLink) {
        const cta = document.createElement("a");
        cta.className = "other-project-cta";
        cta.href = projectLink;
        cta.target = "_blank";
        cta.rel = "noopener noreferrer";
        cta.textContent = "View project";
        caption.append(cta);
      }
      card.append(caption);
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

  loadSiteContent()
    .then(restoreScrollPosition)
    .catch((error) => {
      console.error("Unable to load shared website content. Showing the built-in page content.", error);
      restoreScrollPosition();
    });
})();
