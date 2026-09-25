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
outcomes go on results.html (currently unlinked from nav — see decision
log below).

**"Real person, not AI" is a deliberate selling point, not a disclaimer.**
Every GBP post, review reply, and management action is done by a human on
the team. Never introduce AI-generated-content framing into customer-facing
copy or the product demo — this was a specific decision to differentiate
from competitors (e.g. Semrush) who lead with AI automation.

## Stack & deploy
Static HTML/CSS/JS, no build step, no framework. The client portal (`/app/`)
adds Supabase (Postgres + auth + storage) and Vercel serverless functions in
`/api` (root `package.json` is for those only — still no frontend build).
Secrets (service-role key, Resend key) live only in Vercel env vars and are
read only in `/api`; run `scripts/check-no-secrets.sh` before merging site
changes. Portal setup and data entry: `app/README.md`. Deployed via Vercel,
connected to this repo — merging to `main` auto-deploys to mission-found.com.
Branch protection is on for `main` — work on a feature branch, open a PR,
Devon reviews and merges. Never push directly to main.

## Pages — current state
- `index.html` — **hero + nav rebuilt in the new locked design system**
  (see below) as of Sept 2026. Reference implementation lives in
  `hero-section.html` (given to Claude Code alongside the implementation
  brief) — merge that structure into the live file rather than
  re-deriving it. Primary CTA is phone-first (see decision log). The rest
  of the page (pricing, how it works, FAQ) is still on the OLD navy/
  blue/purple/cream system and needs to be brought into the new one —
  see Phase 2 of the implementation brief.
- `about.html` — **unlinked from nav/footer as of Sept 2026.** File still
  exists at its URL but isn't linked anywhere public. Still on the old
  dark "starfield" theme. Pending decision: rebuild in new design system
  vs. retire permanently — don't decide unilaterally, ask Devon.
- `results.html` — **unlinked from nav/footer as of Sept 2026** (no
  completed case study yet to show). File still exists at its URL, not
  deleted. Still on the old dark "starfield" theme. Content itself
  (the anonymized-pilot-client framing) stays as previously written unless
  Devon asks for a rewrite — the "don't touch without asking" rule below
  still applies to its actual content, just not its nav visibility.
- `audit.html` — lead-gen free-audit request form. **Unlinked from nav/
  footer as of Sept 2026** — killed short-term in favor of a phone-only
  CTA (603-921-0218); Devon plans to rebuild this later. File kept in
  the repo, just not linked anywhere public. The word "audit" stays in
  site copy either way — audits are now offered/performed via phone
  intake instead of the web form.
- `/app/` — **client portal (Phase 1, Sept 2026).** Results dashboard vs
  baseline, photo uploads (signed-in + per-client secret link), change
  requests, account/billing link. noindex, disallowed in robots.txt, not in
  public nav. Phase 2 = admin UI + CSV import; Phase 3 = PDF reports +
  monthly summary. Schema/RLS in `supabase/migrations/`, RLS tests in
  `supabase/tests/`. Uses the locked design system via `app/css/tokens.css`
  (plus a dark theme). Never add AI framing to portal copy.
- `audit-dashboard.html` — internal tool, not linked from public nav.
  4-pillar weighted scoring: GBP 35%, Reviews 25%, Local Search 15%,
  Website 25%. Has its own print/PDF export system — leave its logic alone
  unless asked.

## Design system (locked — Sept 2026 redesign)
This fully replaces the earlier locked system below (Inter + Plus Jakarta
Sans, navy/blue/purple/cream). Do not reintroduce that old system anywhere,
including if/when about.html or results.html get rebuilt.

- **Fonts:** Playfair Display (headings, logo reference, nav — weights
  500/600/700) + Work Sans (body/UI — weights 400/500/600), one Google
  Fonts `css2` link. Remove old Inter/Plus Jakarta Sans references.
- **Colors:** `--ink: #1C1A17` (text/borders/fills), `--cream: #FFFFFF`
  (background — pure white, not off-white; changed from the original
  `#F7F3EC` per Devon's Sept 2026 call). Two-tone only — no accent color,
  no gradients, no shadows. Deliberate black-on-white, boutique/editorial
  look, referencing a high-contrast-serif + laurel-wreath aesthetic
  (think classic film-festival laurels). The `--cream` variable name is
  kept for continuity even though the value is now pure white.
- **Logo:** `logo-mark.png` — a real uploaded asset, cropped tight and
  background knocked out to transparency. Reuse this exact file
  everywhere the wordmark appears; don't regenerate or approximate it.
- **Ornament:** a laurel-wreath SVG (symmetric crescent, full in the
  middle, tapering to a point at both ends), flanking the hero headline
  on desktop/tablet only (hidden below 860px). Exact path/ellipse
  coordinates live in `hero-section.html` — copy verbatim, don't re-derive.
- **Buttons:** nav CTA outlined (1px solid `--ink`, transparent fill,
  "CALL NOW"). Primary CTA solid filled (`--ink` bg, `--cream` text,
  "CALL FOR YOUR FREE AUDIT"). Both: 2px border-radius, uppercase,
  letter-spaced, Work Sans.
- **Headline style:** Playfair Display, uppercase via `text-transform`,
  minimal-to-no extra letter-spacing at large sizes.
- **Responsive:** one breakpoint at 860px — below it, stacked/no laurels/
  smaller type/full-width CTA; at/above it, side-by-side/laurels visible/
  larger type/inline CTA row. See `hero-section.html` for exact values.

Old system reference (for context only, fully superseded): fonts were
Inter (body/UI) + Plus Jakarta Sans (headings/logo); colors were
`--navy-deep #060A16` `--navy #0E1730` `--blue #5B7FE0` `--blue-deep
#4A6BC7` `--purple #8B6FE0` `--purple-deep #7357C9` `--cream #F4EFE6`
`--muted #9AA6C4` `--border #E7EAF3`; light gradient backgrounds, white
rounded cards, pill-shaped blue-gradient CTA buttons. The old sparkle-icon
logo has been replaced by the real logo-mark.png asset above.

## Voice
Plain and direct. Short sentences. Write for a blue-collar business owner
reading on a phone between jobs — no marketing jargon like "digital
visibility," "turnkey," "leverage," "seamless."

## Conversion guardrails (added Sept 2026, from a full site audit)
- Every public page's primary CTA area must include the phone number
  (603-921-0218, as a `tel:` link) — never let a redesign drop back to a
  form-only CTA.
- Never add a testimonial, review count, client name, star rating, or
  results figure that isn't real and explicitly provided by Devon. Insert
  a marked placeholder and ask, rather than writing something plausible.
- No unexplained proprietary-sounding metrics in customer-facing copy. If
  a named "score" is introduced, define it in plain language on first use.
- Price ($149/mo) must stay visible in or near the hero section on both
  desktop and mobile — don't let it get pushed below the fold by new
  sections or media.
- Any claim about guarantees, response times, or years in business must
  come from Devon directly, never inferred or written to "sound right."

## Decision log
- **Sept 2026 — conversion audit fixes:** real phone number
  (603-921-0218) added site-wide as primary CTA; response-time commitment
  set to 24 hours; a guarantee draft is under discussion for pricing (48hr
  review response + 2x monthly profile updates, or the month's free) —
  **not yet confirmed by Devon, do not ship until he approves exact
  wording**; `results.html` and `about.html` unlinked from
  nav/footer (files kept, not deleted); before/after Google-listing mockup
  removed from `index.html`; `audit.html` unlinked from nav/footer entirely
  — site is phone-only for now (603-921-0218), no online audit-request
  path live. "Audit" stays as the offered service, just phone-intake
  instead of a form; the web form gets rebuilt later.
- **Sept 2026 — design reset started:** the locked visual design system
  (navy/blue/purple/cream, Inter/Plus Jakarta Sans) is being scrapped and
  redone from scratch. Content/copy/CTA decisions above are unaffected —
  this is presentation-layer only.
- **Sept 2026 — new design system locked:** Playfair Display + Work Sans,
  black-on-ivory (`--ink`/`--cream`), real logo asset (`logo-mark.png`),
  hand-built laurel-wreath ornament, outlined/solid button pair. Reference
  implementation for the hero: `hero-section.html`. Final headline: "You
  Handle The Work Stuff, We Handle The Google Stuff." Only the hero + nav
  are built so far — see index.html's entry above for what's left.

## Workflow
- Work on a feature branch, open a PR — never push directly to main.
  Once a requested change is complete and checks (CI/Vercel preview)
  pass, merge the PR yourself so it goes live on a refresh — Devon
  doesn't want to be the one clicking merge for routine work. Use
  discretion: ask first if something is genuinely ambiguous, or if a
  change touches an item flagged below.
- Flag before merging (ask Devon first, even if the rest of the PR is
  ready): the $149/mo price, the "real person not AI" claims, or the
  actual written content of results.html — these are deliberate
  business decisions, not copy to optimize away.

## Rollback procedure
Rollback word: REDLEG
Checkpoint tag: checkpoint-pre-dashboard

When Devon says "REDLEG" (optionally followed by a branch name), do this:
1. `git fetch origin --tags` and work out what dashboard work exists: open PRs and branches that aren't merged, plus anything merged to main since the checkpoint (`git log --first-parent --oneline checkpoint-pre-dashboard..origin/main`). Show Devon exactly what will be closed, deleted, or reverted, and ask for a single "yes" confirmation before touching anything.
2. **Not merged:** close the open dashboard PR(s) and delete their branch(es) on GitHub and locally (or just the branch Devon named). Main is untouched.
3. **Merged:** don't touch main directly. Create a branch `redleg/revert-dashboard` from `origin/main` and revert each dashboard merge, newest first, with `git revert -m 1 <merge-sha>` (a squash-merged PR is a plain commit, so `git revert <sha>` with no `-m`). Push the branch and open a PR titled "REDLEG: revert dashboard". Do not merge it yourself — it waits for Devon's review, even though routine PRs normally get self-merged. Then tell Devon to use Vercel Instant Rollback now to restore the live site to the last pre-dashboard deployment while the revert PR is reviewed.
4. Report the commit hash of `origin/main` and of the checkpoint tag, and say whether main already matches the checkpoint or is waiting on the revert PR.
5. Never force-push or reset main, never delete or move the checkpoint tag, and never change the Supabase database or Vercel settings as part of rollback. A git revert doesn't undo database migrations or data — tell Devon what to do by hand there instead.
