const { app } = require("@azure/functions");
const { CosmosClient } = require("@azure/cosmos");
const { v4: uuidv4 } = require("uuid");

const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY;
const databaseId = process.env.COSMOS_DATABASE || "VacationPlannerDb";
const containerId = process.env.COSMOS_CONTAINER || "plannerItems";

function getContainer() {
  if (!endpoint || !key) {
    throw new Error("Missing COSMOS_ENDPOINT or COSMOS_KEY app setting.");
  }

  const client = new CosmosClient({ endpoint, key });
  return client.database(databaseId).container(containerId);
}

app.http("planner", {
  methods: ["GET", "POST", "PUT", "DELETE"],
  authLevel: "anonymous",
  route: "planner",
  handler: async (request, context) => {
    try {
      const container = getContainer();

      if (request.method === "GET") {
        const tripId = request.query.get("tripId") || "egypt-2026";

        const querySpec = {
          query: "SELECT * FROM c WHERE c.tripId = @tripId ORDER BY c.createdAt DESC",
          parameters: [{ name: "@tripId", value: tripId }]
        };

        const { resources } = await container.items.query(querySpec).fetchAll();

        return {
          status: 200,
          jsonBody: { items: resources }
        };
      }

      if (request.method === "POST") {
        const body = await request.json();

        const item = {
          id: uuidv4(),
          tripId: body.tripId || "egypt-2026",
          kind: body.kind,
          type: body.type || null,
          title: body.title || null,
          item: body.item || null,
          category: body.category || null,
          startDate: body.startDate || null,
          endDate: body.endDate || null,
          assignedTo: body.assignedTo || null,
          location: body.location || null,
          budget: body.budget || null,
          responsiblePerson: body.responsiblePerson || null,
          status: body.status || "planned",
          notes: body.notes || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        await container.items.create(item);

        return {
          status: 201,
          jsonBody: item
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