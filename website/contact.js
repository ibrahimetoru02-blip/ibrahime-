(() => {
  "use strict";
  const form = document.querySelector("#contact-form");
  if (!form) return;
  const status = document.querySelector("#contact-status");
  const button = form.querySelector('button[type="submit"]');
  const config = window.STEVEPICS_SUPABASE;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (!config?.url || !config?.anonKey || config.url.includes("YOUR_PROJECT_ID") || config.anonKey.includes("YOUR_SUPABASE_ANON_KEY")) {
      status.textContent = "The contact form is temporarily unavailable. Please contact the studio by WhatsApp or email.";
      status.className = "form-message error";
      return;
    }
    const data = new FormData(form);
    const payload = {
      name: String(data.get("name") || "").trim(),
      email: String(data.get("email") || "").trim(),
      subject: String(data.get("subject") || "").trim(),
      message: String(data.get("message") || "").trim(),
    };
    if (!payload.name || !payload.email || !payload.message) {
      status.textContent = "Please fill in your name, email and message.";
      status.className = "form-message error";
      return;
    }
    button.disabled = true;
    status.textContent = "Sending your message…";
    status.className = "form-message info";
    try {
      const response = await fetch(`${config.url.replace(/\/$/, "")}/rest/v1/contact_messages`, {
        method: "POST",
        headers: { apikey: config.anonKey, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const details = await response.json().catch(() => ({}));
        console.error("Contact message submission failed:", response.status, details);
        throw new Error("The message could not be sent.");
      }
      form.reset();
      status.textContent = "Thank you! Your message has been sent to StevePics Studio.";
      status.className = "form-message success";
    } catch (error) {
      console.error("Could not send contact message:", error);
      status.textContent = "Your message could not be sent. Please check your internet connection or contact us by WhatsApp or email.";
      status.className = "form-message error";
    } finally { button.disabled = false; }
  });
})();
