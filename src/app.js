const tripId = "egypt-2026";

const eventForm = document.getElementById("eventForm");
const purchaseForm = document.getElementById("purchaseForm");
const itemsEl = document.getElementById("items");
const purchasesEl = document.getElementById("purchases");
const reloadBtn = document.getElementById("reloadBtn");

reloadBtn.addEventListener("click", loadAll);

eventForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const payload = {
      tripId,
      kind: "event",
      type: document.getElementById("type").value,
      title: document.getElementById("title").value.trim(),
      startDate: document.getElementById("startDate").value,
      endDate: document.getElementById("endDate").value,
      assignedTo: document.getElementById("assignedTo").value.trim(),
      location: document.getElementById("location").value.trim(),
      notes: document.getElementById("notes").value.trim()
    };

    await apiPost("/api/planner", payload);

    eventForm.reset();
    document.getElementById("startDate").value = "2026-07-16";
    document.getElementById("endDate").value = "2026-07-16";

    await loadAll();
    alert("Plan saved successfully.");
  } catch (error) {
    console.error(error);
    alert("Save failed: " + error.message);
  }
});

purchaseForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const payload = {
      tripId,
      kind: "purchase",
      item: document.getElementById("purchaseItem").value.trim(),
      category: document.getElementById("purchaseCategory").value.trim(),
      budget: document.getElementById("purchaseBudget").value.trim(),
      responsiblePerson: document.getElementById("purchaseResponsible").value.trim(),
      status: "planned"
    };

    await apiPost("/api/planner", payload);
    purchaseForm.reset();
    await loadAll();
    alert("Purchase saved successfully.");
  } catch (error) {
    console.error(error);
    alert("Purchase save failed: " + error.message);
  }
});

async function loadAll() {
  try {
    const data = await apiGet(`/api/planner?tripId=${encodeURIComponent(tripId)}`);

    const events = data.items.filter(x => x.kind === "event");
    const purchases = data.items.filter(x => x.kind === "purchase");

    itemsEl.innerHTML = events.length
      ? events.map(renderEvent).join("")
      : `<div class="item-card"><p>No calendar items yet.</p></div>`;

    purchasesEl.innerHTML = purchases.length
      ? purchases.map(renderPurchase).join("")
      : `<div class="item-card"><p>No purchases yet.</p></div>`;
  } catch (error) {
    console.error(error);
    itemsEl.innerHTML = `<div class="item-card"><p>Load failed: ${escapeHtml(error.message)}</p></div>`;
  }
}

function renderEvent(item) {
  return `
    <article class="item-card">
      <span class="badge">${escapeHtml(item.type)}</span>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.startDate)} → ${escapeHtml(item.endDate)}</p>
      <p>${escapeHtml(item.location || "No location")}</p>
      <p>Assigned to: ${escapeHtml(item.assignedTo || "Unassigned")}</p>
      <p>${escapeHtml(item.notes || "")}</p>
    </article>
  `;
}

function renderPurchase(item) {
  return `
    <article class="item-card">
      <span class="badge">${escapeHtml(item.status || "planned")}</span>
      <h3>${escapeHtml(item.item)}</h3>
      <p>${escapeHtml(item.category || "General")}</p>
      <p>Budget: ${escapeHtml(item.budget || "-")}</p>
      <p>Responsible: ${escapeHtml(item.responsiblePerson || "Unassigned")}</p>
    </article>
  `;
}

async function apiGet(url) {
  const response = await fetch(url);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || `HTTP ${response.status}`);
  }

  return text ? JSON.parse(text) : {};
}

async function apiPost(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || `HTTP ${response.status}`);
  }

  return text ? JSON.parse(text) : {};
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

loadAll();
