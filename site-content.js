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
  };

  loadSiteContent().catch((error) => {
    console.error("Unable to load shared website content. Showing the built-in page content.", error);
  });
})();
