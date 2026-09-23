# State of Spacing 2026-09: publication checklist and submission texts

Strategy section 9.7. The artifact is the data edition, not the plugin. Nothing here is posted until the article is live and the four own-scale rows without an issue (below) have been handled.

## Before posting the article

- [ ] Own-scale rows in the article table that have no audit issue yet, because their trackers require a template or are disabled: **Mastodon** (blank issues off), **Grafana** (blank issues off), **n8n** (blank issues off), **Discourse** (issues disabled; Meta forum instead), **Tabler** (blank issues off). Section 9.1 says a row is published only after its repository has the audit. Either post those five by hand through their templates, or drop the rows from the article table and keep them in the edition page only.
- [ ] Publish `docs/DEVTO_STATE_OF_SPACING_2026-09.md` on Dev.to (`published: true`), with `canonical_url` left pointing at the edition page in the repository.
- [ ] Record the Dev.to URL here and in `embed-log.md`.

## Submission texts

**CSS Weekly** (submit form on css-weekly.com)

> State of Spacing, September 2026: 58 public design systems measured against their own spacing scale. 23 define one the tool could read; they step off it 2,052 times, and a median 42% of any repository's drift is three values. Reproducible on pinned commits, one command per row.
> URL: <dev.to link>

**Frontend Focus** (frontendfoc.us, "submit a link")

> We audited 58 open-source design systems for off-scale spacing on pinned commits. `10px` and `5px` are the values that drift, `padding` is where, and three repositories are at zero. Method, manifest and per-row audits are public.
> URL: <dev.to link>

**Smashing Newsletter** (editorial tips form)

> A dataset rather than a tool: how consistently 58 public design systems use their own spacing scale, with what the maintainers said when shown the numbers (Primer, mittwald, PatternFly, AdminLTE, SAP, VitePress). Every row reproduces from a commit hash.
> URL: <dev.to link>

**JavaScript Weekly** (javascriptweekly.com, submit)

> State of Spacing 2026-09: 8,729 stylesheets across 58 design systems, measured against the scale each project defines. One npx command reproduces any row.
> URL: <dev.to link>

## Podcast pitch (Syntax, ShopTalk Show, JS Party, The CSS Podcast)

> Subject: 58 design systems, one spacing scale each, and what drifted
>
> I audited 58 public design systems (Primer, Carbon, Bootstrap, Mastodon, GOV.UK, shadcn/ui and others) against their own spacing scales on pinned commits, then opened an issue on each with the numbers. About a dozen maintainers replied and several replies changed the method. Happy to talk through what drifted, why `10px` is the universal slip, and what maintainers said. The data is public and reproduces from a commit hash.

## CFPs (CSS Day, Smashing Conf, Into Design Systems, Beyond Tellerrand, Nordic.js)

Title: Nobody chose 13px. Abstract: the report above, the Mastodon before and after, the maintainer replies. The tool appears on one slide.
