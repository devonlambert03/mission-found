# Mission: Found

## What this is
A $149/mo local digital presence management service for local service
businesses (plumbers, landscapers, snow removal, etc). Founder: Devon,
active-duty Army Signal Corps officer, running this as a side business.

Scope: Google Business Profile management, review monitoring & response,
local search/competitor monitoring, website accuracy checks.
**Explicitly NOT offered:** social media management, paid ads, full web dev.
Don't let copy or features drift into implying we do these.

## Brand principle — non-negotiable
Honest positioning over inflation. Never fabricate results, testimonials,
or overstate capability. The pilot client (an anonymized local service
business) stays anonymous in all public copy; only real, non-fabricated
outcomes go on results.html.

**"Real person, not AI" is a deliberate selling point, not a disclaimer.**
Every GBP post, review reply, and management action is done by a human on
the team. Never introduce AI-generated-content framing into customer-facing
copy or the product demo — this was a specific decision to differentiate
from competitors (e.g. Semrush) who lead with AI automation.

## Stack & deploy
Static HTML/CSS/JS, no build step, no framework. Deployed via Vercel,
connected to this repo — merging to `main` auto-deploys to mission-found.com.

## Pages — current state
- `index.html` — **just rebuilt** in the new design system below. This is
  the reference for how every other page should look.
- `about.html`, `results.html` — **not yet rebuilt**, still the old dark
  "starfield" theme. Next priority: rebuild both to match index.html's
  design system exactly, keeping their existing copy/content.
- `audit.html` — lead-gen free-audit request page.
- `audit-dashboard.html` — internal tool, not linked from public nav.
  4-pillar weighted scoring: GBP 35%, Reviews 25%, Local Search 15%,
  Website 25%. Has its own print/PDF export system — leave its logic alone
  unless asked.

## Design system (locked — do not deviate without asking)
- Fonts: **Inter** (body/UI), **Plus Jakarta Sans** (headings, logo
  wordmark) — both via Google Fonts, loaded together in one link tag.
- Colors: `--navy-deep #060A16` `--navy #0E1730` `--blue #5B7FE0`
  `--blue-deep #4A6BC7` `--purple #8B6FE0` `--purple-deep #7357C9`
  `--cream #F4EFE6` `--muted #9AA6C4` `--border #E7EAF3`.
- Look: light gradient backgrounds (cream → soft blue → soft purple),
  white rounded cards with subtle shadow, pill-shaped blue-gradient CTA
  buttons. The body background is a fixed blue/purple/cream gradient
  (added per Devon's request); section-level gradients (hero, hero demo
  video backdrop, pricing) were updated to blend into the same family.
  Purple is a background-only accent — CTAs, links, and other UI accents
  stay blue. This replaced an earlier dark-theme/starfield design — **do
  not reintroduce the dark theme anywhere**, including on about/results.
- Logo: real sparkle-icon + "MISSION: FOUND" wordmark. The base64 PNG
  asset is already embedded in index.html's nav and footer — reuse that
  exact `<img>` tag, don't regenerate or approximate the icon.

## Voice
Plain and direct. Short sentences. Write for a blue-collar business owner
reading on a phone between jobs — no marketing jargon like "digital
visibility," "turnkey," "leverage," "seamless."

## Workflow
- Branch protection is on for `main` — work on a feature branch, open a
  PR, Devon reviews and merges. Never push directly to main.
- Flag before changing: the $149/mo price, the "real person not AI"
  claims, or anything on results.html — these are deliberate business
  decisions, not copy to optimize away.
