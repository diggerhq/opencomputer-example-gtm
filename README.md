# OpenComputer GTM Engineer

An agent-only GTM demo built with OpenComputer, Exa, and Apify. It runs in the
OpenComputer debug playground and through code-defined schedules; there is no
separate frontend.

[Deploy to OpenComputer →](https://app.opencomputer.dev/new?repository-url=https%3A%2F%2Fgithub.com%2Fdiggerhq%2Fopencomputer-example-gtm)

The agent covers social opportunity discovery, social-content ideation,
blog-topic research, public-evidence outreach prospecting, and strategy review
for one seeded campaign. Research is read-only. Its sole write path creates a
new, explicitly approved Notion draft; no publishing, messaging, CRM,
enrollment, or analytics-writing tools are connected.

## Prerequisites

- Node.js 22 or newer
- An OpenComputer account
- An Exa API key
- Optional: Notion, GitHub, or Google Search Console accounts, connected with
  one click on the deploy screen or the **Connections** page
- Optional: an Apify API token and reviewed Actor task

## Five-minute quickstart

```bash
npm install
npm run opencomputer -- login
cp opencomputer/.env.example opencomputer/.env.local
```

Add at least `EXA_API_KEY` to `opencomputer/.env.local`, then start the local
development sync:

```bash
npm run dev
```

The CLI links or creates an OpenComputer project, compiles the agent, syncs the
development secrets after confirmation, and prints the debug-playground URL.
Open that URL and send:

```text
Run the social opportunity discovery tick for agent-harness-demo.
```

The first run should call `exa_search`, return a ranked shortlist, and finish
with a **DRY RUN** statement. Continue in the same session with `approve 1` to
test drafting without publishing.

Development schedules are manual-only. Open the schedules panel and use **Run
now** to execute their committed payloads without waiting for cron.

### Secret handling

`.env.local` is only the local source used by the development sync. OpenComputer
stores uploaded values as managed, write-only secrets and injects each one only
into its declared destination:

| Secret | Required | Allowed origin |
| --- | --- | --- |
| `EXA_API_KEY` | Yes | `https://api.exa.ai` |
| `APIFY_API_TOKEN` | For an Apify task | `https://api.apify.com` |

Restart `npm run dev` after adding a new local secret so it can be synced. Never
commit `opencomputer/.env.local`.

## Connect live GTM data

GitHub, Notion, and Google Search Console are managed OpenComputer connections.
Each has a **Connect** button on the template deploy screen and on the project's
**Connections** page; all three are optional. OAuth tokens stay on the
platform: the agent calls them through `callService` and never sees a
credential, and there is no Composio key to configure.

1. Connect the accounts you want to use.
2. For Notion, share a page such as **campaigns** with the integration. Only
   shared pages and their permitted children are visible.

### Read-only integration smoke test

In a new debug-playground session, send:

```text
Run a read-only integrations smoke test. List connected accounts, then test a
GitHub pull-request read, an empty-query Notion search, and Google Search
Console site listing. Report success and item counts only. Do not invoke writes
or Apify.
```

Expected behavior:

- `connected_accounts` lists each connected provider.
- Empty GitHub or Notion results count as successful reads, not failures.
- Search Console returns only properties accessible to the connected account.
- Unconnected providers are reported as unavailable, not as errors.
- No write tool appears in the turn.

The equivalent CLI flow is:

```bash
GTM_PROJECT_AGENT=opencomputer-gtm-test
npm run opencomputer -- session \
  "Run a read-only integrations smoke test. Test connected accounts, GitHub pull-request listing, an empty-query Notion search, and Search Console site listing. Do not invoke writes or Apify." \
  --agent "$GTM_PROJECT_AGENT" --keep --verbose
```

Use the project-agent name printed by `npm run dev`; it may differ from the
example above.

## Create the first campaign in Notion

Notion provides a useful human-readable source of truth across independent
agent sessions. Each session must still be instructed to read the campaign;
Notion is not implicit conversational memory.

In one user session, send this preparation turn:

```text
Prepare the first campaign document for the Agent harnesses campaign. Search
Notion with an empty query for accessible parent pages, then show the chosen
parent page and the exact proposed page title and paragraphs. Include
objective, audience, topics, channels, cadence, workflow, approval boundary,
success metrics, and a first-week checklist. Do not create or modify anything
yet.
```

Review the complete draft. If it is correct, send this exact phrase as a
separate user-authored turn in the **same session**:

```text
create approved Notion draft
```

Only that approval turn exposes `notion_create_draft`. The tool is pinned to
creating a new child page, requires an exact internal confirmation, and cannot
update an existing page. Verify the returned page URL by asking the agent to
read it in the following turn.

Once created, a fresh session can recover the shared context with:

```text
Read the Agent Harnesses — Campaign Playbook from Notion and summarize the
objective, approval boundary, and next unchecked actions. Read only.
```

Scheduled and channel inputs never receive the Notion write tool. In this demo,
scheduled results remain in their OpenComputer sessions; saving every run to
Notion automatically would require a separately designed, narrowly scoped
schedule-write tool.

## Optional integrations

### Use connected accounts in a workflow payload

Name the connected providers in a manual or scheduled payload:

```json
{
  "workflow": "create_social_content",
  "campaign_id": "agent-harness-demo",
  "providers": ["exa", "github", "notion"],
  "dry_run": true
}
```

The agent checks connected accounts and uses only read tools for Notion,
GitHub, and Search Console; the platform also restricts each connection to read
routes. Unconnected or expired accounts are reported without preventing Exa
from running.

`dry_run: true` does not disable research or connected-account reads. It means
the workflow may produce shortlists and drafts but must not publish, message,
enroll, or otherwise act on them.

The committed schedules deliberately contain `providers: ["exa"]`, so cloning
and deploying the example does not automatically access private accounts. To
enable connected reads for a schedule, edit that schedule's payload to include
the provider names, test it with **Run now**, and commit
the reviewed configuration. A schedule still cannot receive the Notion write
tool.

### Apify social harvesting

Create and review a task in Apify first, then set:

```text
APIFY_API_TOKEN
```

Opt a run into that specific task through trusted payload configuration:

```json
{
  "workflow": "discover_social_opportunities",
  "campaign_id": "agent-harness-demo",
  "providers": ["exa", "apify"],
  "apify_task_id": "username~reviewed-social-task",
  "apify_input": {
    "queries": ["AI agent harnesses"]
  },
  "dry_run": true
}
```

The agent cannot choose an Actor task. Each run is capped at 100 paid items and
$1, with conservative defaults of 40 items and $0.25. Pending runs are checked
by ID rather than started again.

## Schedules

The canonical definitions live beside the agent under `schedules/`:

| Schedule | Cadence | Workflow |
| --- | --- | --- |
| `hourly-social` | Hourly | Social opportunity discovery |
| `social-content` | Every 3 hours | Social-content research |
| `weekly-blog` | Mondays at 09:00 | Blog-topic research |
| `six-hour-outreach` | Every 6 hours at :30 | Outreach research |
| `three-day-strategy` | At 10:00 on every third calendar day | Strategy review |

All times use `America/Los_Angeles`, all schedules skip overlapping runs, and
automatic recurrence is enabled only in Production. Each firing starts a fresh
durable session with `source: "schedule"` and the committed structured payload.

The strategy schedule intentionally supplies an empty metrics object. Until a
metrics integration exists, the agent returns a missing-data checklist instead
of inventing results.

## Build and deploy

```bash
npm run build
npm run opencomputer -- secrets set EXA_API_KEY --environment production
npm run opencomputer -- secrets set APIFY_API_TOKEN --environment production
npm run deploy
```

Set only the optional production secrets you actually use. Each command prompts
for the value; do not put secrets on the command line. Before deploying, test
every enabled schedule with **Run now** in Development.

The deployment syncs the agent and all schedule definitions. Production begins
recurring runs immediately according to each next cron occurrence.

## Troubleshooting

- **No connected accounts:** connect the provider on the project's
  **Connections** page, then begin a new turn.
- **Notion returns zero pages:** explicitly share the intended parent page with
  the Notion integration, then retry an empty-query search.
- **GitHub returns 403 or 404:** the connected GitHub account cannot read that
  repository.
- **A provider returns zero items:** check `ok` and `error`; an empty
  result is different from an authentication or execution failure.
- **A new secret is unavailable:** restart `npm run dev`, approve its scoped
  upload, and begin a new turn.
- **Apify is not running:** a reviewed `apify_task_id` is mandatory; the agent
  will not invent or select one.

## Project structure

```text
opencomputer/
  project.ts
  agents/gtm-engineer/
    agent.ts
    tools/exa.ts
    tools/connected.ts
    tools/apify.ts
    schedules/
      hourly-social.ts
      social-content.ts
      weekly-blog.ts
      six-hour-outreach.ts
      three-day-strategy.ts
    skills/
      exa-search/SKILL.md
      gtm-opportunity-discovery/SKILL.md
      gtm-content/SKILL.md
      gtm-outreach/SKILL.md
      gtm-strategy/SKILL.md
      gtm-integrations/SKILL.md
```

## Persistence model and current limits

- Notion can hold campaigns and approved drafts across sessions, but reads are
  explicit and scheduled Notion writes are intentionally disabled
- No structured event store, embeddings, or automatic cross-session
  deduplication yet
- No automated reminder for unresolved selections
- Apify requires a separately reviewed task; no task is bundled or selected by
  the agent
- One seeded campaign
- No social publishing, verified-email, CRM, inbox, or PostHog integration

These are deliberate boundaries for the first vertical slice.
