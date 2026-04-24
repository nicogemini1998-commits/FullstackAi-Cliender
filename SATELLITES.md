# FullStackAI Satellites — Ecosystem Projects

FullStackAI acts as the **maestro project** for a growing ecosystem of satellite tools. Each satellite is an independent repository but shares database, APIs, and templates with FullStackAI.

## Satellite Pattern

```
FullStackAI (Maestro)
├─ Templates (canvas nodes, defaults)
├─ Database (PostgreSQL — shared schema)
├─ Credentials (.env — shared APIs)
├─ Migrations (version control of schema)
│
└─ Satellites (Independent Repos)
   ├─ LeadUp-Standalone (lead enrichment)
   ├─ [Analytics] (future)
   ├─ [Automation] (future)
   └─ [Integrations] (future)
```

Each satellite:
- **Has its own git repo** (cloneable, independently deployable)
- **Reads templates from FullStackAI** (canvas definitions, node types)
- **Shares database** (same PostgreSQL, separate schema when possible)
- **Shares credentials** (API keys from FullStackAI .env)
- **Documents relationship** (CLAUDE.md explains dependencies)

## Current Satellites

### LeadUp-Standalone

Lead intelligence platform. Apollo + Google Maps + web scraping + Claude analysis.

- **Repo:** `/Users/nicolasag/LeadUp-Standalone/`
- **Status:** Production (:8002)
- **DB:** `fullstackai.leadup` schema (shared)
- **Template:** Seeded via `scripts/seed_leadup_template.sql`
- **Dependencies:** FullStackAI database, API keys, template definitions

**Working in LeadUp?** 
```bash
cd ../LeadUp-Standalone && npm run dev
```

See `LeadUp-Standalone/CLAUDE.md` for development details.

## Adding a New Satellite

When you build a new tool that should be satellite of FullStackAI:

1. Create new directory: `/Users/nicolasag/ToolName-Standalone/`
2. Initialize git: `git init` + config
3. Copy code + scripts
4. Create `CLAUDE.md` explaining relationship to FullStackAI
5. Create `README.md` with setup instructions
6. Add to this list
7. Document in memory (see below)

### Template

Create `CLAUDE.md` that includes:
- Diagram showing relationship to FullStackAI
- Database schema (which tables it uses)
- Setup instructions (which FullStackAI scripts to run)
- Development workflow (how to run locally)
- Common tasks (npm scripts, etc.)

## Database Strategy

Shared PostgreSQL, **separate schemas by satellite** where possible:

```sql
-- FullStackAI core
CREATE SCHEMA public;

-- LeadUp data
CREATE SCHEMA leadup;
  ├─ flow
  ├─ flow_nodes
  ├─ flow_runs
  └─ lead_results

-- Future satellite [Analytics]
CREATE SCHEMA analytics;

-- Future satellite [Automation]
CREATE SCHEMA automation;
```

Prevents accidental schema conflicts. Master migrations live in `FullStackAI/migrations/`.

## Development Workflow

### Scenario 1: Working only on LeadUp

```bash
# Terminal 1 — FullStackAI database + services
cd FullStackAI && npm run dev

# Terminal 2 — LeadUp backend
cd LeadUp-Standalone && npm run dev:backend

# Terminal 3 — LeadUp frontend
cd LeadUp-Standalone && npm run dev:frontend
```

### Scenario 2: Updating template (affects all satellites)

```bash
# Make changes to template SQL in FullStackAI
cd FullStackAI
vim scripts/seed_leadup_template.sql

# Re-seed in database
psql -U fai_user -d fullstackai -f scripts/seed_leadup_template.sql

# Satellites pick up changes automatically (they query templates from DB)
```

### Scenario 3: Adding new satellite

1. Create directory + git repo
2. Copy relevant code from FullStackAI
3. Extract shared scripts (migrations, seed files)
4. Create CLAUDE.md
5. Test that it works independently
6. Add to SATELLITES.md + memory

## Credentials & Secrets

All satellites share FullStackAI `.env`. Never duplicate:

```bash
# ✅ Correct: Read from shared location
CLAUDE_API_KEY=<from FullStackAI/.env>

# ❌ Wrong: Copy to each satellite
# LeadUp/.env (don't do this)
```

Each satellite's setup docs should say: "Copy `.env` from FullStackAI or export variables."

## Deployment

Each satellite deploys independently **but uses shared infrastructure:**

```
FullStackAI (:3001 main server)
LeadUp-Standalone (:8002 independent backend)
[Analytics] (:8003 future)
```

systemd services reference shared database. See `deploy/` for nginx config.

## Memory Integration

Satellites should be documented in Claude Code memory so context persists:

- `project_cliender_os.md` — Cliender OS (Canvas Infinito)
- `leadup_progress.md` — LeadUp (linked to FullStackAI)
- `project_satellites.md` — This pattern + new satellites as they're created

---

**Established:** 2026-04-22  
**Pattern:** Satellite repos (independent) + maestro templates (FullStackAI shared)  
**Maintainer:** Nicolas Cliender
