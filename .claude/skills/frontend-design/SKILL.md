---
name: frontend-design
description: Designs SurfaceX React/TypeScript UI with product-specific composition, hierarchy, and design tokens. Use when building pages, layouts, dashboards, forms, navigation, design systems, or when the user asks for frontend design or UI architecture.
---

# Frontend Design

## Product context

SurfaceX (`web/`) is a local-first attack surface console:

- dashboard of host/service change;
- targets, scans, signatures;
- history/diff and confidence/evidence;
- import/export;
- RBAC-aware chrome for `admin`, `operator`, `analyst`, `viewer`.

This is an operations UI, not a marketing landing page. Do not force full-bleed heroes or brand-over-content layouts onto authenticated app screens.

Read `docs/security.md` before inventing IA.

## Composition rules

- One job per view/section: one headline purpose, one primary action.
- First viewport of a tool screen: identity + primary task + key data. No promo clutter.
- Prefer lists/tables for inventory; use cards only when the card is the interaction unit.
- Keep filters, bulk actions, and export in a predictable toolbar.
- Show scan progress/ETA near the work it describes, not as a detached widget wall.
- Empty, loading, and error states are part of the design — not afterthoughts.

## Hierarchy

1. What changed / needs attention.
2. What is running (scan state).
3. Inventory detail (hosts, ports, tech, certs).
4. Secondary admin/config.

Lifecycle states must be visually distinct and consistent everywhere they appear.

## Visual system

- Define CSS variables for color, type, space, radius, and status.
- Avoid banned aesthetics from `anti-ai-slop`.
- Use real content shapes in mocks: CIDRs, long FQDNs, hex-ish evidence, cert dates.
- Desktop-first dense layout; usable down to ~1024px; degrade gracefully on mobile.
- Respect reduced-motion preferences.

## Stack assumptions

- React + TypeScript.
- Follow existing repo patterns when present.
- Do not add `useMemo`/`useCallback` by default.
- Prefer accessible native controls before custom widgets.

## Deliverable checklist

- [ ] Clear primary action per screen
- [ ] RBAC: actions hidden or disabled per role without relying on UI alone
- [ ] Status tokens for lifecycle + confidence
- [ ] Tokens documented in CSS variables
- [ ] No AI-slop patterns
