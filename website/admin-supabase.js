(() => {
  "use strict";

  const config = window.STEVEPICS_SUPABASE;
  const SESSION_KEY = "stevepics.cmsSession";
  const statuses = ["new", "contacted", "confirmed", "completed", "cancelled"];
  const loginPanel = document.querySelector("#admin-login");
  const loginForm = document.querySelector("#admin-login-form");
  const forgotPasswordButton = document.querySelector("#admin-forgot-password");
  const dashboard = document.querySelector("#admin-dashboard");
  const loginMessage = document.querySelector("#admin-login-message");
  const bookingsBody = document.querySelector("#booking-table-body");
  const searchInput = document.querySelector("#booking-search");
  const statusFilter = document.querySelector("#booking-status-filter");
  const emptyState = document.querySelector("#booking-empty-state");
  const noResults = document.querySelector("#booking-no-results");
  const storageError = document.querySelector("#booking-storage-error");
  const countLabel = document.querySelector("#booking-count-label");
  const totalEl = document.querySelector("#stat-total");
  const newEl = document.querySelector("#stat-new");
  const confirmedEl = document.querySelector("#stat-confirmed");
  const showChangeEmailButton = document.querySelector("#show-change-email");
  const changeEmailForm = document.querySelector("#change-admin-email-form");
  const cancelChangeEmailButton = document.querySelector("#cancel-change-email");
  const changeEmailMessage = document.querySelector("#change-admin-email-message");
  let session = null;
  let bookings = [];

  document.querySelectorAll("#year").forEach((el) => { el.textContent = String(new Date().getFullYear()); });
  document.querySelectorAll(".menu-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const links = button.parentElement?.querySelector(".nav-links");
      if (!links) return;
      const open = links.classList.toggle("open");
      button.setAttribute("aria-expanded", String(open));
    });
  });

  const apiBase = config?.url?.replace(/\/$/, "");
  const configured = apiBase && config.anonKey && !apiBase.includes("YOUR_PROJECT_ID") && !config.anonKey.includes("YOUR_SUPABASE_ANON_KEY");
  const headers = (extra = {}) => {
    const result = { apikey: config.anonKey, ...extra };
    if (session?.access_token) result.Authorization = `Bearer ${session.access_token}`;
    return result;
  };
  const api = async (path, options = {}) => {
    const response = await fetch(`${apiBase}${path}`, { ...options, headers: headers(options.headers || {}) });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || body.msg || body.details || `Request failed (${response.status}).`);
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };
  const showError = (text) => {
    if (storageError) { storageError.textContent = text; storageError.hidden = false; }
  };
  const formatDate = (value) => {
    if (!value) return "Not specified";
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  };
  const formatDateTime = (value) => {
    if (!value) return "Unknown";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  };
  const textCell = (value) => {
    const span = document.createElement("span");
    span.textContent = value || "—";
    return span;
  };
  const addCell = (row, child) => { const cell = document.createElement("td"); cell.append(child); row.append(cell); return cell; };

  function render() {
    bookingsBody.replaceChildren();
    const query = (searchInput?.value || "").trim().toLowerCase();
    const chosenStatus = statusFilter?.value || "all";
    const filtered = bookings.filter((b) => {
      const haystack = [b.name, b.email, b.phone, b.service, b.address, b.notes].join(" ").toLowerCase();
      return haystack.includes(query) && (chosenStatus === "all" || b.status === chosenStatus);
    });
    if (totalEl) totalEl.textContent = String(bookings.length);
    if (newEl) newEl.textContent = String(bookings.filter((b) => b.status === "new").length);
    if (confirmedEl) confirmedEl.textContent = String(bookings.filter((b) => b.status === "confirmed").length);
    if (countLabel) countLabel.textContent = `${filtered.length} of ${bookings.length} request${bookings.length === 1 ? "" : "s"} shown`;
    if (emptyState) emptyState.hidden = bookings.length !== 0;
    if (noResults) noResults.hidden = bookings.length === 0 || filtered.length !== 0;

    filtered.forEach((b) => {
      const row = document.createElement("tr");
      const client = document.createElement("div");
      client.className = "admin-client-cell";
      const name = document.createElement("strong"); name.textContent = b.name || "Unnamed client";
      const contact = document.createElement("span"); contact.className = "admin-cell-secondary";
      contact.textContent = [b.email, b.phone].filter(Boolean).join(" · ") || "No contact details";
      client.append(name, contact); addCell(row, client);

      const service = document.createElement("div");
      const serviceName = document.createElement("strong"); serviceName.textContent = b.service || "Service not specified";
      const date = document.createElement("span"); date.className = "admin-cell-secondary"; date.textContent = formatDate(b.preferred_date);
      service.append(serviceName, date); addCell(row, service);
      addCell(row, textCell([b.address, b.notes].filter(Boolean).join(" — ")));
      addCell(row, textCell(formatDateTime(b.submitted_at)));

      const select = document.createElement("select"); select.setAttribute("aria-label", `Status for ${b.name || "booking"}`);
      statuses.forEach((status) => { const option = document.createElement("option"); option.value = status; option.textContent = status[0].toUpperCase() + status.slice(1); select.append(option); });
      select.value = statuses.includes(b.status) ? b.status : "new";
      select.addEventListener("change", async () => {
        select.disabled = true;
        try {
          await api(`/rest/v1/booking_requests?id=eq.${encodeURIComponent(b.id)}`, {
            method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
            body: JSON.stringify({ status: select.value }),
          });
          b.status = select.value; render();
        } catch (error) { console.error("Could not update booking status.", error); showError("We couldn't update this booking. Please try again."); select.disabled = false; select.value = b.status; }
      });
      addCell(row, select);

      const deleteButton = document.createElement("button"); deleteButton.type = "button"; deleteButton.className = "btn btn-secondary"; deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", async () => {
        if (!window.confirm(`Delete the booking request from ${b.name || "this client"}? This cannot be undone.`)) return;
        deleteButton.disabled = true;
        try {
          await api(`/rest/v1/booking_requests?id=eq.${encodeURIComponent(b.id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
          bookings = bookings.filter((item) => item.id !== b.id); render();
        } catch (error) { console.error("Could not delete booking.", error); showError("We couldn't delete this booking. Please try again."); deleteButton.disabled = false; }
      });
      addCell(row, deleteButton);
      bookingsBody.append(row);
    });
  }

  async function loadBookings() {
    if (storageError) storageError.hidden = true;
    const rows = await api("/rest/v1/booking_requests?select=id,name,email,phone,address,preferred_date,service,notes,submitted_at,status&order=submitted_at.desc");
    bookings = rows;
    render();
  }

  const setLoginMessage = (text, state = "info") => {
    if (!loginMessage) return;
    loginMessage.textContent = text;
    loginMessage.className = `form-message ${state}`;
  };
  const setChangeEmailMessage = (text, state = "info") => {
    if (!changeEmailMessage) return;
    changeEmailMessage.textContent = text;
    changeEmailMessage.className = `form-message ${state}`;
  };
  const closeChangeEmailForm = () => {
    changeEmailForm.reset();
    changeEmailForm.hidden = true;
    showChangeEmailButton.setAttribute("aria-expanded", "false");
    setChangeEmailMessage("");
  };
  const normalizeSession = (value) => ({
    ...value,
    expires_at: value.expires_at || Math.floor(Date.now() / 1000) + (value.expires_in || 3600),
  });
  const showDashboard = async () => {
    loginPanel.hidden = true;
    dashboard.hidden = false;
    try {
      await loadBookings();
    } catch (error) {
      console.error("Could not load booking requests.", error);
      showError("We couldn't load booking requests. Please try again.");
    }
  };
  const verifyAdminSession = async () => {
    if (session.expires_at <= Math.floor(Date.now() / 1000) + 30) {
      const response = await fetch(`${apiBase}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { apikey: config.anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      if (!response.ok) throw new Error("session-expired");
      session = normalizeSession(await response.json());
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }
    const user = await api("/auth/v1/user");
    const admins = await api(`/rest/v1/site_admins?select=user_id&user_id=eq.${encodeURIComponent(user.id)}`);
    if (!admins.length) throw new Error("not-authorized");
  };

  async function initialize() {
    if (!configured) {
      loginForm.querySelector('button[type="submit"]').disabled = true;
      if (forgotPasswordButton) forgotPasswordButton.disabled = true;
      return;
    }
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); } catch (_) { saved = null; }
    if (!saved?.access_token) {
      setLoginMessage("Enter your administrator email and password to continue.");
      return;
    }
    try {
      session = normalizeSession(saved);
      await verifyAdminSession();
      await showDashboard();
    } catch (error) {
      console.error("Booking dashboard sign-in check failed:", error);
      sessionStorage.removeItem(SESSION_KEY);
      session = null;
      dashboard.hidden = true;
      loginPanel.hidden = false;
      setLoginMessage(
        error.message === "not-authorized"
          ? "This account doesn't have access to the admin dashboard."
          : "We couldn't verify your sign-in. Please sign in again.",
        "error",
      );
    }
  }

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = loginForm.querySelector('button[type="submit"]');
    const formData = new FormData(loginForm);
    button.disabled = true;
    setLoginMessage("Signing in…");
    try {
      const response = await fetch(`${apiBase}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: config.anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(formData.get("email") || "").trim(),
          password: String(formData.get("password") || ""),
        }),
      });
      if (!response.ok) throw new Error("sign-in-failed");
      session = normalizeSession(await response.json());
      await verifyAdminSession();
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      loginForm.reset();
      setLoginMessage("");
      await showDashboard();
    } catch (error) {
      console.error("Admin dashboard sign-in failed.", error);
      session = null;
      sessionStorage.removeItem(SESSION_KEY);
      setLoginMessage(
        error.message === "not-authorized"
          ? "This account doesn't have access to the admin dashboard."
          : "We couldn't sign you in. Check your details and try again.",
        "error",
      );
    } finally {
      button.disabled = false;
    }
  });

  forgotPasswordButton?.addEventListener("click", async () => {
    const emailInput = loginForm.elements.namedItem("email");
    if (!emailInput.reportValidity()) return;
    if (!configured) return;

    forgotPasswordButton.disabled = true;
    setLoginMessage("If an account uses that email, password reset instructions will be sent.");
    try {
      const redirectUrl = new URL("reset-password.html", window.location.href).href;
      const response = await fetch(
        `${apiBase}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectUrl)}`,
        {
          method: "POST",
          headers: { apikey: config.anonKey, "Content-Type": "application/json" },
          body: JSON.stringify({ email: emailInput.value.trim() }),
        },
      );
      if (!response.ok) throw new Error(`Password reset request failed (${response.status}).`);
    } catch (error) {
      console.error("Could not request an admin password reset.", error);
      setLoginMessage("We couldn't send reset instructions right now. Please try again later.", "error");
    } finally {
      forgotPasswordButton.disabled = false;
    }
  });

  showChangeEmailButton?.addEventListener("click", () => {
    const isOpen = !changeEmailForm.hidden;
    changeEmailForm.hidden = isOpen;
    showChangeEmailButton.setAttribute("aria-expanded", String(!isOpen));
    if (!isOpen) changeEmailForm.querySelector('input[name="current-email"]').focus();
    else closeChangeEmailForm();
  });
  cancelChangeEmailButton?.addEventListener("click", closeChangeEmailForm);
  changeEmailForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!changeEmailForm.reportValidity()) return;
    const submitButton = changeEmailForm.querySelector('button[type="submit"]');
    const formData = new FormData(changeEmailForm);
    const currentEmail = String(formData.get("current-email") || "").trim();
    const currentPassword = String(formData.get("current-password") || "");
    const newEmail = String(formData.get("new-email") || "").trim();
    submitButton.disabled = true;
    setChangeEmailMessage("Verifying your current sign-in…");
    try {
      await verifyAdminSession();
      const signedInUser = await api("/auth/v1/user");
      if (currentEmail.toLowerCase() !== String(signedInUser.email || "").toLowerCase() ||
          newEmail.toLowerCase() === currentEmail.toLowerCase()) {
        throw new Error("current-credentials-invalid");
      }

      const reauthentication = await fetch(`${apiBase}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: config.anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ email: currentEmail, password: currentPassword }),
      });
      if (!reauthentication.ok) throw new Error("current-credentials-invalid");
      const freshSession = normalizeSession(await reauthentication.json());
      if (freshSession.user?.id !== signedInUser.id) {
        throw new Error("current-credentials-invalid");
      }

      setChangeEmailMessage("Requesting the email change…");
      const updateResponse = await fetch(`${apiBase}/auth/v1/user`, {
        method: "PUT",
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${freshSession.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: newEmail }),
      });
      if (!updateResponse.ok) {
        const details = await updateResponse.json().catch(() => ({}));
        console.error("Supabase rejected the admin email change.", updateResponse.status, details);
        throw new Error("email-change-failed");
      }

      changeEmailForm.reset();
      setChangeEmailMessage(
        "Email change requested. Follow Supabase's confirmation instructions. With secure email changes enabled in Supabase, confirm the change from both your current and new email inboxes.",
        "success",
      );
    } catch (error) {
      console.error("Could not change the admin email.", error);
      setChangeEmailMessage(
        error.message === "current-credentials-invalid"
          ? "Your current email or password could not be verified. Please check them and try again."
          : error.message === "not-authorized"
            ? "This account doesn't have access to the admin dashboard."
            : "We couldn't request the email change. Check the new address and try again.",
        "error",
      );
    } finally {
      changeEmailForm.elements.namedItem("current-password").value = "";
      submitButton.disabled = false;
    }
  });

  searchInput?.addEventListener("input", render);
  statusFilter?.addEventListener("change", render);
  document.querySelector("#admin-logout")?.addEventListener("click", async () => {
    try { if (session?.access_token) await api("/auth/v1/logout", { method: "POST" }); } catch (error) { console.warn("Sign out request failed:", error); }
    sessionStorage.removeItem(SESSION_KEY); session = null; dashboard.hidden = true; loginPanel.hidden = false;
    setLoginMessage("You've signed out. Sign in again to continue.");
  });
  document.querySelector("#export-bookings")?.addEventListener("click", () => {
    const columns = ["name", "email", "phone", "address", "preferred_date", "service", "notes", "submitted_at", "status"];
    const csvCell = (value) => { let valueText = String(value ?? ""); if (/^[\t\r ]*[=+\-@]/.test(valueText)) valueText = `'${valueText}`; return `"${valueText.replaceAll('"', '""')}"`; };
    const csv = [columns, ...bookings.map((b) => columns.map((key) => b[key]))].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = `stevepics-bookings-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  });
  initialize();
})();
