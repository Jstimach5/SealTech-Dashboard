# Browser rules — Claude in Chrome (Chrome MCP) on the workstation

Claude in Chrome drives Jack's real Chrome with Jack's real sign-ins. That makes it useful for
reading things only visible in a signed-in browser, and dangerous because every click is a live
click in Jobber, CompanyCam, and Microsoft 365. CLAUDE.md "Ask first" rules apply to every click.

## Allowed without asking (read-only)
- **Jobber GraphiQL → Documentation pane** (SESSION_01 step 3): browse the schema explorer and copy
  type/field names into `docs/JOBBER_FIELDS.md`.
- **GraphiQL `query` operations** that read ≤ 5 records to confirm a field exists in a live
  response. Record the query text, not the response, in `docs/JOBBER_FIELDS.md`.
- Reading Jobber/CompanyCam developer documentation pages.
- Screenshots for `annotated-sop-guide` work, of screens with no customer names/addresses visible,
  or cropped/blurred before saving.

## Ask Jack first — every time
- Any GraphiQL operation that starts with `mutation`, or any query whose text you didn't write.
- Any click on Save, Update, Create, Delete, Authorize, Allow, Connect, Generate, or Send, anywhere.
- Changing app scopes in the Jobber Developer Center (Jack clicks; Claude can point to the button).
- Anything in entra.microsoft.com beyond reading the App registrations page (SESSION_01 step 7).

## Never
- Read, copy, or screenshot tokens, client secrets, or the `.env`. If a token is on screen, stop
  and tell Jack to clear it. Tokens go into `.env` by Jack in Notepad.
- Bulk pulls through the browser. Data sync goes through the API connectors only.
- Use the browser to work around a blocked API call or permission prompt.

## Why not the other tools in that video
- Perplexity MCP: paid API key; WebSearch already covers it.
- Firecrawl MCP: scrapes public websites via a paid cloud API. Jobber/CompanyCam data comes from
  their APIs; customer data must not go to a scraping service.
- Playwright MCP: replaced by `tools/ui_snap.py` (Python Playwright, local only, runs as a test).
- HyperFrames: HTML-to-video. Out of scope for the audit.
