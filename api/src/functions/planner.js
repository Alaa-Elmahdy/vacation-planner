const { app } = require("@azure/functions");
const { TableClient, AzureNamedKeyCredential } = require("@azure/data-tables");
const { v4: uuidv4 } = require("uuid");

const accountName = process.env.STORAGE_ACCOUNT_NAME;
const accountKey = process.env.STORAGE_ACCOUNT_KEY;
const tableName = process.env.STORAGE_TABLE_NAME || "planneritems";

function getTableClient() {
  if (!accountName || !accountKey) {
    throw new Error("Missing STORAGE_ACCOUNT_NAME or STORAGE_ACCOUNT_KEY app setting.");
  }

  const credential = new AzureNamedKeyCredential(accountName, accountKey);
  const url = `https://${accountName}.table.core.windows.net`;
  return new TableClient(url, tableName, credential);
}

app.http("planner", {
  methods: ["GET", "POST", "DELETE"],
  authLevel: "anonymous",
  route: "planner",
  handler: async (request, context) => {
    try {
      const table = getTableClient();

      if (request.method === "GET") {
        const tripId = request.query.get("tripId") || "egypt-2026";
        const items = [];

        const entities = table.listEntities({
          queryOptions: {
            filter: `PartitionKey eq '${tripId}'`
          }
        });

        for await (const entity of entities) {
          items.push({
            id: entity.rowKey,
            tripId: entity.partitionKey,
            kind: entity.kind,
            type: entity.type,
            title: entity.title,
            item: entity.item,
            category: entity.category,
            startDate: entity.startDate,
            endDate: entity.endDate,
            assignedTo: entity.assignedTo,
            location: entity.location,
            budget: entity.budget,
            responsiblePerson: entity.responsiblePerson,
            status: entity.status,
            notes: entity.notes,
            createdAt: entity.createdAt,
            updatedAt: entity.updatedAt
          });
        }

        items.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

        return {
          status: 200,
          jsonBody: { items }
        };
      }

      if (request.method === "POST") {
        const body = await request.json();
        const now = new Date().toISOString();
        const id = uuidv4();
        const tripId = body.tripId || "egypt-2026";

        const entity = {
          partitionKey: tripId,
          rowKey: id,
          kind: body.kind || "",
          type: body.type || "",
          title: body.title || "",
          item: body.item || "",
          category: body.category || "",
          startDate: body.startDate || "",
          endDate: body.endDate || "",
          assignedTo: body.assignedTo || "",
          location: body.location || "",
          budget: body.budget || "",
          responsiblePerson: body.responsiblePerson || "",
          status: body.status || "planned",
          notes: body.notes || "",
          createdAt: now,
          updatedAt: now
        };

        await table.createEntity(entity);

        return {
          status: 201,
          jsonBody: {
            id,
            tripId,
            ...body,
            createdAt: now,
            updatedAt: now
          }
        };
      }

      if (request.method === "DELETE") {
        const tripId = request.query.get("tripId") || "egypt-2026";
        const id = request.query.get("id");

        if (!id) {
          return {
            status: 400,
            jsonBody: { error: "Missing id." }
          };
        }

        await table.deleteEntity(tripId, id);

        return {
          status: 200,
          jsonBody: { deleted: true }
        };
      }

      return {
        status: 405,
        jsonBody: { error: "Method not allowed" }
      };
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
