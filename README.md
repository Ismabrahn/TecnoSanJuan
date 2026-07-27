# Nexus AI Platform

AI-powered customer service and CRM platform for **Tecno San Juan**, built on Cloudflare Workers.

**Features:**
- WhatsApp-based intelligent customer interaction
- AI-driven quoting interviews (3D Printing, LED Signage, and more)
- Admin panel for conversation management
- CRM: clients, budgets, service orders
- Event-driven notification system
- Role-based access (customer / admin / superadmin)

## Architecture

```
WhatsApp ───► Cloudflare Worker (Nexus) ───► Supabase
                    │
              ┌─────┴─────┐
              │  NexusAI   │
              │   Engine   │
              ├───────────┤
              │   Tools    │
              ├───────────┤
              │ Interview  │
              │    v2      │
              ├───────────┤
              │  Events /  │
              │ Notif.     │
              └───────────┘
```

Full architecture: [docs/architecture.md](docs/architecture.md)

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Cloudflare Workers (ES modules) |
| Language | JavaScript (ES2022+) |
| Database | Supabase (PostgreSQL) |
| AI | OpenRouter (multi-model) |
| Auth | Supabase Auth + JWT |
| WhatsApp | Meta Cloud API |
| Admin Panel | Vanilla JS + HTML/CSS |
| Testing | Vitest |
| CI/CD | GitHub Actions + Wrangler |

## Project Structure

```
/
├── admin/                          # Admin panel (frontend)
│   ├── index.html / login.html     # Pages
│   ├── js/                         # Client-side JS
│   └── css/                        # Styles
├── backend/worker/                 # Cloudflare Worker
│   ├── src/
│   │   ├── handlers/               # Request handlers
│   │   ├── services/
│   │   │   ├── nexus/              # AI engine & tools
│   │   │   ├── interview/v2/       # Interview subsystem
│   │   │   ├── whatsapp/           # WhatsApp integration
│   │   │   ├── events/             # Event system
│   │   │   ├── notifications/      # Notification system
│   │   │   └── business/           # CRM services
│   │   ├── middleware/             # Auth, CORS
│   │   └── router.js               # Request routing
│   ├── supabase/                   # DB migrations
│   ├── docs/                       # Technical docs
│   └── wrangler.toml               # Worker configuration
├── css/                            # Shared styles
├── js/                             # Shared JS
├── database/                       # Database scripts
├── docs/                           # Repository docs
│   ├── architecture.md             # Full architecture
│   ├── nexus-engine.md             # AI engine docs
│   ├── tools.md                    # Tool system
│   ├── whatsapp.md                 # WhatsApp integration
│   ├── crm.md                      # CRM documentation
│   └── release-checklist.md        # Release checklist
├── .github/workflows/              # CI/CD pipeline
├── .env.example                    # Environment variables
├── .gitignore
└── README.md
```

## Local Installation

### Prerequisites

- Node.js 22+
- npm
- Wrangler CLI (`npm install -g wrangler`)
- A Supabase project
- An OpenRouter API key
- A Meta WhatsApp Business account

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/your-org/tecno-san-juan.git
cd tecno-san-juan

# 2. Install dependencies
cd backend/worker
npm install

# 3. Configure environment variables
cp ../../.env.example .dev.vars
# Edit .dev.vars with your real credentials:
# - SUPABASE_URL
# - SUPABASE_ANON_KEY
# - SUPABASE_SERVICE_ROLE_KEY
# - OPENROUTER_API_KEY
# - WHATSAPP_TOKEN
# - WHATSAPP_PHONE_NUMBER_ID
# - WHATSAPP_APP_SECRET
# - WEBHOOK_VERIFY_TOKEN
# - JWT_SECRET

# 4. Update wrangler.toml if needed
# Set KV namespace IDs for SESSION_KV

# 5. Start dev server
npm run dev

# 6. Run tests
npm test
```

### Deploy

```bash
# Configure secrets
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put WHATSAPP_TOKEN
npx wrangler secret put WHATSAPP_APP_SECRET
npx wrangler secret put JWT_SECRET

# Deploy
npx wrangler deploy --env production
```

Or push to `main` (triggers GitHub Actions auto-deploy).

## Environment Variables

See [.env.example](.env.example) for the complete list of required variables.

**Critical secrets** (never commit):
- `OPENROUTER_API_KEY` — OpenRouter API key
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (bypasses RLS)
- `WHATSAPP_TOKEN` — Meta WhatsApp access token
- `WHATSAPP_APP_SECRET` — Meta app secret for webhook verification
- `JWT_SECRET` — JWT signing secret

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage
npx vitest --coverage
```

**1369 tests** across 71 test files — all passing.

## Modules

### Nexus Core
- **ChatRuntime** — Orchestrates message flow (interview vs AI)
- **NexusAIEngine** — AI engine with tool-calling support
- **ToolRegistry / ToolExecutor** — Tool registration and execution
- **PlanningEngine** — Intent detection and action planning
- **ContextManager** — Session and conversation context
- **ProfileManager** — User profiles and permissions

### Interview v2
Declarative interview system driven by JSON service definitions. Adding a new service requires only creating a JSON file — no code changes.

### WhatsApp Integration
Full webhook handling with signature verification, message parsing, media handling, and outbound messaging via Meta Cloud API.

### CRM
Client management, conversation tracking, budget/quote generation, repair orders, and 3D printing service management.

### Events & Notifications
Event-driven architecture with in-memory bus, queued processing, and multi-channel notifications (WhatsApp, email).

### Admin Panel
Browser-based admin dashboard for conversation management, client lookup, and system administration.

## Documentation

- [Architecture](docs/architecture.md)
- [NexusAI Engine](docs/nexus-engine.md)
- [Tool System](docs/tools.md)
- [WhatsApp Integration](docs/whatsapp.md)
- [CRM](docs/crm.md)
- [Release Checklist](docs/release-checklist.md)
- [Interview v2 Schema Spec](backend/worker/src/services/interview/v2/SCHEMA_SPECIFICATION.md)

## License

Private — Tecno San Juan
