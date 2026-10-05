const headings = {
  overview: "Overzicht",
  orders: "Bestellingen",
  bookings: "Boekingen",
  calls: "Gesprekken",
  catalog: "Aanbod & prijzen",
  settings: "Bedrijfsinstellingen",
};

let appState;
let serviceStatus = { integrations: { vapiConfigured: false, n8nConfigured: false, geminiKeyStoredLocally: false } };
let toastTimer;
let adminEmail = "";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function showToast(message, isError = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3400);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if ((response.status === 401 || response.status === 403) && !url.startsWith("/api/auth/")) {
      lockDashboard();
    }
    throw new Error(result.error || `Er ging iets mis (HTTP ${response.status}).`);
  }
  return result;
}

function showAuthScreen(message = "") {
  $("#app-shell").hidden = true;
  $("#auth-screen").hidden = false;
  if (message) {
    $("#login-message").textContent = message;
    $("#login-message").classList.add("auth-message-error");
  }
}

function lockDashboard(message = "Je beheerderssessie is verlopen. Log opnieuw in.") {
  appState = undefined;
  adminEmail = "";
  showAuthScreen(message);
}

async function loadAdminDashboard() {
  const [nextState, nextStatus] = await Promise.all([
    api("/api/state"),
    api("/api/health"),
  ]);
  appState = nextState;
  serviceStatus = nextStatus;
  render();
  $("#auth-screen").hidden = true;
  $("#app-shell").hidden = false;
  $("#logout-button").textContent = initialLetters(adminEmail || "AD");
}

function formatMoney(value) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(value) || 0);
}

function formatDate(value, withTime = true) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("nl-NL", withTime
    ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "long" }).format(date);
}

function initialLetters(name = "?") {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function statusClass(status) {
  if (status === "Afgerond") return "status-done";
  if (status === "In behandeling") return "status-progress";
  return "status-new";
}

function customerCell(name, phone) {
  return `<div class="customer-cell"><span class="customer-avatar">${escapeHtml(initialLetters(name))}</span><span><span class="customer-name">${escapeHtml(name || "Onbekend")}</span>${phone ? `<span class="customer-phone">${escapeHtml(phone)}</span>` : ""}</span></div>`;
}

function renderOverview() {
  const isToday = (value) => value && new Date(value).toDateString() === new Date().toDateString();
  const today = new Date().toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
  $("#current-date").textContent = today.replace(/^./, (letter) => letter.toUpperCase()).toUpperCase();
  $("#welcome-business-name").textContent = appState.business.name || "jouw zaak";
  $("#side-business-name").textContent = appState.business.name || "Jouw zaak";
  $("#assistant-business-title").textContent = `${appState.business.name || "Nederlandse"} telefoonassistent`;
  $("#metric-orders").textContent = appState.orders.filter((order) => isToday(order.createdAt)).length;
  $("#order-nav-count").textContent = appState.orders.length;
  $("#metric-bookings").textContent = appState.bookings.filter((booking) => isToday(booking.dateTime)).length;
  $("#metric-calls").textContent = appState.calls.filter((call) => isToday(call.endedAt)).length;
  $("#metric-revenue").textContent = formatMoney(appState.orders.reduce((sum, order) => sum + Number(order.total || 0), 0));
  const linked = appState.integration.assistantStatus === "Gekoppeld";
  $("#vapi-id-label").textContent = appState.integration.assistantId
    ? `Assistent-ID: ${appState.integration.assistantId}`
    : serviceStatus.integrations.geminiKeyStoredLocally
      ? "Gemini lokaal; nog instellen in Vapi"
      : "Voeg je Gemini-provider toe in Vapi";
  const assistantCreated = Boolean(appState.integration.assistantId);
  $("#assistant-status-badge").textContent = linked ? "Gekoppeld" : assistantCreated ? "Nummer koppelen" : "Niet gekoppeld";
  $("#assistant-status-badge").className = `status-pill ${linked ? "status-ready" : "status-pending"}`;
  $("#side-assistant-status").textContent = linked ? "Verbonden met Vapi" : assistantCreated ? "Koppel je telefoonnummer" : "Assistent niet gekoppeld";
  $("#step-settings").textContent = appState.business.name !== "Jouw zaak" ? "✓" : "○";
  $("#step-connect").textContent = linked ? "✓" : "○";

  const recentOrders = appState.orders.slice(0, 4);
  $("#recent-orders").innerHTML = recentOrders.map((order) => `<tr>
    <td>${customerCell(order.customerName, order.phone)}</td>
    <td>${escapeHtml(order.description || "Bestelling")}</td>
    <td><span class="type-tag">${escapeHtml(order.type || "Afhalen")}</span></td>
    <td class="amount-cell">${formatMoney(order.total)}</td>
    <td><span class="status-pill ${statusClass(order.status)}">${escapeHtml(order.status || "Nieuw")}</span></td>
  </tr>`).join("");
  $("#orders-empty").classList.toggle("visible", recentOrders.length === 0);

  const calls = appState.calls.slice(0, 3);
  $("#recent-calls").innerHTML = calls.map(renderCallItem).join("");
  $("#calls-empty").classList.toggle("visible", calls.length === 0);
}

function renderOrders() {
  const filter = $("#order-filter").value;
  const orders = appState.orders.filter((order) => filter === "Alle" || (order.status || "Nieuw") === filter);
  $("#orders-caption").textContent = `${appState.orders.length} ${appState.orders.length === 1 ? "bestelling" : "bestellingen"} geregistreerd.`;
  $("#orders-table").innerHTML = orders.map((order) => `<tr>
    <td>${customerCell(order.customerName, order.phone)}</td>
    <td>${escapeHtml(order.description || "Bestelling")}</td>
    <td><span class="type-tag">${escapeHtml(order.type || "Afhalen")}</span></td>
    <td>${escapeHtml(formatDate(order.requestedTime || order.createdAt))}</td>
    <td class="amount-cell">${formatMoney(order.total)}</td>
    <td><select class="filter-select order-status-select" data-id="${escapeHtml(order.id)}" aria-label="Status van bestelling">${["Nieuw", "In behandeling", "Afgerond"].map((status) => `<option ${status === (order.status || "Nieuw") ? "selected" : ""}>${status}</option>`).join("")}</select></td>
  </tr>`).join("");
  $("#orders-page-empty").classList.toggle("visible", orders.length === 0);
}

function renderBookings() {
  $("#bookings-table").innerHTML = appState.bookings.map((booking) => `<tr>
    <td>${customerCell(booking.customerName, "")}</td>
    <td>${escapeHtml(booking.service)}</td>
    <td>${escapeHtml(formatDate(booking.dateTime))}</td>
    <td>${escapeHtml(booking.partySize || "—")}</td>
    <td>${escapeHtml(booking.phone || "—")}</td>
    <td><span class="status-pill ${statusClass(booking.status)}">${escapeHtml(booking.status || "Nieuw")}</span></td>
  </tr>`).join("");
  $("#bookings-empty").classList.toggle("visible", appState.bookings.length === 0);
}

function renderCallItem(call) {
  return `<article class="call-item"><span class="call-avatar">◉</span><div class="call-copy"><strong>${escapeHtml(call.callerNumber || "Nummer onbekend")}</strong><p>${escapeHtml(call.summary || "Geen samenvatting beschikbaar.")}</p></div><span class="call-time">${escapeHtml(formatDate(call.endedAt))}</span></article>`;
}

function renderCalls() {
  $("#calls-list").innerHTML = appState.calls.map((call) => `<article class="calls-page-item">${renderCallItem(call).replace('<article class="call-item">', "").replace("</article>", "")}</article>`).join("");
  const empty = appState.calls.length === 0;
  $("#calls-page-empty").classList.toggle("visible", empty);
  const linked = appState.integration.assistantStatus === "Gekoppeld";
  $("#calls-connection-badge").textContent = linked ? "Vapi gekoppeld" : appState.integration.assistantId ? "Koppel telefoonnummer" : "Wacht op koppeling";
  $("#calls-connection-badge").className = `status-pill ${linked ? "status-ready" : "status-pending"}`;
}

function renderMenu() {
  $("#menu-table").innerHTML = appState.menu.map((item, index) => `<tr data-index="${index}">
    <td><input class="menu-input" data-field="name" value="${escapeHtml(item.name)}" aria-label="Productnaam"></td>
    <td><input class="menu-input" data-field="description" value="${escapeHtml(item.description || "")}" aria-label="Omschrijving"></td>
    <td><input class="menu-input price-input" data-field="price" type="number" min="0" step="0.01" value="${escapeHtml(item.price)}" aria-label="Prijs in euro"></td>
    <td><input class="availability-toggle" data-field="available" type="checkbox" ${item.available ? "checked" : ""} aria-label="Beschikbaar"></td>
    <td><button class="menu-remove" data-action="remove-menu-item" aria-label="Verwijder ${escapeHtml(item.name)}">×</button></td>
  </tr>`).join("");
  $("#menu-empty").classList.toggle("visible", appState.menu.length === 0);
}

function fillSettings() {
  const form = $("#settings-form");
  for (const field of ["name", "phone", "address", "openingHours", "deliveryArea", "preparationMinutes", "deliveryMinutes"]) {
    form.elements[field].value = appState.business[field] ?? "";
  }
  form.elements.pickupAvailable.checked = appState.business.pickupAvailable;
  form.elements.deliveryAvailable.checked = appState.business.deliveryAvailable;
  const linked = appState.integration.assistantStatus === "Gekoppeld";
  $("#vapi-status-label").textContent = linked ? "Gekoppeld" : appState.integration.assistantId ? "Koppel telefoonnummer" : "Nog niet gekoppeld";
  $("#vapi-status-label").className = `status-pill ${linked ? "status-ready" : "status-pending"}`;
  $("#n8n-status-label").textContent = serviceStatus.integrations.n8nConfigured
    ? "Sms-webhook ingesteld"
    : "Webhook en Twilio-afzender vereist";
}

function render() {
  renderOverview();
  renderOrders();
  renderBookings();
  renderCalls();
  renderMenu();
  fillSettings();
}

function navigate(page) {
  if (!headings[page]) return;
  $$(".page").forEach((section) => section.classList.toggle("page-active", section.id === `page-${page}`));
  $$(".nav-link").forEach((link) => link.classList.toggle("active", link.dataset.page === page));
  $("#page-heading").textContent = headings[page];
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openEntryModal(type) {
  const isOrder = type === "order";
  const modal = $("#entry-modal");
  $("#entry-form").reset();
  $("#order-fields").hidden = !isOrder;
  $("#booking-fields").hidden = isOrder;
  for (const section of [$("#order-fields"), $("#booking-fields")]) {
    for (const control of $$("input, select, textarea", section)) {
      control.disabled = section.hidden;
    }
  }
  $("#modal-eyebrow").textContent = isOrder ? "BESTELLINGEN" : "RESERVERINGEN";
  $("#modal-title").textContent = isOrder ? "Bestelling toevoegen" : "Boeking toevoegen";
  $("#modal-submit").dataset.type = type;
  modal.showModal();
}

async function saveState() {
  appState = await api("/api/state", {
    method: "PUT",
    body: JSON.stringify({ business: appState.business, menu: appState.menu }),
  });
  render();
}

function syncMenuInputs() {
  $$("#menu-table tr").forEach((row, index) => {
    const item = appState.menu[index];
    if (!item) return;
    for (const input of $$("[data-field]", row)) {
      if (input.dataset.field === "available") item.available = input.checked;
      else if (input.dataset.field === "price") item.price = input.value;
      else item[input.dataset.field] = input.value;
    }
  });
}

async function submitEntry(event) {
  const type = $("#modal-submit").dataset.type;
  const formData = new FormData(event.currentTarget);
  const fields = Object.fromEntries(formData.entries());
  const keys = type === "order"
    ? ["customerName", "phone", "type", "description", "requestedTime", "total", "address"]
    : ["customerName", "service", "partySize", "dateTime", "phone", "notes"];
  const payload = Object.fromEntries(keys.map((key) => [key, fields[key] || ""]));
  if (payload.total !== undefined) payload.total = Number(payload.total || 0);
  if (payload.partySize !== undefined) payload.partySize = Number(payload.partySize || 0);
  await api(type === "order" ? "/api/orders" : "/api/bookings", {
    method: "POST", body: JSON.stringify(payload),
  });
  const updated = await api("/api/state");
  appState = updated;
  render();
  $("#entry-modal").close();
  navigate(type === "order" ? "orders" : "bookings");
  showToast(type === "order" ? "Bestelling opgeslagen." : "Boeking opgeslagen.");
}

async function initialize() {
  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("#login-button");
    const email = $("#admin-email").value.trim().toLocaleLowerCase("en-US");
    const password = $("#admin-password").value;
    $("#login-message").textContent = "";
    $("#login-message").classList.remove("auth-message-error");
    button.disabled = true;
    button.textContent = "Beveiligde sessie starten…";
    try {
      const session = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      adminEmail = session.email;
      $("#admin-password").value = "";
      await loadAdminDashboard();
    } catch (error) {
      $("#login-message").textContent = error.message;
      $("#login-message").classList.add("auth-message-error");
    } finally {
      button.disabled = false;
      button.innerHTML = "Veilig inloggen <span>→</span>";
    }
  });

  $("#logout-button").addEventListener("click", async () => {
    try {
      await api("/api/auth/logout", { method: "POST", body: "{}" });
    } finally {
      appState = undefined;
      adminEmail = "";
      $("#login-form").reset();
      showAuthScreen();
      showToast("Je bent veilig uitgelogd.");
    }
  });

  try {
    serviceStatus = await api("/api/health");
    const auth = await api("/api/auth/me");
    if (auth.authenticated) {
      adminEmail = auth.email;
      await loadAdminDashboard();
    } else {
      showAuthScreen(auth.setupRequired ? "Beheerderslogin is nog niet geconfigureerd op de server." : "");
    }
  } catch (error) {
    showAuthScreen(error.message);
  }

  window.setInterval(async () => {
    if (!appState) return;
    try {
      const auth = await api("/api/auth/me");
      if (!auth.authenticated) lockDashboard();
    } catch {
      lockDashboard("De beheerderssessie kon niet worden bevestigd. Log opnieuw in.");
    }
  }, 60_000);

  document.addEventListener("click", async (event) => {
    const nav = event.target.closest("[data-page]");
    if (nav) {
      event.preventDefault();
      navigate(nav.dataset.page);
    }
    const remove = event.target.closest('[data-action="remove-menu-item"]');
    if (remove) {
      const row = remove.closest("tr");
      appState.menu.splice(Number(row.dataset.index), 1);
      renderMenu();
    }
  });

  $("#settings-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    for (const field of ["name", "phone", "address", "openingHours", "deliveryArea"]) {
      appState.business[field] = form.elements[field].value.trim();
    }
    for (const field of ["preparationMinutes", "deliveryMinutes"]) {
      appState.business[field] = Math.min(240, Math.max(1, Number(form.elements[field].value) || 25));
    }
    appState.business.pickupAvailable = form.elements.pickupAvailable.checked;
    appState.business.deliveryAvailable = form.elements.deliveryAvailable.checked;
    try {
      await saveState();
      $("#settings-save-message").textContent = "Instellingen opgeslagen.";
      showToast("Je bedrijfsgegevens zijn opgeslagen.");
      setTimeout(() => { $("#settings-save-message").textContent = ""; }, 3000);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  $("#save-menu-button").addEventListener("click", async () => {
    syncMenuInputs();
    if (appState.menu.some((item) => !item.name.trim() || !Number.isFinite(Number(item.price)) || Number(item.price) < 0)) {
      showToast("Vul voor elk product een naam en geldige prijs in.", true);
      return;
    }
    appState.menu = appState.menu.map((item) => ({ ...item, name: item.name.trim(), price: Number(item.price) }));
    try {
      await saveState();
      showToast("Je aanbod en prijzen zijn opgeslagen.");
    } catch (error) {
      showToast(error.message, true);
    }
  });

  $("#add-item-button").addEventListener("click", () => {
    syncMenuInputs();
    appState.menu.push({
      id: `item-${crypto.randomUUID()}`,
      name: "",
      description: "",
      price: 0,
      available: true,
    });
    renderMenu();
    const lastRow = $("#menu-table tr:last-child");
    $('input[data-field="name"]', lastRow)?.focus();
  });

  $("#new-order-button").addEventListener("click", () => openEntryModal("order"));
  $("#new-booking-button").addEventListener("click", () => openEntryModal("booking"));
  $("#entry-form").addEventListener("submit", async (event) => {
    if (!event.submitter || event.submitter.value !== "save") return;
    event.preventDefault();
    try {
      await submitEntry(event);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  $("#order-filter").addEventListener("change", renderOrders);
  $("#orders-table").addEventListener("change", async (event) => {
    if (!event.target.matches(".order-status-select")) return;
    const order = appState.orders.find((entry) => entry.id === event.target.dataset.id);
    if (!order) return;
    try {
      await api(`/api/orders/${encodeURIComponent(order.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: event.target.value }),
      });
      appState = await api("/api/state");
      render();
      showToast("Bestelstatus bijgewerkt.");
    } catch (error) {
      showToast(error.message, true);
    }
  });

  $("#deploy-assistant-button").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const feedback = $("#integration-feedback");
    button.disabled = true;
    button.textContent = "Even verbinden…";
    feedback.className = "integration-feedback";
    feedback.textContent = "";
    try {
      syncMenuInputs();
      await saveState();
      appState.integration = await api("/api/integrations/vapi/deploy", { method: "POST", body: "{}" });
      appState = await api("/api/state");
      render();
      if (appState.integration.assistantStatus === "Gekoppeld") {
        feedback.textContent = "Je Nederlandse assistent en telefoonnummer zijn met Vapi verbonden.";
        showToast("De Nederlandse assistent is aan je nummer gekoppeld.");
      } else {
        feedback.textContent = "Je assistent staat in Vapi. Koppel je telefoonnummer in het Vapi-dashboard, of stel VAPI_PHONE_NUMBER_ID in en stuur de assistent opnieuw.";
        showToast("De assistent is aangemaakt; koppel nog je telefoonnummer.");
      }
    } catch (error) {
      feedback.textContent = error.message;
      feedback.classList.add("error");
      showToast(error.message, true);
    } finally {
      button.disabled = false;
      button.innerHTML = "<span>✳</span> Assistent naar Vapi sturen <span>↗</span>";
    }
  });
}

document.addEventListener("DOMContentLoaded", initialize);
