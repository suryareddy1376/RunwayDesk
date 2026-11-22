# RunwayDesk (The One-Person Back Office)

**Codebenders Hackathon | Problem Statement 1: Small Business Operations**

RunwayDesk is a lightweight cash-flow command center built for solo freelance designers and 1 to 3 person studios. It turns scattered invoices, fixed bills, and client follow-ups into a deterministic 30 to 90 day early-warning and cash-recovery system.

> **Live Demo:** https://runway-desk.vercel.app/  
> **Demo Video:** [Watch Project Walkthrough (`Project Information.mp4`)](./Project%20Information.mp4)  
> **For Judges:** No signup required. Click **"Launch Studio Sandbox"** on the landing or login screen to enter a pre-seeded workspace with realistic studio invoices, recurring bills, and cash-flow scenarios. Click **"Reset Demo Data"** in the header at any time to restore the original baseline.

---

## The Problem

Solo founders and micro-studios rarely fail because of a lack of clients. They fail because of a **timing mismatch**: client payments arrive late while fixed bills (rent, contractors, software subscriptions) arrive on time. Tracking receivables across WhatsApp chats, paper notebooks, and stale spreadsheets leaves invoices unchased and provides zero warning before a bank balance hits zero.

## The Solution

RunwayDesk connects receivables, fixed bills, and assisted client follow-ups into a single daily cash-flow engine:

- **Zero-Friction Quick-Add Bar:** Log invoices or bills in one line (for example, `Invoice Aarav 45000 due 14d` or `Bill Figma 3500 due 5d`) with live deterministic parsing and instant Supabase persistence.
- **"Who Owes Me?" Receivables View:** Sortable table showing unpaid invoices, exact days overdue, aging buckets (`Current`, `1-7d`, `8-15d`, `15+d overdue`), and one-click **Mark Paid** that atomically updates your live cash balance.
- **1-Click Assisted Follow-Ups (Chase Drawer):** Slide-over drawer with three editable reminder tones (**Friendly Nudge**, **Firm Reminder**, **Final Notice**), one-click copy, direct WhatsApp (`wa.me`) and Email (`mailto`) links, and persistent follow-up logging.
- **30 / 60 / 90 Day Cash Forecast + What-If Simulator:** Projects daily closing balances against a `₹0 Danger Line` and a configurable `Safe Buffer`. Stress-test late payments (`Key Client +15d Late`, `Bad Day Mode`), one-time surprise expenses, or overdue recoveries without mutating real database records.
- **Ranked Actionable Alerts:** Surfaces urgent overdue invoices and upcoming cash crunches with direct action buttons (`Draft Reminder`, `Send Firm Follow-Up`, `Simulate +15d Delay`).

---

## 60-Second Judge Walkthrough (The Day 19 Loop)

1. **Launch Studio Sandbox:** Open https://runway-desk.vercel.app/ and click **Launch Studio Sandbox**. The Overview dashboard shows a healthy Day 19 baseline balance of **`+₹92,500`**, safely above the `₹30,000` studio buffer.
2. **Trigger the Cash Crunch:** Click **Simulate +15d Delay** on the priority alert (or toggle Preset 1 in the simulator). When key client Veloce (`INV-106`, `₹95,000`) slips by 15 days and fixed rent/payroll bills hit, the forecast drops below the `₹0 Danger Line` to a **`-₹2,500` deficit**.
3. **Chase and Recover:** Click **Draft Reminder** on overdue invoice `INV-104` (`Kora Foods`, `₹55,000`), switch between Friendly, Firm, and Final tones in the Chase Drawer, and click **Log Follow-Up**. Toggle **INV-104 Recovery (Day 3)** in the simulator to watch the projected balance rebound to **`+₹52,500`**, safely above the buffer.
4. **Test Live Writes:** Type `Bill Figma 3500 due in 5 days` in the top Quick-Add bar, save it, and verify it appears immediately under the **Bills** tab.

---

## Architecture & Tech Stack

| Layer | Technology | Role |
| :--- | :--- | :--- |
| **Frontend** | React, TypeScript, Vite, Tailwind CSS, React Router, Phosphor Icons | Multi-page app (`/`, `/login`, `/dashboard`) and workspace (`Overview`, `Receivables`, `Bills`, `Clients`, `ChaseDrawer`) |
| **Data Visualization** | Recharts | 30 / 60 / 90 day Baseline vs Simulated cash forecast chart |
| **Pure Math Engine** | TypeScript (`src/engine/`) | Deterministic forecast, aging buckets, alert ranking, quick-add parser, reminder templates |
| **Testing** | Vitest | **30 / 30 passing unit tests** covering financial engine math, routing, and Supabase service layer |
| **Backend & Auth** | Supabase | Auth, Postgres with Row Level Security (RLS), and `seed_demo_workspace()` RPC |

### Project Structure

```text
src/
├── engine/          # Pure TypeScript financial math (forecast, aging, alerts, parser, templates)
├── services/        # Supabase data access layer + mocked unit tests (db.ts, db.test.ts)
├── context/         # AuthContext (Sign In, Sign Up, 1-Click Studio Sandbox)
├── hooks/           # useWorkspace() state and engine orchestration
├── pages/           # LandingPage and NotFoundPage
├── routes/          # AppRoutes (protected /dashboard, /login, /signup, /)
├── components/      # AppShell, LoginScreen, QuickAddBar, OverviewView, ReceivablesView, BillsView, ClientsView, ChaseDrawer
└── lib/             # Supabase client initialization
