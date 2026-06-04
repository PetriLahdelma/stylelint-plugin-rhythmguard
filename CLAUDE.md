# CLAUDE.md

Project-specific agent instructions can be added here. The shared cross-project memory contract is below.

<!-- LLM-WIKI:START -->
## Cross-project LLM-wiki

This repo participates in the shared LLM-wiki at `/Users/petrilahdelma/SAPDevelop/llm-wiki`.

Read before non-trivial work:
- Start with a compact project memory packet: `/Users/petrilahdelma/SAPDevelop/llm-wiki/wiki/tools/llm-wiki-context.mjs --project "stylelint-plugin-rhythmguard" --query "<task or topic>"`.
- For broader retrieval, search adjacent concepts with `/Users/petrilahdelma/SAPDevelop/llm-wiki/wiki/tools/qmd-query.sh "stylelint-plugin-rhythmguard <task or topic>"`.
- Open relevant pages under `/Users/petrilahdelma/SAPDevelop/llm-wiki/wiki` before deciding.

Write after durable discoveries:
- Capture decisions, reusable gotchas, cross-project patterns, source summaries, and project-state changes with `/Users/petrilahdelma/SAPDevelop/llm-wiki/wiki/tools/llm-wiki-capture.mjs --project "stylelint-plugin-rhythmguard" --kind decision --title "<title>" --summary "<what changed and why>"`.
- Do not capture secrets, raw logs, transient TODOs, or live coordination state.
- Do not edit compiled wiki pages from this repo. Capture first; the LLM-wiki ingest pass will file it into entities, concepts, patterns, or synthesis.
<!-- LLM-WIKI:END -->
