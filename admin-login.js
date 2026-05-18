const form = document.querySelector("[data-login-form]");
const message = document.querySelector("[data-login-message]");

if (location.search) {
  history.replaceState({}, document.title, "/admin/login");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "Authenticating...";
  const data = Object.fromEntries(new FormData(form));
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (response.ok) {
    message.textContent = "Access granted. Opening dashboard...";
    history.replaceState({}, document.title, "/admin/login");
    location.replace("/admin/dashboard");
  } else {
    message.textContent = "Invalid credentials.";
  }
});
