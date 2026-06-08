const { app } = require("@azure/functions");
const { TableClient, AzureNamedKeyCredential } = require("@azure/data-tables");

const accountName = process.env.STORAGE_ACCOUNT_NAME;
const accountKey = process.env.STORAGE_ACCOUNT_KEY;
const tableName = process.env.STORAGE_TABLE_NAME || "planneritems";

let cachedClient;

async function getTableClient() {
  if (!accountName || !accountKey) {
    throw new Error("Missing STORAGE_ACCOUNT_NAME or STORAGE_ACCOUNT_KEY in Static Web App environment variables.");
  }

  if (!cachedClient) {
    const credential = new AzureNamedKeyCredential(accountName, accountKey);
    const url = `https://${accountName}.table.core.windows.net`;
    cachedClient = new TableClient(url, tableName, credential);

    await cachedClient.createTable().catch((error) => {
      if (error.statusCode !== 409) throw error;
    });
  }

  return cachedClient;
}

function createId(prefix = "item") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function safe(value) {
  return value === undefined || value === null ? "" : String(value);
}

function numberSafe(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function escapeOData(value) {
  return String(value || "").replace(/'/g, "''");
}

function entityToJson(entity) {
  return {
    id: entity.rowKey,
    tripId: entity.partitionKey,
    kind: entity.kind || "",
    type: entity.type || "",
    title: entity.title || "",
    item: entity.item || "",
    category: entity.category || "",
    qty: numberSafe(entity.qty, 0),
    quantity: numberSafe(entity.quantity, 0),
    date: entity.date || "",
    time: entity.time || "",
    startDate: entity.startDate || "",
    endDate: entity.endDate || "",
    from: entity.from || "",
    to: entity.to || "",
    assignedTo: entity.assignedTo || "",
    assignedToPurchaseActivityId: entity.assignedToPurchaseActivityId || "",
    parentTripId: entity.parentTripId || "",
    location: entity.location || "",
    budget: entity.budget || "",
    responsiblePerson: entity.responsiblePerson || "",
    status: entity.status || "",
    notes: entity.notes || "",
    createdAt: entity.createdAt || "",
    updatedAt: entity.updatedAt || ""
  };
}

function bodyToEntity(body, existingCreatedAt) {
  const now = new Date().toISOString();
  const tripId = safe(body.tripId || "egypt-2026");
  const id = safe(body.id || createId(body.kind || "item"));

  const entity = {
    partitionKey: tripId,
    rowKey: id,
    kind: safe(body.kind),
    type: safe(body.type),
    title: safe(body.title),
    item: safe(body.item),
    category: safe(body.category),
    qty: numberSafe(body.qty, 0),
    quantity: numberSafe(body.quantity || body.qty, 0),
    date: safe(body.date),
    time: safe(body.time),
    startDate: safe(body.startDate),
    endDate: safe(body.endDate),
    from: safe(body.from),
    to: safe(body.to),
    assignedTo: safe(body.assignedTo),
    assignedToPurchaseActivityId: safe(body.assignedToPurchaseActivityId),
    parentTripId: safe(body.parentTripId),
    location: safe(body.location),
    budget: safe(body.budget),
    responsiblePerson: safe(body.responsiblePerson),
    status: safe(body.status || "planned"),
    notes: safe(body.notes),
    createdAt: existingCreatedAt || safe(body.createdAt) || now,
    updatedAt: now
  };

  return entity;
}

app.http("planner", {
  methods: ["GET", "POST", "PUT", "DELETE"],
  authLevel: "anonymous",
  route: "planner",
  handler: async (request, context) => {
    try {
      const table = await getTableClient();

      if (request.method === "GET") {
        const tripId = request.query.get("tripId") || "egypt-2026";
        const items = [];
        const entities = table.listEntities({
          queryOptions: {
            filter: `PartitionKey eq '${escapeOData(tripId)}'`
          }
        });

        for await (const entity of entities) {
          items.push(entityToJson(entity));
        }

        items.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
        return { status: 200, jsonBody: { items } };
      }

      if (request.method === "POST") {
        const body = await request.json();
        const entity = bodyToEntity(body);
        await table.createEntity(entity);
        return { status: 201, jsonBody: entityToJson(entity) };
      }

      if (request.method === "PUT") {
        const body = await request.json();
        if (!body.id) {
          return { status: 400, jsonBody: { error: "Missing id." } };
        }

        let existingCreatedAt = "";
        try {
          const existing = await table.getEntity(body.tripId || "egypt-2026", body.id);
          existingCreatedAt = existing.createdAt || "";
        } catch (error) {
          if (error.statusCode !== 404) throw error;
        }

        const entity = bodyToEntity(body, existingCreatedAt);
        await table.upsertEntity(entity, "Replace");
        return { status: 200, jsonBody: entityToJson(entity) };
      }

      if (request.method === "DELETE") {
        const tripId = request.query.get("tripId") || "egypt-2026";
        const id = request.query.get("id");

        if (!id) {
          return { status: 400, jsonBody: { error: "Missing id." } };
        }

        try {
          await table.deleteEntity(tripId, id);
        } catch (error) {
          if (error.statusCode !== 404) throw error;
        }

        return { status: 200, jsonBody: { deleted: true, id } };
      }

      return { status: 405, jsonBody: { error: "Method not allowed" } };
    } catch (error) {
      context.error(error);
      return {
        status: 500,
        jsonBody: {
          error: error.message || "Server error"
        }
      };
    }
  }
});
