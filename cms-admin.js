(() => {
  "use strict";

  const config = window.STEVEPICS_SUPABASE;
  const SESSION_KEY = "stevepics.cmsSession";
  const PAGES = [
    ["index.html", "Home"],
    ["about.html", "About"],
    ["services.html", "Services"],
    ["gallery.html", "Gallery"],
    ["location.html", "Location"],
    ["contact.html", "Contact"],
    ["booking.html", "Booking"],
  ];
  const GLOBAL_PAGE = "global-footer";
  const editor = document.querySelector("#cms-editor");
  const pageFilter = document.querySelector("#cms-page-filter");
  const contentCount = document.querySelector("#cms-content-count");
  const fieldsContainer = document.querySelector("#cms-fields");
  const editorMessage = document.querySelector("#cms-editor-message");
  const editorError = document.querySelector("#cms-editor-error");
  let session = null;
  let contentRecords = new Map();
  let catalog = [];

  document.querySelectorAll("#year").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });

  const apiBase = config?.url?.replace(/\/$/, "");
  const isConfigured = apiBase && config.anonKey &&
    !apiBase.includes("YOUR_PROJECT_ID") && !config.anonKey.includes("YOUR_SUPABASE_ANON_KEY");
  const redirectToAdmin = () => {
    const adminUrl = new URL("admin.html", window.location.href);
    adminUrl.searchParams.set("returnTo", "site-editor.html");
    window.location.replace(adminUrl);
  };

  const request = async (path, options = {}, useSession = true) => {
    const headers = new Headers(options.headers || {});
    headers.set("apikey", config.anonKey);
    if (useSession && session?.access_token) {
      headers.set("Authorization", `Bearer ${session.access_token}`);
    }
    const response = await fetch(`${apiBase}${path}`, { ...options, headers });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.msg || body.message || body.error_description || `Request failed (${response.status}).`);
    }
    if (response.status === 204) {
      return null;
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };

  const setMessage = (message, text, state = "info") => {
    if (message) {
      message.textContent = text;
      message.className = `form-message ${state}`;
    }
  };

  const showEditor = async () => {
    login.hidden = true;
    editor.hidden = false;
    if (!catalog.length) {
      setMessage(editorMessage, "Loading editable website content…");
      try {
        catalog = await loadCatalog();
        const records = await request("/rest/v1/site_content?select=key,value");
        contentRecords = new Map(records.map((record) => [record.key, record.value]));
        renderPageOptions();
        renderFields();
        setMessage(editorMessage, "");
      } catch (error) {
        showError(error);
      }
    }
  };

  const showError = (error) => {
    console.error("Website editor operation failed.", error);
    if (editorError) {
      editorError.textContent = error.message === "Use an HTTPS, mailto:, or tel: link."
        ? error.message
        : "We couldn't complete that update. Please try again.";
      editorError.hidden = false;
    }
    setMessage(editorMessage, "");
  };

  async function loadCatalog() {
    const entries = new Map();
    for (const [file, pageLabel] of PAGES) {
      const response = await fetch(file);
      if (!response.ok) {
        throw new Error(`Could not load ${pageLabel} page fields (${response.status}).`);
      }
      const source = new DOMParser().parseFromString(await response.text(), "text/html");
      source.querySelectorAll("[data-cms-key]").forEach((element) => {
        const key = element.dataset.cmsKey;
        if (!entries.has(key)) {
          entries.set(key, {
            key,
            label: element.dataset.cmsLabel || key,
            page: file,
            pageLabel,
            type: "text",
            value: element.textContent.trim(),
          });
        }
      });
      source.querySelectorAll("[data-cms-media]").forEach((element) => {
        const key = element.dataset.cmsMedia;
        if (!entries.has(key)) {
          entries.set(key, {
            key,
            label: element.dataset.cmsLabel || key,
            page: file,
            pageLabel,
            type: "media",
            value: {
              url: element.getAttribute("src") || "",
              mediaType: element.tagName.toLowerCase() === "video" ? "video" : "image",
              alt: element.getAttribute("alt") || "",
            },
          });
        }
      });
      source.querySelectorAll("[data-cms-href]").forEach((element) => {
        const key = element.dataset.cmsHref;
        if (!entries.has(key)) {
          entries.set(key, {
            key,
            label: element.dataset.cmsLabel || key,
            page: file,
            pageLabel,
            type: "link",
            value: element.getAttribute("href") || "",
          });
        }
      });
    }
    return [...entries.values()].map((entry) => {
      if (entry.key.startsWith("contact.") || entry.key.startsWith("footer.social.")) {
        return { ...entry, page: GLOBAL_PAGE, pageLabel: "Global footer" };
      }
      return entry;
    });
  }

  function renderPageOptions() {
    const globalOption = document.createElement("option");
    globalOption.value = GLOBAL_PAGE;
    globalOption.textContent = "Global footer";
    pageFilter.append(globalOption);
    PAGES.forEach(([file, label]) => {
      const option = document.createElement("option");
      option.value = file;
      option.textContent = label;
      pageFilter.append(option);
    });
  }

  function renderFields() {
    fieldsContainer.replaceChildren();
    const page = pageFilter.value;
    const filtered = catalog.filter((item) => page === "all" || item.page === page);
    if (contentCount) {
      contentCount.textContent = `${filtered.length} editable item${filtered.length === 1 ? "" : "s"}`;
    }
    filtered.forEach((item) => {
      const card = document.createElement("article");
      card.className = "cms-field-card";
      const title = document.createElement("h3");
      title.textContent = item.label;
      const pageName = document.createElement("p");
      pageName.className = "admin-muted cms-field-page";
      pageName.textContent = item.pageLabel;
      card.append(title, pageName);
      if (item.type === "media") {
        renderMediaField(card, item);
      } else {
        renderTextField(card, item);
      }
      fieldsContainer.append(card);
    });
  }

  function renderTextField(card, item) {
    const control = document.createElement(item.type === "link" ? "input" : "textarea");
    control.className = item.type === "link" ? "cms-text-input cms-url-input" : "cms-text-input";
    if (item.type === "link") {
      control.type = "text";
    } else {
      control.rows = Math.max(3, Math.min(8, Math.ceil(item.value.length / 85)));
    }
    const saved = contentRecords.get(item.key);
    control.value = typeof saved === "string" ? saved : (saved?.value ?? item.value);
    control.setAttribute("aria-label", item.label);
    const save = document.createElement("button");
    save.type = "button";
    save.className = "btn btn-primary cms-save-button";
    save.textContent = "Save text";
    save.addEventListener("click", async () => {
      save.disabled = true;
      setMessage(editorMessage, `Saving ${item.label}…`);
      try {
        if (item.type === "link" && !/^(https:\/\/|mailto:|tel:)/i.test(control.value.trim())) {
          throw new Error("Use an HTTPS, mailto:, or tel: link.");
        }
        await saveContent(item.key, control.value);
        contentRecords.set(item.key, control.value);
        setMessage(editorMessage, `${item.label} saved. The live site will use the updated text.`, "success");
      } catch (error) {
        showError(error);
      } finally {
        save.disabled = false;
      }
    });
    card.append(control, save);
  }

  function renderMediaField(card, item) {
    const saved = contentRecords.get(item.key);
    const current = saved && typeof saved === "object" ? saved : item.value;
    const preview = document.createElement(current.mediaType === "video" ? "video" : "img");
    preview.className = "cms-media-preview";
    preview.src = new URL(current.url, window.location.href).href;
    if (current.mediaType === "video") {
      preview.controls = true;
      preview.playsInline = true;
      preview.setAttribute("aria-label", current.alt || item.label);
    } else {
      preview.alt = current.alt || "";
    }
    const altLabel = document.createElement("label");
    altLabel.className = "cms-input-label";
    altLabel.textContent = "Image description / video label";
    const altInput = document.createElement("input");
    altInput.type = "text";
    altInput.className = "cms-alt-input";
    altInput.value = current.alt || "";
    altInput.setAttribute("aria-label", `${item.label} description`);
    const fileLabel = document.createElement("label");
    fileLabel.className = "cms-input-label";
    fileLabel.textContent = "Choose replacement image or video";
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm";
    fileInput.className = "cms-file-input";
    fileInput.setAttribute("aria-label", `Choose replacement for ${item.label}`);
    const save = document.createElement("button");
    save.type = "button";
    save.className = "btn btn-primary cms-save-button";
    save.textContent = "Save media";
    save.addEventListener("click", async () => {
      const file = fileInput.files?.[0];
      if (!file && !current.url) {
        setMessage(editorMessage, "Choose an image or video before saving.", "error");
        return;
      }
      if (file && file.size > 50 * 1024 * 1024) {
        setMessage(editorMessage, "Choose a file smaller than 50 MB.", "error");
        return;
      }
      if (file && !["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"].includes(file.type)) {
        setMessage(editorMessage, "Choose a JPG, PNG, WebP, GIF, MP4, or WebM file.", "error");
        return;
      }
      save.disabled = true;
      setMessage(editorMessage, `Saving ${item.label}…`);
      try {
        let url = current.url;
        let mediaType = current.mediaType;
        if (file) {
          mediaType = file.type.startsWith("video/") ? "video" : "image";
          const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
          const objectPath = `${item.key}/${Date.now()}-${filename}`;
          const path = objectPath.split("/").map(encodeURIComponent).join("/");
          const result = await request(`/storage/v1/object/${config.mediaBucket}/${path}`, {
            method: "POST",
            headers: { "Content-Type": file.type, "x-upsert": "false" },
            body: file,
          });
          void result;
          url = `${apiBase}/storage/v1/object/public/${config.mediaBucket}/${path}`;
        }
        const value = { url, mediaType, alt: altInput.value.trim() };
        await saveContent(item.key, value);
        contentRecords.set(item.key, value);
        setMessage(editorMessage, `${item.label} saved. The live site will use the updated media.`, "success");
        renderFields();
      } catch (error) {
        showError(error);
      } finally {
        save.disabled = false;
      }
    });
    card.append(preview, altLabel, altInput, fileLabel, fileInput, save);
  }

  async function saveContent(key, value) {
    await request("/rest/v1/site_content?on_conflict=key", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ key, value }),
    });
  }

  const restoreSession = async () => {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (!saved) return false;
    try {
      session = JSON.parse(saved);
      if (session.expires_at <= Math.floor(Date.now() / 1000) + 30) {
        const refreshed = await fetch(`${apiBase}/auth/v1/token?grant_type=refresh_token`, {
          method: "POST",
          headers: { apikey: config.anonKey, "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        });
        if (!refreshed.ok) throw new Error("Your admin session expired. Please sign in again.");
        session = normalizeSession(await refreshed.json());
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      }
      const user = await request("/auth/v1/user");
      const adminRows = await request(`/rest/v1/site_admins?select=user_id&user_id=eq.${encodeURIComponent(user.id)}`);
      if (!adminRows.length) throw new Error("not-authorized");
      return true;
    } catch (error) {
      console.error("Could not restore the content editor session.", error);
      session = null;
      sessionStorage.removeItem(SESSION_KEY);
      return false;
    }
  };

  function normalizeSession(value) {
    return { ...value, expires_at: value.expires_at || Math.floor(Date.now() / 1000) + value.expires_in };
  }

  if (!isConfigured) {
    editor.hidden = false;
    setMessage(editorMessage, "The website editor is temporarily unavailable. Please contact the studio for help.", "error");
  }

  pageFilter.addEventListener("change", renderFields);
  document.querySelector("#cms-logout").addEventListener("click", async () => {
    try {
      await request("/auth/v1/logout", { method: "POST" });
    } catch (error) {
      console.error("Supabase sign-out failed.", error);
    }
    session = null;
    sessionStorage.removeItem(SESSION_KEY);
    window.location.replace("admin.html");
  });

  if (isConfigured) {
    restoreSession().then((restored) => {
      if (restored) showEditor();
      else redirectToAdmin();
    });
  }
})();
