(() => {
  "use strict";

  const config = window.STEVEPICS_SUPABASE;
  const status = document.querySelector("#reset-status");
  const form = document.querySelector("#reset-password-form");
  const submitButton = form.querySelector('button[type="submit"]');
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = hash.get("access_token");
  const recoveryType = hash.get("type");
  const recoveryError = hash.get("error_description");

  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);

  const showStatus = (message, state = "info") => {
    status.textContent = message;
    status.className = `form-message ${state}`;
  };

  const configured = config?.url && config.anonKey &&
    !config.url.includes("YOUR_PROJECT_ID") &&
    !config.anonKey.includes("YOUR_SUPABASE_ANON_KEY");

  if (!configured) {
    showStatus("Password reset is unavailable. Please contact the studio.", "error");
    return;
  }
  if (recoveryError || recoveryType !== "recovery" || !accessToken) {
    showStatus("This reset link is invalid or has expired. Request a new link from the admin sign-in page.", "error");
    return;
  }

  const verifyAdminRecoveryLink = async () => {
    const headers = {
      apikey: config.anonKey,
      Authorization: `Bearer ${accessToken}`,
    };
    const userResponse = await fetch(`${config.url.replace(/\/$/, "")}/auth/v1/user`, { headers });
    if (!userResponse.ok) return false;
    const user = await userResponse.json();
    const adminResponse = await fetch(
      `${config.url.replace(/\/$/, "")}/rest/v1/site_admins?select=user_id&user_id=eq.${encodeURIComponent(user.id)}`,
      { headers },
    );
    if (!adminResponse.ok) return false;
    const admins = await adminResponse.json();
    return admins.length > 0;
  };

  verifyAdminRecoveryLink()
    .then((isAdmin) => {
      if (!isAdmin) {
        showStatus("This reset link is invalid or expired, or the account doesn't have admin access. Request a new link from the admin sign-in page.", "error");
        return;
      }
      form.hidden = false;
      showStatus("Choose a strong password for your admin account.");
    })
    .catch((error) => {
      console.error("Could not verify the admin password reset link.", error);
      showStatus("We couldn't verify this reset link. Request a new one from the admin sign-in page.", "error");
    });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const password = form.elements.namedItem("password").value;
    const confirmation = form.elements.namedItem("confirm-password").value;
    if (password !== confirmation) {
      showStatus("The passwords don't match. Please try again.", "error");
      return;
    }

    submitButton.disabled = true;
    showStatus("Updating your password…");
    try {
      const response = await fetch(`${config.url.replace(/\/$/, "")}/auth/v1/user`, {
        method: "PUT",
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        console.error("Supabase rejected the password update.", response.status);
        throw new Error("password-update-failed");
      }

      try {
        await fetch(`${config.url.replace(/\/$/, "")}/auth/v1/logout`, {
          method: "POST",
          headers: {
            apikey: config.anonKey,
            Authorization: `Bearer ${accessToken}`,
          },
        });
      } catch (error) {
        console.warn("The recovery session could not be ended automatically.", error);
      }
      form.reset();
      form.hidden = true;
      showStatus("Your password has been updated. You can now sign in with it.", "success");
    } catch (error) {
      console.error("Could not update the admin password.", error);
      showStatus("We couldn't update your password. The reset link may have expired; request a new one.", "error");
      submitButton.disabled = false;
    }
  });
})();
