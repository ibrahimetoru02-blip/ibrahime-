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
  const pageButtons = document.querySelector("#cms-page-buttons");
  const addMediaToggle = document.querySelector("#cms-add-media-toggle");
  const contactToggle = document.querySelector("#cms-contact-toggle");
  const addMediaForm = document.querySelector("#cms-add-media-form");
  const addMediaPage = document.querySelector("#cms-add-media-page");
  const addMediaFile = document.querySelector("#cms-add-media-file");
  const addMediaTitle = document.querySelector("#cms-add-media-title");
  const addMediaDescription = document.querySelector("#cms-add-media-description");
  const contentCount = document.querySelector("#cms-content-count");
  const fieldsContainer = document.querySelector("#cms-fields");
  const editorMessage = document.querySelector("#cms-editor-message");
  const editorError = document.querySelector("#cms-editor-error");
  let session = null;
  let contentRecords = new Map();
  let catalog = [];
  let activePage = PAGES[0][0];

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
    editor.hidden = false;
    if (!catalog.length) {
      setMessage(editorMessage, "Loading editable website content…");
      try {
        const pageCatalog = await loadCatalog();
        const records = await request("/rest/v1/site_content?select=key,value");
        contentRecords = new Map(records.map((record) => [record.key, record.value]));
        const addedMedia = records
          .filter((record) => record.key.startsWith("page-media.") && record.value?.page && record.value?.url)
          .map((record) => ({
            key: record.key,
            label: record.value.title || "Added media",
            page: record.value.page,
            pageLabel: PAGES.find(([file]) => file === record.value.page)?.[1] || record.value.page,
            type: "added-media",
            value: record.value,
          }));
        catalog = [...pageCatalog, ...addedMedia];
        renderPageButtons();
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
      const validationMessages = [
        "Use an HTTPS, mailto:, or tel: link.",
        "Enter a valid contact email address.",
        "Enter a valid phone number with its country code, or a local number beginning with 0.",
      ];
      editorError.textContent = validationMessages.includes(error.message)
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

  function renderPageButtons() {
    pageButtons.replaceChildren();
    [...PAGES, [GLOBAL_PAGE, "Contact & footer"]].forEach(([file, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cms-page-button";
      button.textContent = label;
      button.setAttribute("aria-pressed", String(file === activePage));
      button.addEventListener("click", () => {
        activePage = file;
        renderFields();
      });
      pageButtons.append(button);
    });
  }

  function renderFields() {
    fieldsContainer.replaceChildren();
    const filtered = catalog.filter((item) => item.page === activePage);
    pageButtons.querySelectorAll(".cms-page-button").forEach((button, index) => {
      const [file] = [...PAGES, [GLOBAL_PAGE, "Contact & footer"]][index];
      button.setAttribute("aria-pressed", String(file === activePage));
    });
    contactToggle.setAttribute("aria-pressed", String(activePage === GLOBAL_PAGE));
    addMediaToggle.hidden = activePage === GLOBAL_PAGE;
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
      } else if (item.type === "added-media") {
        renderAddedMediaField(card, item);
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
        const value = control.value.trim();
        if (item.type === "link" && !/^(https:\/\/|mailto:|tel:)/i.test(control.value.trim())) {
          throw new Error("Use an HTTPS, mailto:, or tel: link.");
        }
        const entries = [{ key: item.key, value }];
        if (item.key === "contact.email") {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            throw new Error("Enter a valid contact email address.");
          }
          entries.push({ key: "contact.email.href", value: `mailto:${value}` });
        } else if (item.key === "contact.phone") {
          let phoneDigits = value.replace(/\D/g, "");
          if (phoneDigits.startsWith("0")) phoneDigits = `256${phoneDigits.slice(1)}`;
          if (phoneDigits.length < 8 || phoneDigits.length > 15) {
            throw new Error("Enter a valid phone number with its country code, or a local number beginning with 0.");
          }
          entries.push({ key: "contact.whatsapp.href", value: `https://wa.me/${phoneDigits}` });
        }
        if (entries.length > 1) await saveContentEntries(entries);
        else await saveContent(item.key, value);
        entries.forEach((entry) => contentRecords.set(entry.key, entry.value));
        const linkedMessage = item.key === "contact.email" || item.key === "contact.phone"
          ? " Its click-to-contact link was updated automatically."
          : "";
        setMessage(editorMessage, `${item.label} saved.${linkedMessage} The live site will use the updated text.`, "success");
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
    const save = document.createElement("button");
    save.type = "button";
    save.className = "btn btn-primary cms-save-button";
    save.textContent = "Save description";
    save.addEventListener("click", async () => {
      save.disabled = true;
      setMessage(editorMessage, `Saving the description for ${item.label}…`);
      try {
        const value = { ...current, alt: altInput.value.trim() };
        await saveContent(item.key, value);
        contentRecords.set(item.key, value);
        setMessage(editorMessage, `${item.label} description saved. The existing media file was kept.`, "success");
        renderFields();
      } catch (error) {
        showError(error);
      } finally {
        save.disabled = false;
      }
    });
    card.append(preview, altLabel, altInput, save);
  }

  function renderAddedMediaField(card, item) {
    const current = contentRecords.get(item.key) || item.value;
    const preview = document.createElement(current.mediaType === "video" ? "video" : "img");
    preview.className = "cms-media-preview";
    preview.src = new URL(current.url, window.location.href).href;
    if (current.mediaType === "video") {
      preview.controls = true;
      preview.playsInline = true;
    } else {
      preview.alt = current.description || "";
    }

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.maxLength = 120;
    titleInput.className = "cms-text-input";
    titleInput.value = current.title || "";
    titleInput.setAttribute("aria-label", `${item.label} title`);
    const descriptionInput = document.createElement("textarea");
    descriptionInput.rows = 3;
    descriptionInput.maxLength = 500;
    descriptionInput.className = "cms-text-input";
    descriptionInput.value = current.description || "";
    descriptionInput.setAttribute("aria-label", `${item.label} description`);
    const save = document.createElement("button");
    save.type = "button";
    save.className = "btn btn-primary cms-save-button";
    save.textContent = "Save title and description";
    save.addEventListener("click", async () => {
      if (!titleInput.value.trim() || !descriptionInput.value.trim()) {
        setMessage(editorMessage, "Enter a title and description before saving.", "error");
        return;
      }
      save.disabled = true;
      setMessage(editorMessage, `Saving ${titleInput.value.trim()}…`);
      try {
        const value = {
          ...current,
          title: titleInput.value.trim(),
          description: descriptionInput.value.trim(),
          alt: descriptionInput.value.trim(),
        };
        await saveContent(item.key, value);
        contentRecords.set(item.key, value);
        item.value = value;
        item.label = value.title;
        setMessage(editorMessage, `${value.title} description saved. The media file was kept.`, "success");
        renderFields();
      } catch (error) {
        showError(error);
      } finally {
        save.disabled = false;
      }
    });

    const titleLabel = document.createElement("label");
    titleLabel.className = "cms-input-label";
    titleLabel.textContent = "Title";
    const descriptionLabel = document.createElement("label");
    descriptionLabel.className = "cms-input-label";
    descriptionLabel.textContent = "Image or video description";
    card.append(preview, titleLabel, titleInput, descriptionLabel, descriptionInput, save);
  }

  function validateMediaFile(file) {
    if (!file) return "Choose an image or video file.";
    if (file.size > 50 * 1024 * 1024) return "Choose a file smaller than 50 MB.";
    if (!["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"].includes(file.type)) {
      return "Choose a JPG, PNG, WebP, GIF, MP4, or WebM file.";
    }
    return "";
  }

  async function uploadMediaFile(file, key) {
    const mediaType = file.type.startsWith("video/") ? "video" : "image";
    const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const safeKey = key.replace(/[^a-zA-Z0-9._-]/g, "-");
    const objectPath = `site-content/${safeKey}/${Date.now()}-${filename}`;
    const path = objectPath.split("/").map(encodeURIComponent).join("/");
    await request(`/storage/v1/object/${config.mediaBucket}/${path}`, {
      method: "POST",
      headers: { "Content-Type": file.type, "x-upsert": "false" },
      body: file,
    });
    return { url: `${apiBase}/storage/v1/object/public/${config.mediaBucket}/${path}`, mediaType };
  }

  async function saveContent(key, value) {
    await request("/rest/v1/site_content?on_conflict=key", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ key, value }),
    });
  }

  async function saveContentEntries(entries) {
    await request("/rest/v1/site_content?on_conflict=key", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(entries),
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

  addMediaToggle.addEventListener("click", () => {
    addMediaForm.hidden = !addMediaForm.hidden;
    addMediaToggle.setAttribute("aria-expanded", String(!addMediaForm.hidden));
    if (!addMediaForm.hidden) {
      addMediaPage.value = PAGES.some(([file]) => file === activePage) ? activePage : "";
      addMediaPage.focus();
    }
  });
  contactToggle.addEventListener("click", () => {
    activePage = GLOBAL_PAGE;
    addMediaForm.hidden = true;
    addMediaToggle.setAttribute("aria-expanded", "false");
    renderFields();
    fieldsContainer.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  addMediaForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!addMediaForm.reportValidity()) return;
    const file = addMediaFile.files?.[0];
    const fileError = validateMediaFile(file);
    if (fileError) {
      setMessage(editorMessage, fileError, "error");
      return;
    }
    const submit = addMediaForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    setMessage(editorMessage, `Uploading ${addMediaTitle.value.trim()}…`);
    try {
      const uniqueId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const key = `page-media.${uniqueId}`;
      const uploaded = await uploadMediaFile(file, key);
      const value = {
        page: addMediaPage.value,
        title: addMediaTitle.value.trim(),
        description: addMediaDescription.value.trim(),
        alt: addMediaDescription.value.trim(),
        ...uploaded,
      };
      await saveContent(key, value);
      contentRecords.set(key, value);
      catalog.push({
        key,
        label: value.title,
        page: value.page,
        pageLabel: PAGES.find(([file]) => file === value.page)?.[1] || value.page,
        type: "added-media",
        value,
      });
      activePage = value.page;
      addMediaForm.reset();
      addMediaForm.hidden = true;
      addMediaToggle.setAttribute("aria-expanded", "false");
      renderFields();
      setMessage(editorMessage, `${value.title} added to ${PAGES.find(([file]) => file === value.page)?.[1] || value.page}.`, "success");
    } catch (error) {
      showError(error);
    } finally {
      submit.disabled = false;
    }
  });
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
