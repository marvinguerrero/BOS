---
name: bos-project-overview
description: BOS Business Operating System — purpose, business templates, and onboarding goal
metadata:
  type: project
---

BOS is a template-driven Business Operating System SaaS for Filipino small businesses.

**Why:** Owner (Marvin) wants to build a multi-tenant SaaS that allows business owners to select a template and immediately receive all modules needed to run their business — target onboarding under 5 minutes.

**Three MVP templates:**
- `sari_sari` — Inventory, sales/POS, customer credit (utang), reports
- `laundry` — Laundry order tracking, services, revenue reports
- `room_rental` — Room management, tenants, billing, collections

**Architecture principles:**
- Multi-tenant (business_id on every table + RLS)
- Template-driven navigation and dashboard via DB-stored config (no hardcoded template logic in UI)
- Module-driven (each template provisions a set of modules on business creation)
- Soft deletes + audit logs everywhere
- Offline-first designed (IndexedDB layer planned for next phase)

**How to apply:** Any future features must respect multi-tenancy (every query needs business_id), use the template engine for navigation/modules, and never hardcode template-specific logic outside the template config.
