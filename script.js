(() => {
  "use strict";

  const BOOKINGS_KEY = "stevepics.bookings";
  const BOOKING_DRAFT_KEY = "stevepics.bookingDraft";
  const CMS_SESSION_KEY = "stevepics.cmsSession";
  const BOOKING_STATUSES = ["new", "contacted", "confirmed", "completed", "cancelled"];

  const readBookings = () => {
    const stored = localStorage.getItem(BOOKINGS_KEY);
    if (stored === null) {
      return [];
    }
    const bookings = JSON.parse(stored);
    if (!Array.isArray(bookings)) {
      throw new Error("Saved booking data is not a list.");
    }
    return bookings;
  };

  document.querySelectorAll("#year").forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });

  document.querySelectorAll(".menu-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const links = button.parentElement?.querySelector(".nav-links");
      if (!links) {
        return;
      }
      const isOpen = links.classList.toggle("open");
      button.setAttribute("aria-expanded", String(isOpen));
    });
  });

  const bookingForm = document.querySelector("#booking-form");
  if (bookingForm instanceof HTMLFormElement) {
    const message = document.querySelector("#booking-message");
    const bookingFollowup = document.querySelector("#booking-followup");
    const saveDraft = () => {
      const draft = {};
      new FormData(bookingForm).forEach((value, name) => {
        draft[name] = String(value);
      });
      try {
        localStorage.setItem(BOOKING_DRAFT_KEY, JSON.stringify(draft));
      } catch (error) {
        console.error("Unable to save the booking form draft.", error);
        if (message) {
          message.textContent = "Your draft could not be saved in this browser. Please keep a copy of your details.";
          message.className = "form-message error";
        }
      }
    };

    try {
      const savedDraft = localStorage.getItem(BOOKING_DRAFT_KEY);
      if (savedDraft) {
        const draft = JSON.parse(savedDraft);
        if (draft && typeof draft === "object" && !Array.isArray(draft)) {
          Object.entries(draft).forEach(([name, value]) => {
            const field = bookingForm.elements.namedItem(name);
            if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
              field.value = String(value);
            }
          });
          if (message) {
            message.textContent = "Your saved draft has been restored.";
            message.className = "form-message info";
          }
        }
      }
    } catch (error) {
      console.error("Unable to restore the booking form draft.", error);
      if (message) {
        message.textContent = "Your saved draft could not be restored. Please check your browser storage settings.";
        message.className = "form-message error";
      }
    }

    const saveDraftAfterEdit = () => {
      if (bookingFollowup) bookingFollowup.hidden = true;
      saveDraft();
    };
    bookingForm.addEventListener("input", saveDraftAfterEdit);
    bookingForm.addEventListener("change", saveDraftAfterEdit);
    bookingForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!bookingForm.reportValidity()) return;
      if (bookingFollowup) bookingFollowup.hidden = true;

      const config = window.STEVEPICS_SUPABASE;
      const message = document.querySelector("#booking-message");
      const submitButton = bookingForm.querySelector('button[type="submit"]');
      const formData = new FormData(bookingForm);
      const booking = {
        name: String(formData.get("name") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        phone: String(formData.get("phone") || "").trim(),
        address: String(formData.get("address") || "").trim(),
        preferred_date: String(formData.get("preferredDate") || "") || null,
        service: String(formData.get("service") || "").trim(),
        notes: String(formData.get("notes") || "").trim(),
      };

      if (!config || !config.url || !config.anonKey ||
          config.url.includes("YOUR_PROJECT_ID") ||
          config.anonKey.includes("YOUR_SUPABASE_ANON_KEY")) {
        if (message) {
          message.textContent = "Online booking is temporarily unavailable. Please contact the studio by WhatsApp or email.";
          message.className = "form-message error";
        }
        return;
      }

      if (submitButton) submitButton.disabled = true;
      if (message) {
        message.textContent = "Sending your booking request…";
        message.className = "form-message info";
      }

      try {
        const response = await fetch(`${config.url.replace(/\/$/, "")}/rest/v1/booking_requests`, {
          method: "POST",
          headers: {
            apikey: config.anonKey,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify(booking),
        });

        if (!response.ok) {
          const details = await response.json().catch(() => ({}));
          console.error("Supabase booking submission failed:", response.status, details);
          throw new Error("The database did not accept the request.");
        }

        try { localStorage.removeItem(BOOKING_DRAFT_KEY); } catch (error) {
          console.warn("The saved booking draft could not be removed.", error);
        }
        bookingForm.reset();
        if (message) {
          message.textContent = "Thank you! Your booking request was sent to StevePics Studio.";
          message.className = "form-message success";
        }
        if (bookingFollowup) bookingFollowup.hidden = false;
      } catch (error) {
        console.error("Unable to send booking request to Supabase.", error);
        if (message) {
          message.textContent = "We could not send your request. Check your internet connection or contact the studio directly.";
          message.className = "form-message error";
        }
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  }

  const loginPanel = document.querySelector("#admin-login");
  const dashboard = document.querySelector("#admin-dashboard");
  const loginMessage = document.querySelector("#admin-login-message");

  if (!loginPanel || !dashboard) {
    return;
  }

  const bookingsBody = document.querySelector("#booking-table-body");
  const searchInput = document.querySelector("#booking-search");
  const statusFilter = document.querySelector("#booking-status-filter");
  const emptyState = document.querySelector("#booking-empty-state");
  const noResults = document.querySelector("#booking-no-results");
  const storageError = document.querySelector("#booking-storage-error");

  const showStorageError = (error) => {
    console.error("Unable to read or update saved bookings.", error);
    if (storageError) {
      storageError.textContent = "Booking data could not be loaded or saved. Check this browser’s storage settings and try again.";
      storageError.hidden = false;
    }
  };

  const setCellText = (element, text) => {
    element.textContent = text || "—";
  };

  const renderBookings = () => {
    if (!(bookingsBody instanceof HTMLTableSectionElement)) {
      return;
    }
    bookingsBody.replaceChildren();

    let bookings;
    try {
      bookings = readBookings();
    } catch (error) {
      showStorageError(error);
      return;
    }
    if (storageError) {
      storageError.hidden = true;
    }

    const query = searchInput instanceof HTMLInputElement ? searchInput.value.trim().toLowerCase() : "";
    const selectedStatus = statusFilter instanceof HTMLSelectElement ? statusFilter.value : "all";
    const filtered = bookings.filter((booking) => {
      const searchable = [booking.name, booking.email, booking.phone, booking.service, booking.address, booking.notes]
        .join(" ")
        .toLowerCase();
      return (selectedStatus === "all" || booking.status === selectedStatus) && searchable.includes(query);
    });

    const totalElement = document.querySelector("#stat-total");
    const newElement = document.querySelector("#stat-new");
    const confirmedElement = document.querySelector("#stat-confirmed");
    const countLabel = document.querySelector("#booking-count-label");
    if (totalElement) totalElement.textContent = String(bookings.length);
    if (newElement) newElement.textContent = String(bookings.filter((booking) => booking.status === "new").length);
    if (confirmedElement) confirmedElement.textContent = String(bookings.filter((booking) => booking.status === "confirmed").length);
    if (countLabel) countLabel.textContent = `${filtered.length} of ${bookings.length} request${bookings.length === 1 ? "" : "s"} shown`;

    if (emptyState) emptyState.hidden = bookings.length !== 0;
    if (noResults) noResults.hidden = bookings.length === 0 || filtered.length !== 0;

    filtered.forEach((booking) => {
      const row = document.createElement("tr");
      const clientCell = document.createElement("td");
      const clientName = document.createElement("strong");
      clientName.textContent = booking.name || "Unnamed client";
      const clientContact = document.createElement("span");
      clientContact.className = "admin-cell-secondary";
      clientContact.textContent = [booking.email, booking.phone].filter(Boolean).join(" · ") || "No contact details";
      clientCell.append(clientName, clientContact);

      const serviceCell = document.createElement("td");
      const serviceName = document.createElement("strong");
      serviceName.textContent = booking.service || "Service not specified";
      const serviceDate = document.createElement("span");
      serviceDate.className = "admin-cell-secondary";
      serviceDate.textContent = booking.preferredDate ? formatDate(booking.preferredDate) : "Date not specified";
      serviceCell.append(serviceName, serviceDate);

      const detailsCell = document.createElement("td");
      detailsCell.className = "admin-details-cell";
      setCellText(detailsCell, [booking.address, booking.notes].filter(Boolean).join(" — "));

      const receivedCell = document.createElement("td");
      receivedCell.textContent = formatDateTime(booking.submittedAt);

      const statusCell = document.createElement("td");
      const statusSelect = document.createElement("select");
      statusSelect.className = "admin-status-select";
      statusSelect.setAttribute("aria-label", `Status for ${booking.name || "booking"}`);
      BOOKING_STATUSES.forEach((status) => {
        const option = document.createElement("option");
        option.value = status;
        option.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        statusSelect.append(option);
      });
      statusSelect.value = BOOKING_STATUSES.includes(booking.status) ? booking.status : "new";
      statusSelect.addEventListener("change", () => updateBooking(booking.id, { status: statusSelect.value }));
      statusCell.append(statusSelect);

      const actionsCell = document.createElement("td");
      const deleteButton = document.createElement("button");
      deleteButton.className = "admin-delete-button";
      deleteButton.type = "button";
      deleteButton.textContent = "Delete";
      deleteButton.setAttribute("aria-label", `Delete booking from ${booking.name || "unnamed client"}`);
      deleteButton.addEventListener("click", () => {
        if (window.confirm(`Delete the booking request from ${booking.name || "this client"}?`)) {
          deleteBooking(booking.id);
        }
      });
      actionsCell.append(deleteButton);
      row.append(clientCell, serviceCell, detailsCell, receivedCell, statusCell, actionsCell);
      bookingsBody.append(row);
    });
  };

  function formatDate(value) {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
  }

  function formatDateTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Unknown" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function updateBooking(id, changes) {
    try {
      const bookings = readBookings().map((booking) => booking.id === id ? { ...booking, ...changes } : booking);
      localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings));
      renderBookings();
    } catch (error) {
      showStorageError(error);
    }
  }

  function deleteBooking(id) {
    try {
      const bookings = readBookings().filter((booking) => booking.id !== id);
      localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings));
      renderBookings();
    } catch (error) {
      showStorageError(error);
    }
  }

  const showDashboard = () => {
    loginPanel.hidden = true;
    dashboard.hidden = false;
    renderBookings();
  };

  const checkAdminSession = async () => {
    const config = window.STEVEPICS_SUPABASE;
    const savedSession = sessionStorage.getItem(CMS_SESSION_KEY);
    if (!config || !savedSession || config.url.includes("YOUR_PROJECT_ID") || config.anonKey.includes("YOUR_SUPABASE_ANON_KEY")) {
      if (loginMessage) {
        loginMessage.textContent = "Sign in to the website editor with your authorized admin account to open booking management.";
      }
      return;
    }
    try {
      const session = JSON.parse(savedSession);
      if (session.expires_at <= Math.floor(Date.now() / 1000)) {
        throw new Error("Your admin session expired. Sign in again.");
      }
      const headers = { apikey: config.anonKey, Authorization: `Bearer ${session.access_token}` };
      const userResponse = await fetch(`${config.url.replace(/\/$/, "")}/auth/v1/user`, { headers });
      if (!userResponse.ok) throw new Error("Admin session is no longer valid.");
      const user = await userResponse.json();
      const adminsResponse = await fetch(
        `${config.url.replace(/\/$/, "")}/rest/v1/site_admins?select=user_id&user_id=eq.${encodeURIComponent(user.id)}`,
        { headers },
      );
      if (!adminsResponse.ok || !(await adminsResponse.json()).length) {
        throw new Error("This account doesn't have access to manage bookings.");
      }
      showDashboard();
    } catch (error) {
      console.error("Admin booking dashboard authorization failed.", error);
      sessionStorage.removeItem(CMS_SESSION_KEY);
      if (loginMessage) {
        loginMessage.textContent = `${error.message} Use the website editor sign-in to continue.`;
        loginMessage.className = "form-message error";
      }
    }
  };
  checkAdminSession();

  if (searchInput) searchInput.addEventListener("input", renderBookings);
  if (statusFilter) statusFilter.addEventListener("change", renderBookings);

  document.querySelector("#admin-logout")?.addEventListener("click", () => {
    const config = window.STEVEPICS_SUPABASE;
    const savedSession = sessionStorage.getItem(CMS_SESSION_KEY);
    if (config && savedSession) {
      try {
        const session = JSON.parse(savedSession);
        fetch(`${config.url.replace(/\/$/, "")}/auth/v1/logout`, {
          method: "POST",
          headers: { apikey: config.anonKey, Authorization: `Bearer ${session.access_token}` },
        }).catch((error) => console.error("Supabase sign-out failed.", error));
      } catch (error) {
        console.error("Could not end the Supabase admin session.", error);
      }
    }
    sessionStorage.removeItem(CMS_SESSION_KEY);
    dashboard.hidden = true;
    loginPanel.hidden = false;
  });

  document.querySelector("#export-bookings")?.addEventListener("click", () => {
    try {
      const bookings = readBookings();
      const columns = ["name", "email", "phone", "address", "preferredDate", "service", "notes", "submittedAt", "status"];
      const csvCell = (value) => {
        let text = String(value ?? "");
        if (/^[\t\r ]*[=+\-@]/.test(text)) {
          text = `'${text}`;
        }
        return `"${text.replaceAll('"', '""')}"`;
      };
      const csv = [columns, ...bookings.map((booking) => columns.map((column) => booking[column]))]
        .map((row) => row.map(csvCell).join(","))
        .join("\r\n");
      const file = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = `stevepics-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      showStorageError(error);
    }
  });
})();
