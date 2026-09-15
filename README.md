# UniFlow Ops — Unit Flow Operator Mobile Web Application

UniFlow Ops is a mobile-first industrial garment production web application built with **React 18**, **TypeScript**, **Vite**, **React Router DOM**, and **Lucide Icons**.

Developed by **Innovus**.

---

## Route & Screen Implementation Checklist

### Shared Routes
- [x] `/login` — Login Screen (Brand: UniFlow Ops, Subtitle: UNIT FLOW OPERATOR, Role selector, Remember me, Footer: Software developed by Innovus)
- [x] `/alerts` — Alerts Page (Filter tabs: All, Work, Quality, System; color-coded icons and cards)

### Operator Routes (`/operator/*`)
- [x] `/operator/home` — Operator Home (Greeting, active PO/SO banner, scanning status pill, 4 operation tiles, today's summary)
- [x] `/operator/assignments` — Select Assigned Work (Assigned PO/SO list with radio selection, targets & shift info, Confirm & Start Work)
- [x] `/operator/orders` — Operator Orders (Tabs: Current, Completed, All; PO cards & SO progress breakdown)
- [x] `/operator/scan` — Scan Center (Center action modal/page with choices: QC Test, Packing, AQL Checker, Box Transfer, Scanner status)
- [x] `/operator/qc` — QC Test (Scan Item QR, valid/duplicate/invalid feedback, QC PASS/FAIL, Test PASS/FAIL, Save with success toast)
- [x] `/operator/packing` — Packing (Box BX-000218, progress 8/12 -> 12/12, recent items list, Box Complete state & Finish Box modal)
- [x] `/operator/aql/box` — AQL Checker Step 1: Scan Box Number (Box BX-000218, 12 items, sample requirement: 3)
- [x] `/operator/aql/samples` — AQL Checker Step 2: Scan Samples 1/3, 2/3, 3/3 with PASS/FAIL toggles
- [x] `/operator/aql/result` — AQL Checker Step 3: PASSED / FAILED summary, defect reason selector if failed, Save & Return Home
- [x] `/operator/transfer` — Box Transfer (Source box BX-000218 -> Destination box BX-000245, item checkbox selection, Transfer N items)
- [x] `/operator/profile` — Operator Profile (Chamika Silva, Operator · Line 04, Language, Innovus Info, Role switch, NO Change Password)

### Supervisor Routes (`/supervisor/*`)
- [x] `/supervisor/home` — Supervisor Home (Nimal Perera, line overview, POs/SOs, quick actions, attention cards)
- [x] `/supervisor/production-orders/new/general` — Create PO Step 1 (PO No, Map PO free-text, Customer, Dates, Supervisor, Remarks, Required Ops — NO Line field)
- [x] `/supervisor/production-orders/new/sales-orders` — Create PO Step 2 (SO list, Add/Edit SO modal with Map SO free-text, Line/Department, Box capacity, Shift management with overlap validation)
- [x] `/supervisor/production-orders/new/review` — Create PO Step 3 (Summary review, "Make this PO current" checkbox, Create PO action & success screen)
- [x] `/supervisor/shifts` — Shift Management (Filter PO/SO/Line/Date, shift worker timeline, shift overlap validation, current active worker clock indicator)
- [x] `/supervisor/orders` — Supervisor Orders & SO Progress (PO details, SO progress breakdown: QC + Test, Packing, AQL, issue counts)
- [x] `/supervisor/profile` — Supervisor Profile (Nimal Perera, includes Change Password modal)

### Admin Routes (`/admin/*`)
- [x] `/admin/dashboard` — Live Factory Dashboard (KPI cards, production progress, quality rates, exceptions list, attention list)
- [x] `/admin/orders` — Factory-wide Orders & SO Management
- [x] `/admin/users` — User Management (Role filters: Operator, Supervisor, Admin; Status filter, Add User modal)
- [x] `/admin/reports` — Reports & Analytics (Today/Week/Month time range filters, production velocity chart, line performance breakdown table, Export action)
- [x] `/admin/alerts` — Factory-wide Alert Logs
- [x] `/admin/more` — System Settings (Company Details, Production Lines, Products/Styles, Box Settings, Scanner Devices, Roles & Permissions)

---

## Technical Stack & Configuration
- **Core**: React 18 + TypeScript + Vite
- **Routing**: React Router v6 (`HashRouter` or `BrowserRouter` with safe fallback)
- **Icons**: Lucide React only
- **Styling**: Pure CSS with CSS Variables (`/src/styles/tokens.css` & `/src/styles/global.css`)
- **Persistence**: LocalStorage repository pattern (`repository.ts`)
- **Theme**: Dark mode enforced `#071B23` background, `#0D2630` / `#102E38` elevated surfaces, `#16B8AE` primary teal

---

## Demo User Accounts

| Role | Username | Password | Default Home | Bottom Nav Items |
|---|---|---|---|---|
| **Operator** | `chamika` | `password` | `/operator/home` | 5 items (Home, Orders, **Scan**, Alerts, Profile) |
| **Supervisor** | `nimal` | `password` | `/supervisor/home` | 4 items (**NO Scan button**, Home, Orders, Alerts, Profile) |
| **Admin** | `admin` | `password` | `/admin/dashboard` | 5 items (Dashboard, Orders, Reports, Alerts, More) |

*Note: Demo login accepts any non-empty username/password when selecting the corresponding role.*

---

## Scanner Simulation Behavior
- **Manual Click**: Clicking the large "Scan QR" button simulates scanning a valid item or box QR code with realistic scan delay and haptic/visual feedback.
- **Keyboard Wedge Input**: Fast keypresses ending in `Enter` automatically register as a barcode scan in any active scan view.

---

## Planned API Endpoints (Phase 2 Integration)
- `POST /api/v1/auth/login`
- `GET /api/v1/production-orders`
- `POST /api/v1/production-orders`
- `GET /api/v1/sales-orders/:id/progress`
- `POST /api/v1/scans/qc`
- `POST /api/v1/scans/pack`
- `POST /api/v1/aql/sessions`
- `POST /api/v1/boxes/transfer`
- `PUT /api/v1/shifts/assignments`