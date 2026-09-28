import { callService, defineTool, listServices } from "@opencomputer/agent";
import type { DataValue } from "@opencomputer/agent";

const connectedProviders = ["github", "notion", "searchconsole"] as const;
type ConnectedProvider = (typeof connectedProviders)[number];

async function json(response: Response): Promise<Record<string, DataValue>> {
  const text = await response.text();
  let payload: DataValue;
  try {
    payload = JSON.parse(text) as DataValue;
  } catch {
    payload = text.slice(0, 2_000);
  }
  return response.ok
    ? { ok: true, status: response.status, data: payload }
    : { ok: false, status: response.status, error: payload };
}

function unavailable(provider: ConnectedProvider, error: unknown) {
  return {
    ok: false,
    provider,
    unavailable: true,
    error: error instanceof Error ? error.message : String(error),
  };
}

async function call(
  provider: ConnectedProvider,
  request: {
    method: "GET" | "POST";
    path: string;
    body?: Record<string, DataValue>;
    signal?: AbortSignal;
  },
): Promise<DataValue> {
  try {
    return await json(await callService({
      service: provider,
      method: request.method,
      path: request.path,
      ...(request.body === undefined
        ? {}
        : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request.body),
        }),
      signal: request.signal,
    }));
  } catch (error) {
    return unavailable(provider, error);
  }
}

function segment(value: unknown, name: string): string {
  const result = String(value ?? "").trim();
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(result)) {
    throw new Error(`${name} must be a GitHub owner or repository name`);
  }
  return result;
}

function notionId(value: unknown): string {
  const result = String(value ?? "").trim();
  if (!/^[0-9A-Fa-f-]{32,36}$/.test(result)) {
    throw new Error("id must be a Notion page, block, or database ID");
  }
  return result;
}

function objectInput(value: unknown, name: string): Record<string, DataValue> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be a JSON object`);
  }
  return value as Record<string, DataValue>;
}

function isoDate(value: unknown, name: string): string {
  const result = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) {
    throw new Error(`${name} must be YYYY-MM-DD`);
  }
  return result;
}

export const connectedAccounts = defineTool({
  name: "connected_accounts",
  description:
    "List which optional GitHub, Notion, and Google Search Console accounts are connected to this deployment. Call before relying on any of them.",
  input: { type: "object", properties: {}, additionalProperties: false },
  async run({ signal }): Promise<DataValue> {
    try {
      const services = await listServices({ signal });
      return {
        ok: true,
        connected: services
          .filter((service) =>
            connectedProviders.includes(service.provider as ConnectedProvider)
          )
          .map((service) => ({
            provider: service.provider,
            label: service.label,
            ...(service.displayName ? { displayName: service.displayName } : {}),
          })),
      };
    } catch (error) {
      return {
        ok: false,
        connected: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

export const githubRecentWork = defineTool({
  name: "github_recent_work",
  description:
    "Read recent pull requests or commits from one GitHub repository through the connected GitHub account. Read-only.",
  input: {
    type: "object",
    properties: {
      owner: { type: "string", minLength: 1, maxLength: 100 },
      repo: { type: "string", minLength: 1, maxLength: 100 },
      kind: { type: "string", enum: ["pulls", "commits"] },
      per_page: { type: "integer", minimum: 1, maximum: 50 },
    },
    required: ["owner", "repo", "kind"],
    additionalProperties: false,
  },
  async run({ input, signal }): Promise<DataValue> {
    const kind = input.kind === "commits" ? "commits" : "pulls";
    const query = new URLSearchParams({
      per_page: String(Math.min(Math.max(Number(input.per_page ?? 20), 1), 50)),
    });
    if (kind === "pulls") {
      query.set("state", "all");
      query.set("sort", "updated");
      query.set("direction", "desc");
    }
    const path = `/repos/${encodeURIComponent(segment(input.owner, "owner"))}/${
      encodeURIComponent(segment(input.repo, "repo"))
    }/${kind}?${query}`;
    return call("github", { method: "GET", path, signal });
  },
});

export const notionSearch = defineTool({
  name: "notion_search",
  description:
    "Search pages and databases shared with the connected Notion integration. An empty query lists recently edited shared content. Read-only.",
  input: {
    type: "object",
    properties: {
      query: { type: "string", maxLength: 200 },
      page_size: { type: "integer", minimum: 1, maximum: 50 },
    },
    additionalProperties: false,
  },
  async run({ input, signal }): Promise<DataValue> {
    return call("notion", {
      method: "POST",
      path: "/v1/search",
      body: {
        query: String(input.query ?? ""),
        page_size: Math.min(Math.max(Number(input.page_size ?? 20), 1), 50),
      },
      signal,
    });
  },
});

export const notionRead = defineTool({
  name: "notion_read",
  description:
    "Read one Notion page's properties, a block's children (page content), or query a database, by ID. Read-only.",
  input: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["page", "blocks", "database_query"] },
      id: { type: "string", minLength: 32, maxLength: 36 },
      query: { type: "object", additionalProperties: true },
    },
    required: ["kind", "id"],
    additionalProperties: false,
  },
  async run({ input, signal }): Promise<DataValue> {
    const id = notionId(input.id);
    if (input.kind === "page") {
      return call("notion", { method: "GET", path: `/v1/pages/${id}`, signal });
    }
    if (input.kind === "blocks") {
      return call("notion", {
        method: "GET",
        path: `/v1/blocks/${id}/children?page_size=100`,
        signal,
      });
    }
    return call("notion", {
      method: "POST",
      path: `/v1/databases/${id}/query`,
      body: objectInput(input.query, "query"),
      signal,
    });
  },
});

export const notionCreateDraft = defineTool({
  name: "notion_create_draft",
  description:
    "Create an explicitly approved Notion page draft under a shared parent page. This is the only connected-account write in the demo and must never publish externally.",
  input: {
    type: "object",
    properties: {
      parent_page_id: { type: "string", minLength: 32, maxLength: 36 },
      title: { type: "string", minLength: 1, maxLength: 200 },
      paragraphs: {
        type: "array",
        items: { type: "string", minLength: 1, maxLength: 2_000 },
        minItems: 1,
        maxItems: 90,
      },
      confirmation: {
        type: "string",
        const: "CREATE APPROVED NOTION DRAFT",
        description:
          "Exact confirmation required after the user approves the specific draft.",
      },
    },
    required: ["parent_page_id", "title", "paragraphs", "confirmation"],
    additionalProperties: false,
  },
  async run({ input, signal }): Promise<DataValue> {
    if (input.confirmation !== "CREATE APPROVED NOTION DRAFT") {
      throw new Error("The exact Notion-draft confirmation is required");
    }
    const paragraphs = Array.isArray(input.paragraphs)
      ? input.paragraphs.map(String)
      : [];
    return call("notion", {
      method: "POST",
      path: "/v1/pages",
      body: {
        parent: { page_id: notionId(input.parent_page_id) },
        properties: {
          title: { title: [{ text: { content: String(input.title) } }] },
        },
        children: paragraphs.map((content) => ({
          object: "block",
          type: "paragraph",
          paragraph: { rich_text: [{ type: "text", text: { content } }] },
        })),
      },
      signal,
    });
  },
});

export const searchConsoleSites = defineTool({
  name: "search_console_sites",
  description:
    "List Google Search Console properties the connected account can read.",
  input: { type: "object", properties: {}, additionalProperties: false },
  async run({ signal }): Promise<DataValue> {
    return call("searchconsole", {
      method: "GET",
      path: "/webmasters/v3/sites",
      signal,
    });
  },
});

export const searchConsoleQuery = defineTool({
  name: "search_console_query",
  description:
    "Read Search Console search analytics (queries/pages with clicks, impressions, CTR, position) for one property. Read-only first-party data.",
  input: {
    type: "object",
    properties: {
      site_url: { type: "string", minLength: 1, maxLength: 300 },
      start_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      end_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      dimensions: {
        type: "array",
        items: { type: "string", enum: ["query", "page", "country", "device", "date"] },
        maxItems: 3,
      },
      row_limit: { type: "integer", minimum: 1, maximum: 250 },
    },
    required: ["site_url", "start_date", "end_date"],
    additionalProperties: false,
  },
  async run({ input, signal }): Promise<DataValue> {
    const site = encodeURIComponent(String(input.site_url));
    return call("searchconsole", {
      method: "POST",
      path: `/webmasters/v3/sites/${site}/searchAnalytics/query`,
      body: {
        startDate: isoDate(input.start_date, "start_date"),
        endDate: isoDate(input.end_date, "end_date"),
        dimensions: Array.isArray(input.dimensions)
          ? input.dimensions.map(String)
          : ["query"],
        rowLimit: Math.min(Math.max(Number(input.row_limit ?? 50), 1), 250),
      },
      signal,
    });
  },
});
