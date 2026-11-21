---
name: runwaydesk-app-design
description: Multi-page SaaS application UI/UX design skill tailored for RunwayDesk (The One-Person Back Office). Use when designing, refining, or reviewing the LoginScreen, AppShell, QuickAddBar, OverviewView, ReceivablesView, BillsView, ClientsView, and ChaseDrawer.
---

# RunwayDesk Multi-Page App Design Skill

Use this skill whenever building or polishing views in **RunwayDesk** (Vite + React + TypeScript + Tailwind CSS + Recharts + Supabase). Unlike a single-scroll marketing landing page, RunwayDesk is a high-density, multi-view financial command center for solo freelance designers and 1-3 person studios. Every pixel must prioritize **scannability, deterministic financial clarity, and 1-click action**.

---

## 1. Core Aesthetic & Design Tokens

* **Visual Direction:** Minimalist light-mode **Instrument / Paper** aesthetic. Flat, crisp surfaces with 1px structural borders instead of heavy drop shadows, neon glows, or decorative gradients.
* **Color Palette:**
  * **Canvas Background:** `#F8F7F4` (warm off-white paper)
  * **Elevated Surface (Cards, Tables, Drawers):** `#FFFFFF`
  * **Subtle Surface (Table Headers, Chips, Secondary Panels):** `#F2F0EB`
  * **Primary Ink:** `#14171A` | **Secondary Ink:** `#4B5563` | **Muted Ink:** `#6B7280`
  * **Borders:** `#E2E5E9` (default) and `#CBD2D9` (interactive hover/focus)
* **Strict Semantic Status Colors (Financial Meaning Only):**
  * **Emerald (`#059669`):** Safe buffer, paid invoices, recovered cash, positive inflows.
  * **Amber (`#D97706`):** Due soon, 1-7d / 8-15d aging, Safe Buffer threshold line (`₹30,000`), caution alerts.
  * **Rose (`#E11D48`):** 15+d overdue, cash deficit below `₹0`, urgent chase alerts, destructive actions.
  * **Blue (`#2563EB`):** Active navigation state, primary action buttons, focus rings.
* **Typography & Copy Rules:**
  * **UI Sans:** Clean geometric sans-serif (`Plus Jakarta Sans` or `Inter`) with tight heading tracking (`-0.02em`).
  * **Financial Figures & Codes:** Monospace (`JetBrains Mono`) with `font-variant-numeric: tabular-nums` on **all** INR (`₹`) amounts, dates, invoice IDs (`INV-106`), and day counts so columns align vertically.
  * **Zero Em Dashes:** Never use em dashes (`—`) in UI copy, labels, alerts, or reminder templates. Use colons, commas, parentheses, or short sentences instead.

---

## 2. Multi-View Shell & Navigation Architecture

Maintain a persistent, predictable frame across all workspace views so users never lose orientation:

* **Left Sidebar (`AppShell.tsx`):**
  * Fixed width (`220px` to `240px`) on desktop; collapsible drawer on mobile.
  * Exactly 4 primary navigation destinations: **Overview**, **Receivables**, **Bills**, **Clients**.
  * Active tab uses a subtle pill fill (`#F2F0EB` or tinted blue) with a crisp left accent indicator and bold text.
* **Pinned Top Header:**
  * Left: Studio name (from `studio_settings`) + live connection/workspace indicator.
  * Center/Primary: **`QuickAddBar`** pinned prominently so users can log `Invoice Aarav 45000 due 14d` or `Bill Figma 3500 due 5d` from *any* page without switching tabs.
  * Right: Compact **Reset Demo Data** button and **Sign Out** action.
* **Global Slide-Over Layer:**
  * Render **`ChaseDrawer`** at the `AppShell` level so both **Overview** alerts and **Receivables** table rows open the exact same right-hand drawer without losing scroll position.

---

## 3. Page-by-Page Layout Patterns

### A. Auth Gate (`LoginScreen.tsx`)
* Centered single-column card (`max-w-md`) on the `#F8F7F4` canvas with subtle dot-grid texture.
* Clear product identity header (`RunwayDesk` + 1-line value proposition).
* **Primary CTA Hierarchy:** Place the **1-Click "Launch Demo Studio"** button prominently above or beside the standard Email/Password Sign In & Sign Up tabs so judges and evaluators enter a live seeded workspace immediately.

### B. Overview (`OverviewView.tsx`)
* **Row 1: 4-Card KPI Strip (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`):**
  * Current Cash (`opening_balance`), Total Owed, Overdue Now (count + INR), Lowest Projected Cash (amount + exact date).
  * Each card: uppercase mono label (`11px`), large tabular-nums figure (`24px-28px`), and a 1-line contextual sub-label.
* **Row 2: Actionable Alerts Queue:**
  * Compact vertical list ranked by cash-crunch urgency.
  * Every alert row must pair a concise risk statement with a direct action button (`Draft Reminder`, `Send Firm Follow-Up`, `Simulate +15d Delay`).
* **Row 3: 30 / 60 / 90 Day Forecast + What-If Simulator (2-Column Split on Desktop):**
  * **Left (65%):** Recharts `AreaChart` / `LineChart` with `30d / 60d / 90d` segmented toggle, "At-Risk Overdue Cash" callout, dashed Amber `ReferenceLine` for Safe Buffer, and dashed Rose `ReferenceLine` for `₹0`. When simulating, show Baseline (muted dashed) vs Simulated (solid Emerald/Rose) plus a 4-stat comparison strip (Baseline Lowest, Simulated Lowest, Shortfall, Crunch Date).
  * **Right (35%):** Non-destructive What-If Controls card with Preset 1 (`Key Client +15d Late` + slider), Preset 2 (`Bad Day Mode`), `INV-104 Recovery (Day 3)` toggle, custom surprise expense inputs, and `Reset Simulation`.
* **Row 4: Daily Cash-Event Ledger:**
  * Compact table showing only dates with inflows/outflows and running balance.

### C. Receivables (`ReceivablesView.tsx`)
* Top action bar: Section title, aging summary pills, and `+ New Invoice` button (opens modal).
* Sortable **"Who Owes Me?"** table with columns: Client, Invoice #, Title, Amount (`tabular-nums`, right-aligned), Due Date, Days Overdue/Remaining, Aging Bucket Badge (`Current`, `1-7d`, `8-15d`, `15+d overdue`), Last Follow-Up, and inline actions (`Chase Now`, `Mark Paid`).
* Row hover state should be subtle (`#F8F7F4`) with clear button affordances.

### D. Bills (`BillsView.tsx`) & Clients (`ClientsView.tsx`)
* **Bills:** Scannable ledger table with Category badge, Due Date, `Recurring Monthly` badge, right-aligned INR Amount, 1-click Paid toggle switch, and `+ Add Bill` modal.
* **Clients:** Clean 2-to-3 column responsive card grid (or structured table) showing Contact Name, Email/WhatsApp links, `avg_delay_days` badge, Total Unpaid Owed (`tabular-nums`), notes, and `+ Add Client` modal.

### E. Assisted Chase Drawer (`ChaseDrawer.tsx`)
* Right-side slide-over (`420px-480px` wide) with light backdrop scrim.
* Header: Client name, Invoice #, INR amount, and Days Overdue badge.
* Body: 3 segmented tone tabs (`Friendly Nudge`, `Firm Reminder`, `Final Notice`), editable textarea pre-filled from `reminderTemplates.ts`, and 4 clear actions (`Copy Message` with copied state, `Open WhatsApp`, `Open Email`, and primary `Log Follow-Up`).
* Footer/History: Chronological list of past `followup_logs` for that invoice.

---

## 4. Interaction, State & Polish Checklist

Before marking any view complete, verify:
1. **Zero Layout Shift:** All loading states use clean skeletons or subtle inline spinners without jumping table columns.
2. **Immediate Feedback:** `QuickAddBar` shows a live parsed preview chip before save; `Mark Paid`, `Log Follow-Up`, and `Toggle Bill Paid` disable their button briefly while writing to Supabase and immediately refresh KPIs and forecast curves.
3. **Empty & Error States:** Every table/list handles 0 rows cleanly with a 1-line prompt and primary action; Supabase errors surface in a dismissible Rose banner rather than failing silently.
4. **Responsive Discipline:** Tables wrap in `overflow-x-auto` containers; KPI grids and the Forecast/Simulator split stack cleanly below `1024px`.
5. **No Marketing Bloat:** Never add hero banners, pricing tables, testimonial carousels, or decorative clipart inside the authenticated app workspace.
