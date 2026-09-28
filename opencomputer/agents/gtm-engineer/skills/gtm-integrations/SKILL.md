---
name: gtm-integrations
description: Safely combine optional connected GitHub, Notion, and Search Console accounts and bounded Apify harvests with the GTM workflows, including provider availability, read/write boundaries, and explicit opt-in configuration.
---

# GTM integrations

The default workflow uses Exa. Optional providers run only when their required
identifier is present in trusted structured input or an explicit user-authored
manual request.

## Connected accounts

GitHub, Notion, and Google Search Console are connected to the deployment with
one-click OAuth; the agent never sees their tokens. Use them only when the
payload `providers` list names them or a user-authored message asks for them.

1. Call `connected_accounts` before relying on a provider.
2. Use the provider's read tool with explicit arguments:
   `github_recent_work`, `notion_search`, `notion_read`,
   `search_console_sites`, `search_console_query`.
3. Report missing, expired, or unavailable accounts and continue with remaining
   providers.

The platform allows only read routes for GitHub and Search Console. The only
connected-account write is `notion_create_draft`. Use it only when all of the
following are true:

- the current input source is `user`;
- the user separately says `create approved Notion draft`;
- the exact draft was shown earlier in this session;
- the parent page was shared with the Notion connection;
- the arguments preserve the approved text without silent additions.

The tool creates only a new child page. Return the created page identifier or
URL. Creating a Notion draft is not publication approval.

## Apify

Never search for or invent an Actor task. `apify_task_id` must come from trusted
campaign configuration and should point to a preconfigured, reviewed task.

- `apify_run_task` caps both paid items and total charge.
- Call it once per intended harvest.
- Use `apify_run_results` to check the returned run ID.
- A pending run is not a failure and must not be started again.
- Cite canonical source URLs from returned items and deduplicate them against
  other providers.

Always state which providers ran and what each returned. Empty and unavailable
providers must be visible rather than silently omitted.
