# Submissions & Outreach — April 2026

Ready-to-send text for distribution channels. Each block is self-contained.

---

## Newsletters

### CSS Weekly — https://css-weekly.com/submit

**Submission form fields:**

- **Title:** Why Your Tailwind Project Leaks Spacing (And How to Fix It in 5 Minutes)
- **URL:** https://dev.to/petrilahdelma/why-your-tailwind-project-leaks-spacing-and-how-to-fix-it-in-5-minutes-lc2
- **Category:** Articles & Tools
- **Description (under 300 chars):**
  > Every Tailwind project starts clean. Six months later `git grep` finds 47 unique spacing values. Rhythmguard is a Stylelint plugin that enforces spacing scales and design tokens in both CSS and Tailwind class strings — including `p-[13px]` arbitrary values. Autofix, Tailwind v4 @theme support, a browser playground.

**Also worth mentioning:**
- Browser playground: https://petrilahdelma.github.io/stylelint-plugin-rhythmguard/
- Real-world audit on shadcn/ui: https://gist.github.com/PetriLahdelma/2ad44d6dc2022f48c67f839c6440745c

---

### Frontend Focus — https://frontendfoc.us/submit

Same details as CSS Weekly. They accept the same format.

---

### JavaScript Weekly — https://javascriptweekly.com/submit

Angle: the ESLint companion that catches `cn("p-[13px]")` and `twMerge("ml-[-0.15rem]")`.

- **Title:** An ESLint rule that enforces spacing scales inside clsx/cn/cva/twMerge calls
- **URL:** https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard
- **Description:**
  > Rhythmguard ships an ESLint companion that scans every string literal — including arguments to cn(), clsx(), cva(), and twMerge() — for off-scale Tailwind arbitrary spacing values like `p-[13px]`. Autofixes to the nearest scale step. Zero config needed.

---

### Tailwind Weekly — https://tailwindweekly.com/

Angle: Tailwind v4 `@theme` zero-config token extraction.

- **Title:** Enforce your Tailwind v4 @theme tokens automatically
- **URL:** https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard
- **Description:**
  > Define `@theme { --spacing-4: 16px; }` in your Tailwind v4 CSS, then Rhythmguard automatically catches raw `padding: 16px` and autofixes to `padding: var(--spacing-4)`. The `tailwind` config preset enables this with zero extra configuration.

---

### Bytes — https://bytes.dev/ (JavaScript focused)

Likely too general-purpose for them, but worth trying. Submit via their contact page with the JavaScript Weekly angle above.

---

## Conference CFP

### Title options (pick based on audience)

1. **"Enforcing Spacing Scales: Why Your Design System Leaks"** — broad design-system conferences
2. **"The 13px Problem: How Tailwind's Arbitrary Values Break Your Design System"** — Tailwind-leaning conferences
3. **"Lint-Time Design System Governance"** — dev-tools conferences

### Abstract (200 words, adjust length per conference)

> Every design system starts with a spacing scale. Within six months, `git grep` finds 47 unique values across 200 files. The 8pt grid is a suggestion, not a rule.
>
> This talk is about the gap between your design system and your codebase — and how to close it at lint time instead of at review time.
>
> We'll look at real audits of production codebases (including shadcn/ui), find out where spacing drift actually happens in 2026 (hint: it's not `margin: 13px` anymore — it's `ml-[-0.15rem]` hidden in a variant), and walk through enforcing a scale in both CSS declarations AND Tailwind class strings.
>
> You'll leave with:
>
> - A mental model for where drift enters a codebase
> - A 5-minute setup for Next.js + Tailwind teams
> - A zero-config path for Tailwind v4 `@theme` projects
> - A before/after audit you can paste into your team's Slack
>
> Bring your own CSS — we'll audit a few audience codebases live in the browser playground.

### Conferences to target

| Conference | Typical timing | Focus | CFP URL |
|---|---|---|---|
| CSS Day Amsterdam | June | CSS depth | https://cssday.nl/ |
| SmashingConf | Multiple cities | Frontend + Design | https://smashingconf.com/call-for-speakers |
| Design Matters Copenhagen | Oct | Product design | (email) |
| React Advanced London | Oct | React ecosystem | https://reactadvanced.com/cfp |
| Next.js Conf | Oct | Next.js | (monitor blog) |
| JSNation Amsterdam | June | JS | https://jsnation.com/cfp |
| ViteConf | Oct | Vite/tooling | (monitor repo) |
| Push Conference | Oct | Motion + UI | https://pushconference.com/ |

---

## Outreach messages

### Adam Wathan (Tailwind CSS creator)

**Channel:** X (@adamwathan) via reply or DM. Not email — he doesn't read cold email.

**Tweet reply approach** (works better than DM — catch him on a relevant thread):

> Built a Stylelint plugin + ESLint companion that enforces spacing scales in both CSS and Tailwind arbitrary values — zero-config @theme extraction for v4. Audited shadcn/ui and found 178 off-scale arbitrary values hiding in class strings: [gist]. Would love your thoughts on where this should slot in the ecosystem.

### Una Kravets (Google / Web Platform)

**Channel:** X (@una), email (public).

> Hi Una — built Rhythmguard, a Stylelint plugin that enforces spacing scales and design tokens in CSS + Tailwind. Zero-config extraction from @theme blocks. Browser playground at [URL]. Since you talk about design systems and web standards a lot, I'd love to know if this feels like the right shape of the problem, or if I'm missing something. No ask — just pointing you at it.

### Josh W. Comeau

**Channel:** X (@joshwcomeau), email form on blog.

> Hey Josh — you write a lot about spacing, layout, and teaching people to think about CSS properly. I built a Stylelint plugin that enforces spacing scales (with autofix), including inside Tailwind arbitrary values. Live playground: [URL]. Article: [URL]. Would love your take on whether the developer experience lands for someone who reads your blog.

### Sara Soueidan

**Channel:** email (available on her site).

> Hi Sara — I built Rhythmguard, a Stylelint plugin for enforcing spacing scales and design tokens in production codebases. Since you've written extensively about CSS methodology and shipped design-system work, I'd value your critique on whether the mental model lands. Playground: [URL]. Article: [URL].

### Jina Anne

**Channel:** X (@jina), email.

> Hi Jina — you literally named "design tokens" and built the ecosystem around them. I built Rhythmguard, which now supports W3C DTCG format, Tokens Studio, Style Dictionary, and Tailwind v4 @theme as token sources, with Stylelint + ESLint enforcement. I'd love your sanity check on whether the token-source story lines up with what teams actually ship. [repo link]

### Nate Baldwin (Adobe Spectrum)

**Channel:** X (@icncreative), email.

> Nate — built Rhythmguard for enforcing spacing scales + tokens in Stylelint. Your work on Spectrum tokens and Leonardo has shaped how I think about this stuff. Would value your take on the DTCG adapter and whether anything's missing from a production-systems perspective. [repo link]

### Ahmad Shadeed (defensivecss.dev)

**Channel:** X (@shadeed9), email.

> Ahmad — your defensive CSS site was a key reference when I built Rhythmguard (Stylelint plugin for spacing scale enforcement). Daniel Yuschick's `stylelint-plugin-defensive-css` wraps your content in enforcement. Rhythmguard does the same thing for spacing scales specifically. Playground: [URL]. If it resonates, a mention would mean a lot; if not, the critique would mean even more.

### Daniel Yuschick (stylelint-plugin-defensive-css author)

**Channel:** X (@DanielYuschick), email.

> Daniel — big fan of defensive-css and logical-css. Built Rhythmguard in the same shape: Stylelint plugin for spacing scale enforcement, with an ESLint companion for Tailwind class strings. Would love to exchange notes on distribution. Also thinking about cross-linking our READMEs ("you may also like") — interested? [repo link]

---

## Show HN post

**Title:** Rhythmguard — spacing scale enforcement for CSS and Tailwind

**Body:**

> Every Tailwind project starts clean. Six months later `git grep` finds 47 unique spacing values across 200 files.
>
> Rhythmguard is a Stylelint plugin that enforces a spacing scale and design tokens — in CSS declarations AND in Tailwind class strings (including `p-[13px]` arbitrary values). Autofix for both.
>
> What I think makes it different:
>
> - Tailwind v4 `@theme` tokens get extracted automatically — zero config
> - W3C DTCG / Style Dictionary / Tokens Studio JSON all supported as token sources
> - ESLint companion catches `cn("p-[13px]")`, `cva()`, `twMerge()` etc.
> - CLI: `npx rhythmguard audit ./src` outputs a shareable histogram
> - Browser playground: https://petrilahdelma.github.io/stylelint-plugin-rhythmguard/
>
> Ran it against shadcn/ui's v4 app — 91% clean on CSS side, but 178 arbitrary spacing values hiding in Tailwind class strings: https://gist.github.com/PetriLahdelma/2ad44d6dc2022f48c67f839c6440745c
>
> GitHub: https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard
>
> Would love feedback, especially on the DTCG adapter and the ESLint string-literal detection approach.

**Posting time:** Tuesday or Wednesday, 8-10 AM Pacific. Worst times: weekends, European evening.

---

## Twitter / X post (for you to post)

**Short version (fits in one tweet):**

> Every Tailwind project leaks spacing. Six months in, `git grep` finds 47 unique values.
>
> Built Rhythmguard — Stylelint plugin + ESLint companion that enforces a scale in CSS AND Tailwind `[arbitrary]` values.
>
> Audited shadcn/ui → 178 off-scale classes. Yours is worse.
>
> [link to gist]

**Thread version (4 tweets):**

1. > Every Tailwind project leaks spacing. `p-[13px]` here, `gap-[7px]` there. Six months later you have 47 unique values across 200 files. Your 8pt grid is a suggestion, not a rule.

2. > Built Rhythmguard — Stylelint plugin that enforces your scale. Catches `padding: 13px` in CSS AND `p-[13px]` in Tailwind class strings. Autofixes both.

3. > Tailwind v4? Define `@theme { --spacing-4: 16px }` and Rhythmguard auto-extracts those as tokens. Zero config. `padding: 16px` → `padding: var(--spacing-4)`.

4. > Audited shadcn/ui: 91% CSS discipline (impressive) but 178 arbitrary spacing values hiding in class strings: [gist]
>
> Playground (no install): [URL]
> Repo: [URL]
> npm: `stylelint-plugin-rhythmguard`

---

## Checklist (do in this order)

- [ ] Publish the Dev.to article (you already have it drafted)
- [ ] Tweet the short or thread version with the gist link
- [ ] Submit to CSS Weekly, Frontend Focus, Tailwind Weekly
- [ ] Show HN post Tuesday morning
- [ ] Send the 3-5 most relevant outreach messages (don't spam all 7 at once)
- [ ] CFP submission — pick one conference with a near deadline
- [ ] Ask Yuschick for a cross-link swap
