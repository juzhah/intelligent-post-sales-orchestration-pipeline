# RevAuto — Autonomous Lifecycle Engine

## Architecture Document

> **Version:** 2.0
> **Last Updated:** March 2026
> **Target Role:** AI Automation Engineer — Birdview PSA
> **Stack:** N8N · Express.js · Pinecone · Claude 3.5 Sonnet · HubSpot · Google Drive · Slack · Docker

---

## Table of Contents

1. [The Problem](#1-the-problem)
2. [The Solution](#2-the-solution)
3. [System Architecture Overview](#3-system-architecture-overview)
4. [Component Deep Dive](#4-component-deep-dive)
5. [Data Flow — End to End](#5-data-flow--end-to-end)
6. [N8N Workflow — Node by Node](#6-n8n-workflow--node-by-node)
7. [Express.js API — Endpoints](#7-expressjs-api--endpoints)
8. [Claude AI — Prompt Engineering](#8-claude-ai--prompt-engineering)
9. [RAG Pipeline — Pinecone](#9-rag-pipeline--pinecone)
10. [Google Drive — iPaaS Document Layer](#10-google-drive--ipaas-document-layer)
11. [Slack — Block Kit Output](#11-slack--block-kit-output)
12. [Guardrails and Safety](#12-guardrails-and-safety)
13. [Docker Infrastructure](#13-docker-infrastructure)
14. [Environment Variables](#14-environment-variables)
15. [Folder Structure](#15-folder-structure)
16. [Cost Analysis](#16-cost-analysis)
17. [Known Limitations and Production Roadmap](#17-known-limitations-and-production-roadmap)

---

## 1. The Problem

### The "Context Gap" in B2B SaaS

In most B2B SaaS companies, two teams operate on opposite sides of the customer lifecycle. **Sales** finds customers, pitches, negotiates, and closes contracts. **Delivery** (PMs, onboarding specialists, customer success) takes over after the contract is signed and actually implements the product.

The handoff between these teams is where deals go to die.

**What happens today:**

When a sales rep closes a $50K deal, their job ends. The PM who inherits the client knows almost nothing. The sales rep spent weeks learning about the client — their industry, pain points, technical environment, budget constraints, promises made during negotiation — but that context lives scattered across CRM notes, email threads, and the rep's memory. None of it is structured. None of it is actionable.

The PM's first day on the account looks like this:

1. Google the client's company, read their website, try to infer their industry and size.
2. Dig through HubSpot deal notes for custom requirements and commitments.
3. Hunt for the contract PDF in Google Drive, read it for SLAs and deliverables.
4. Cross-reference the company's onboarding playbook (a PDF buried somewhere) for standard requirements based on the client's industry and deal size.
5. Manually write a 30-day onboarding strategy and post it to Slack or email the team.

**Time cost:** 3–4 hours per deal. At 10–15 deals per month, that's 30–60 hours of senior PM time burned on research work that AI can do. At $50–$100/hour, that's $3,000–$6,000/month in wasted labor. Add client churn from missed requirements and delayed onboarding, and the total cost exceeds $10,000/month.

### Who Feels This Pain

RevAuto is built for professional services delivery teams — the exact customers that **Birdview PSA** serves. Consulting firms, software implementation partners, agencies, and internal delivery teams at large enterprises. They use PSA tools to manage projects. RevAuto automates the intelligence that feeds those projects.

---

## 2. The Solution

RevAuto is an AI-native orchestration layer that bridges the Sales-to-Delivery gap. It doesn't just move data between tools — it **researches, audits, strategizes, and documents** using AI reasoning grounded in the company's own standards.

**What RevAuto does in 15 seconds:**

The instant a deal is marked "Closed Won" in HubSpot, RevAuto automatically:

1. Grabs deal data from HubSpot (company name, deal size, contact info).
2. Scrapes the client's website to extract industry, company size, key services, and tech stack.
3. Queries a Pinecone vector database for relevant onboarding standards from the company's knowledge base.
4. Sends all three data sources to Claude 3.5 Sonnet, which cross-references them and generates a risk audit + 30-day phased delivery strategy.
5. Checks Claude's confidence score — if it's low, routes to human review instead of the main channel.
6. Generates a professionally formatted PDF briefing document.
7. Creates a dedicated client folder in Google Drive and uploads the briefing PDF.
8. Posts a structured Slack notification with the risk audit, strategy, and direct links to both HubSpot and the Google Drive folder.

**Time cost with RevAuto:** Under 2 minutes for the PM to review and act.

**Running cost:** Less than $50/month.

---

## 3. System Architecture Overview

### Architecture Diagram (ASCII)

```
┌─────────────┐     webhook      ┌─────────────┐     HTTP POST      ┌─────────────────┐
│             │  ──────────────► │             │  ────────────────► │                 │
│   HubSpot   │   deal.won       │     N8N     │   /api/scrape      │  Express.js API  │
│    (CRM)    │                  │ Orchestrator │ ◄────────────────  │  (Scraper + PDF) │
│             │                  │             │   structured JSON   │                 │
└─────────────┘                  │             │                    └────────┬────────┘
                                 │             │                             │
                                 │             │     /api/generate-pdf       │
                                 │             │  ────────────────►          │
                                 │             │ ◄────────────────           │
                                 │             │   PDF binary buffer         │
                                 │             │                    ┌────────┴────────┐
                                 │             │   embed + query    │                 │
                                 │             │ ──────────────────►│    Pinecone     │
                                 │             │ ◄──────────────────│   (Vector DB)   │
                                 │             │  matched chunks    │                 │
                                 │             │                    └─────────────────┘
                                 │             │
                                 │             │   prompt + context  ┌─────────────────┐
                                 │             │ ──────────────────►│                 │
                                 │             │ ◄──────────────────│  Claude 3.5     │
                                 │             │   structured JSON   │  Sonnet (AI)    │
                                 │             │                    └─────────────────┘
                                 │             │
                                 │             │   create folder +   ┌─────────────────┐
                                 │             │   upload PDF        │                 │
                                 │             │ ──────────────────►│  Google Drive    │
                                 │             │ ◄──────────────────│  (iPaaS Layer)  │
                                 │             │   folder URL        │                 │
                                 │             │                    └─────────────────┘
                                 │             │
                                 │             │   Block Kit msg     ┌─────────────────┐
                                 │             │ ──────────────────►│                 │
                                 │             │                    │     Slack        │
                                 │             │                    │   (Output)       │
                                 └─────────────┘                    └─────────────────┘

                                 ┌─────────────────────────────────────────────────────┐
                                 │               Docker Compose                        │
                                 │  ┌───────────┐           ┌──────────────────┐       │
                                 │  │   N8N     │◄────────►│  Express.js API  │       │
                                 │  │ :5678     │  revauto  │  :3000 (internal)│       │
                                 │  └───────────┘   -net    └──────────────────┘       │
                                 └─────────────────────────────────────────────────────┘
```

### Component Summary

| Component         | Role                                               | Self-hosted? | Layer          |
| ----------------- | -------------------------------------------------- | ------------ | -------------- |
| HubSpot           | CRM trigger — fires webhook on "Closed Won"        | No (SaaS)    | Trigger        |
| N8N               | Workflow orchestrator — the central nervous system | Yes (Docker) | Orchestration  |
| Express.js API    | Scraping utility + PDF generation                  | Yes (Docker) | Compute        |
| Pinecone          | Vector database for RAG knowledge retrieval        | No (SaaS)    | Memory         |
| Claude 3.5 Sonnet | AI reasoning engine — risk audit + strategy        | No (SaaS)    | Intelligence   |
| Google Drive      | Client folder creation + PDF storage               | No (SaaS)    | Document/iPaaS |
| Slack             | Formatted output to delivery team                  | No (SaaS)    | Output         |
| Docker Compose    | Infrastructure — one-command deployment            | Local        | Infrastructure |

---

## 4. Component Deep Dive

### 4.1 HubSpot CRM — Event Source

HubSpot is the single entry point for the entire pipeline. When a sales rep moves a deal to the "Closed Won" stage, HubSpot fires a webhook to N8N. No polling, no cron jobs — pure event-driven architecture.

**Setup requirements:**

- HubSpot Free Developer account with a Developer Test Account (sandbox CRM).
- A deal pipeline with stages including "Closed Won" (internal value: `closedwon`).
- A Private App with scopes: `crm.objects.deals.read`, `crm.objects.contacts.read`, `crm.objects.companies.read`.
- Test deal associated with a Company (must have a real website domain) and a Contact.

**Webhook payload includes:** dealId, dealName, companyName, companyDomain, amount, contactName, contactEmail, closeDate, and any custom deal properties.

### 4.2 N8N — Workflow Orchestrator

N8N is the only component that communicates with every other service. It receives the HubSpot webhook, calls Express for scraping and PDF generation, queries Pinecone for RAG, sends the prompt to Claude, creates the Google Drive folder, uploads the PDF, checks confidence, and posts to Slack.

**Why N8N over Zapier/Make:** Self-hosted (no vendor lock-in), visual workflow builder (non-technical stakeholders can read it), native nodes for Anthropic/Pinecone/Google Drive/Slack/HubSpot, and it runs in Docker alongside the Express API.

**Why most logic lives in N8N:** For an AI Automation Engineer role, a rich N8N canvas with 12 nodes doing real AI work is a stronger signal than "call Express and wait." The interviewer opens the canvas and sees the entire brain of the system in one screen.

### 4.3 Express.js API — Compute Layer

Express handles the two tasks that are better suited to dedicated backend code than N8N Code nodes: website scraping (with proper error handling, retries, HTML parsing via Cheerio) and PDF document generation (with full layout control via PDFKit or similar).

**Two endpoints, one service, zero AI calls.** Claude is called via N8N's native Anthropic node. Pinecone is queried via N8N's native vector store node. Express does compute; N8N does orchestration and AI.

### 4.4 Pinecone — Long-Term Memory (RAG)

Pinecone stores the company's "Global Onboarding Standards" PDF as vector embeddings. At retrieval time (when a deal is won), N8N queries Pinecone for the chunks most semantically relevant to the client's profile. These chunks are injected into Claude's prompt as grounding context.

**Index configuration:** name = `nexus-knowledge`, dimension = 1024, metric = cosine, type = serverless (AWS us-east-1). Namespace = `onboarding-standards`. Embedding model = Pinecone Inference API (`multilingual-e5-large`). Chunking strategy = 512 tokens per chunk, 50-token overlap.

**Why RAG matters:** Without RAG, Claude generates generic advice. With RAG, Claude cross-references the client profile against the company's actual onboarding standards and produces gap analysis specific to that deal. That's the difference between "nice AI demo" and "actionable business tool."

### 4.5 Claude 3.5 Sonnet — AI Reasoning Engine

Claude is the intelligence layer. Called via N8N's native Anthropic node (not through Express). Receives a structured prompt with three data sources: HubSpot deal data, scraped website context, and RAG-retrieved onboarding standards. Outputs structured JSON containing a confidence score, risk audit across five categories, a 30-day phased delivery strategy, and flagged items for human review.

**Temperature: 0.2–0.3.** This is deterministic structured analysis, not creative writing.

### 4.6 Google Drive — iPaaS Document Layer

Google Drive transforms RevAuto from a notification tool into an operational platform. Every closed deal gets a dedicated folder in Google Drive with a professionally formatted briefing PDF. The PM has a persistent workspace for each client from day one — ready for contracts, meeting notes, and deliverables to be added later.

**Folder structure:**

```
Google Drive/
└── RevAuto/
    └── Clients/
        ├── Acme Corp — Enterprise Onboarding (2026-03-06)/
        │   └── RevAuto_Briefing_AcmeCorp_2026-03-06.pdf
        ├── GlobalTech — Platform Migration (2026-03-10)/
        │   └── RevAuto_Briefing_GlobalTech_2026-03-10.pdf
        └── ...
```

### 4.7 Slack — Delivery Output

The final human-facing output. A richly formatted Block Kit message posted to `#onboarding-alerts` (or `#human-review` for low-confidence results). Contains: deal summary, confidence bar, risk audit with severity emojis, 30-day strategy, and action buttons including "View in HubSpot," "View Client Folder" (Google Drive link), and "Acknowledge."

---

## 5. Data Flow — End to End

```
Step 1  │ Sales rep moves deal to "Closed Won" in HubSpot
        │ Webhook fires with deal payload (JSON)
        ▼
Step 2  │ N8N Webhook node receives payload
        │ Extracts companyDomain, dealName, amount, contact info
        ▼
Step 3  │ N8N sends POST /api/scrape to Express API
        │ Express scrapes 5 pages (/, /about, /services, /solutions, /team)
        │ Returns: industry, companySizeIndicator, keyServices, techStack, summary
        ▼
Step 4  │ N8N queries Pinecone Vector Store
        │ Query: "Onboarding requirements for {industry} client with deal value {amount}"
        │ Returns: top 5 matched text chunks with similarity scores
        ▼
Step 5  │ N8N Code node assembles Claude prompt from three sources:
        │   Section 1: Deal Information (HubSpot data)
        │   Section 2: Client Website Context (scraper output)
        │   Section 3: Internal Onboarding Standards (RAG chunks)
        ▼
Step 6  │ N8N Anthropic node sends prompt to Claude 3.5 Sonnet
        │ Claude returns structured JSON:
        │   { confidenceScore, riskAudit, deliveryStrategy, flaggedRisks }
        ▼
Step 7  │ N8N Code node parses and validates Claude's response
        │ If JSON parsing fails → fallback object with confidenceScore 0.3
        │ Pipeline never silently fails
        ▼
Step 8  │ N8N sends POST /api/generate-pdf to Express API
        │ Express receives Claude output + deal info
        │ Generates branded PDF briefing document
        │ Returns PDF binary buffer
        ▼
Step 9  │ N8N Google Drive node creates client folder
        │ Parent: RevAuto/Clients/ (hardcoded folder ID)
        │ Name: "{CompanyName} — {DealName} ({Date})"
        │ Returns: folder ID + folder URL
        ▼
Step 10 │ N8N Google Drive node uploads PDF to new folder
        │ File: RevAuto_Briefing_{CompanyName}_{Date}.pdf
        │ Returns: file URL
        ▼
Step 11 │ N8N IF node checks guardrails
        │ Condition: confidenceScore >= 0.7 AND flaggedRisks.length <= 3
        │ TRUE  → Step 12a (main channel)
        │ FALSE → Step 12b (human review channel)
        ▼
Step 12 │ N8N Slack node posts Block Kit message
        │ Includes: deal summary, risk audit, strategy, confidence bar
        │ Buttons: "View in HubSpot" + "View Client Folder" + "Acknowledge"
        │ Pipeline complete.
```

**Total latency estimate:** ~10–20 seconds end to end. Scraping is the bottleneck (~5–8s). Claude analysis ~2–4s. Pinecone query <500ms. PDF generation ~1–2s. Google Drive operations ~1–2s. Acceptable for a non-real-time onboarding workflow.

---

## 6. N8N Workflow — Node by Node

### Main Pipeline (12 nodes)

**Node 1: HubSpot Trigger**

- Type: HubSpot Trigger (native)
- Event: Deal stage changed to "closedwon"
- Output: dealId, dealName, companyName, companyDomain, amount, contactName, contactEmail

**Node 2: HTTP Request — Scrape Client Website**

- Type: HTTP Request
- Method: POST
- URL: `http://nexus-api:3000/api/scrape`
- Body: `{ "domain": "{{ $json.companyDomain }}" }`
- Output: structured scraping result (industry, size, services, techStack, summary)

**Node 3: Pinecone Vector Store — Retrieve Standards**

- Type: Pinecone Vector Store (AI toolkit)
- Operation: Query
- Index: `nexus-knowledge`
- Namespace: `onboarding-standards`
- TopK: 5
- Query: `"Onboarding requirements for {{ $node['HTTP Request'].json.industry }} client with deal value {{ $node['HubSpot Trigger'].json.amount }}"`
- Connected sub-node: Embeddings model (Pinecone Inference or OpenAI)
- Output: matched text chunks with similarity scores

**Node 4: Code Node — Build Claude Prompt**

- Type: Code (JavaScript)
- Assembles user prompt from three data sources: deal info (Node 1), scraped context (Node 2), RAG chunks (Node 3)
- Embeds the JSON output schema Claude must follow
- Output: single string `userPrompt`

**Node 5: Anthropic (Claude) Node — AI Analysis**

- Type: Anthropic (native)
- Model: `claude-3-5-sonnet-20241022`
- System prompt: Lead Consultant persona + JSON schema + rules
- User message: assembled prompt from Node 4
- Temperature: 0.2–0.3
- Max tokens: 4096
- Output: Claude's JSON response as text

**Node 6: Code Node — Parse and Validate Response**

- Type: Code (JavaScript)
- Strips markdown code fences (`\`\`\`json ... \`\`\``)
- Attempts `JSON.parse()`
- If success: passes structured object downstream
- If failure: returns fallback `{ confidenceScore: 0.3, overallRiskLevel: "CRITICAL", flaggedRisks: ["AI response parsing failed"] }`
- Output: validated JSON object

**Node 7: HTTP Request — Generate PDF**

- Type: HTTP Request
- Method: POST
- URL: `http://nexus-api:3000/api/generate-pdf`
- Body: `{ dealInfo: {...}, riskAudit: {...}, deliveryStrategy: {...}, clientContext: {...}, confidenceScore: 0.85 }`
- Response type: Binary (PDF file)
- Output: PDF buffer

**Node 8: Google Drive — Create Client Folder**

- Type: Google Drive (native)
- Operation: Create Folder
- Parent folder ID: hardcoded RevAuto/Clients/ folder ID
- Folder name: `{{ $node['HubSpot Trigger'].json.companyName }} — {{ $node['HubSpot Trigger'].json.dealName }} ({{ $now.format('yyyy-MM-dd') }})`
- Output: folder ID, folder URL (`webViewLink`)

**Node 9: Google Drive — Upload PDF**

- Type: Google Drive (native)
- Operation: Upload File
- Parent folder: folder ID from Node 8
- File name: `RevAuto_Briefing_{{ $node['HubSpot Trigger'].json.companyName }}_{{ $now.format('yyyy-MM-dd') }}.pdf`
- Input: binary data from Node 7
- Output: file ID, file URL

**Node 10: IF Node — Confidence Check**

- Type: IF
- Condition: `{{ $node['Code — Parse'].json.confidenceScore }} >= 0.7` AND `{{ $node['Code — Parse'].json.flaggedRisks.length }} <= 3`
- TRUE → Node 11
- FALSE → Node 12

**Node 11: Slack — Main Notification (#onboarding-alerts)**

- Type: Slack (native)
- Channel: `#onboarding-alerts`
- Message: Block Kit JSON with deal summary, confidence bar, risk audit, strategy, and action buttons including "View Client Folder" with the Google Drive URL from Node 8

**Node 12: Slack — Human Review (#human-review)**

- Type: Slack (native)
- Channel: `#human-review`
- Message: Same Block Kit structure as Node 11 but with "HUMAN REVIEW REQUIRED" header, reason for escalation, and "Assign Reviewer" button

### Ingestion Pipeline (3 nodes, run once)

**Node A: Manual Trigger**

- Click-to-run. No external trigger needed.

**Node B: Document Loader + Text Splitter**

- Reads the Global Onboarding Standards PDF
- Splits into chunks: 512 tokens, 50-token overlap
- Preserves source metadata

**Node C: Pinecone Vector Store — Insert**

- Embeds each chunk via connected embeddings sub-node
- Upserts to index `nexus-knowledge`, namespace `onboarding-standards`

---

## 7. Express.js API — Endpoints

### `POST /api/scrape`

Accepts a domain, scrapes the client's website, returns structured context.

**Request:**

```json
{ "domain": "acmetech.com" }
```

**Process:**

1. Normalizes domain (prepends `https://` if missing)
2. Fetches 5 pages: `/`, `/about`, `/services`, `/solutions`, `/team`
3. Uses Axios with 15-second timeout and realistic User-Agent header
4. Parses each page with Cheerio: extracts title, meta description, h1, body text (capped at 3000 chars/page)
5. Detects industry via keyword pattern matching against extracted text
6. Detects company size from contextual phrases
7. Extracts key services from recurring headings (h2, h3)
8. Detects tech stack from HTML source (meta generators, framework signatures, script tags)

**Response:**

```json
{
  "domain": "acmetech.com",
  "pagesScraped": 5,
  "industry": "Technology / SaaS",
  "companySizeIndicator": "Mid-Market (100-999)",
  "keyServices": ["API Platform", "Cloud Solutions"],
  "techStack": ["Next.js", "React", "Node.js"],
  "summary": "Industry: Technology / SaaS. Company size: Mid-Market. Key offerings: API Platform, Cloud Solutions. Tech stack: Next.js, React, Node.js. 5 pages analyzed.",
  "scrapedAt": "2026-03-06T14:30:00Z"
}
```

**Error handling:** If a page returns 4xx/5xx or times out, the scraper skips it and continues. If all pages fail, returns a response with `pagesScraped: 0` and `summary: "Website unreachable — no data extracted"`. The pipeline continues but this sparse data will lower Claude's confidence score, triggering the human review route.

### `POST /api/generate-pdf`

Accepts Claude's analysis output and deal information. Returns a branded PDF document.

**Request:**

```json
{
  "dealInfo": {
    "dealName": "Acme Corp Onboarding",
    "companyName": "Acme Corp",
    "amount": 50000,
    "contactName": "María López",
    "contactEmail": "maria@acmetech.com",
    "closeDate": "2026-03-06"
  },
  "clientContext": {
    "industry": "Technology / SaaS",
    "companySizeIndicator": "Mid-Market",
    "keyServices": ["API Platform", "Cloud Solutions"],
    "techStack": ["Next.js", "React"]
  },
  "confidenceScore": 0.85,
  "riskAudit": { "...full risk audit object..." },
  "deliveryStrategy": { "...full strategy object..." }
}
```

**PDF contents:**

- Branded header: "RevAuto — Client Onboarding Briefing"
- Deal summary section: company name, deal value, contact, close date
- Client profile section: industry, size, tech stack, key services (from scraper)
- AI confidence score with visual indicator
- Risk audit: each risk with category, severity, description, mitigation, and owner
- 30-day phased strategy: objectives, key actions, deliverables, risk checkpoints per phase
- Footer: generation timestamp, pipeline version

**Response:** Binary PDF buffer with `Content-Type: application/pdf`

### `GET /api/health`

Returns service status for Docker healthcheck.

**Response:**

```json
{ "status": "ok", "timestamp": "2026-03-06T14:30:00Z" }
```

---

## 8. Claude AI — Prompt Engineering

### System Prompt

```
You are the NEXUS Lead Consultant — an AI onboarding strategist for a professional
services automation (PSA) company. Your role is to analyze newly won deals and
generate actionable onboarding plans grounded in the company's internal standards.

You understand that the post-sales delivery phase is critical. The "Sales-to-Delivery
gap" is where most client relationships either succeed or fail. Your analysis must
bridge this gap.

CRITICAL RULES:
1. Always output valid JSON matching the exact schema provided below.
2. Assign a confidence score (0.0 to 1.0) based on data completeness, consistency
   between sources, clarity of requirements, and alignment with internal standards.
3. If you lack sufficient data to make a recommendation, flag it — never fabricate.
4. Focus exclusively on DELIVERY risks, not sales risks.
5. Every recommendation must be actionable within 30 days.
6. Analyze risks across five categories: Technical, Process, Communication, Scope,
   and Resource.

CONFIDENCE SCORING GUIDE:
- Raise confidence: rich website data, complete HubSpot deal fields, relevant RAG
  matches, consistent story across all three data sources.
- Lower confidence: sparse/generic website, missing HubSpot fields, no relevant
  standards matched, contradictory data between sources, ambiguous requirements.
```

### User Prompt Template

The Code node (Node 4) assembles this from three data sources:

```
Analyze this newly won deal and generate an onboarding strategy.

## DEAL INFORMATION
- Deal Name: {dealName}
- Company: {companyName}
- Deal Value: ${amount}
- Primary Contact: {contactName} ({contactEmail})
- Close Date: {closeDate}
- Additional Properties: {customProperties}

## CLIENT WEBSITE CONTEXT
- Industry: {industry}
- Company Size: {companySizeIndicator}
- Key Services: {keyServices}
- Tech Stack: {techStack}
- Pages Analyzed: {pagesScraped}
- Summary: {summary}

## INTERNAL ONBOARDING STANDARDS (from Knowledge Base)
{ragChunk1}
---
{ragChunk2}
---
{ragChunk3}
---
{ragChunk4}
---
{ragChunk5}

## INSTRUCTIONS
1. Cross-reference the client profile against our onboarding standards.
2. Identify delivery risks specific to this client.
3. Create a 30-day phased delivery strategy.
4. Flag any items where you are uncertain — these need human review.
5. Consider the deal size when scoping the onboarding effort.

Respond ONLY with the JSON object. No additional text.
```

### Output JSON Schema

```json
{
  "confidenceScore": 0.85,
  "riskAudit": {
    "overallRiskLevel": "LOW | MEDIUM | HIGH | CRITICAL",
    "risks": [
      {
        "category": "Technical | Process | Communication | Scope | Resource",
        "severity": "LOW | MEDIUM | HIGH | CRITICAL",
        "description": "What the risk is",
        "mitigation": "How to address it",
        "owner": "PM | Technical Lead | Account Manager"
      }
    ],
    "summary": "Brief overview of the risk landscape"
  },
  "deliveryStrategy": {
    "phases": [
      {
        "name": "Phase name",
        "days": "1-7",
        "objectives": ["What we accomplish"],
        "keyActions": ["Specific steps"],
        "deliverables": ["What the client receives"],
        "riskCheckpoint": "What we validate at end of phase"
      }
    ],
    "criticalMilestones": ["Key dates/events"],
    "escalationTriggers": ["Conditions that require escalation"]
  },
  "flaggedRisks": ["Items that require human review"]
}
```

### Five Risk Categories Explained

| Category      | What Claude Analyzes                                               | Example                                                                 |
| ------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Technical     | Will the client's systems integrate smoothly? Infrastructure gaps? | "Client uses Kubernetes, but our playbook assumes traditional servers." |
| Process       | Gaps in standard onboarding procedures for this client type?       | "Financial services client requires compliance docs before day 5."      |
| Communication | Is the client contact clear? Decision makers identified?           | "Only one contact listed — no technical champion identified."           |
| Scope         | Does the contract match what we can deliver?                       | "$50K deal but requirements suggest enterprise-level customization."    |
| Resource      | Do we have team capacity to execute?                               | "No dedicated DevOps resource allocated for this account."              |

---

## 9. RAG Pipeline — Pinecone

### Ingestion (One-Time)

```
PDF Document
    │
    ▼
Document Loader (N8N) ──► Text Splitter (512 tokens, 50 overlap)
    │
    ▼
Embedding Model (multilingual-e5-large via Pinecone Inference)
    │
    ▼
Pinecone Upsert ──► Index: nexus-knowledge / Namespace: onboarding-standards
```

### Retrieval (Every Deal)

```
Query: "Onboarding for {industry} client, deal value {amount}"
    │
    ▼
Embedding Model (same model, query mode)
    │
    ▼
Pinecone Query ──► Top 5 matches with similarity scores
    │
    ▼
Matched chunks injected into Claude's prompt as grounding context
```

### Why Separate Ingestion from Retrieval

Ingestion runs once per document update. Retrieval runs on every deal. By separating them, the system stays fast even as the knowledge base grows. Adding new documents (contract templates, industry playbooks, case studies) only requires re-running the ingestion workflow — no code changes needed.

---

## 10. Google Drive — iPaaS Document Layer

### Setup Requirements

1. Google Cloud Console: Create project, enable Google Drive API.
2. Create OAuth2 credentials (or service account).
3. In N8N: add Google Drive credential with OAuth2 keys, authorize access.
4. Manually create root folder structure: `RevAuto/Clients/` in Google Drive.
5. Save the `Clients` folder ID — hardcoded in Node 8 as the parent folder.

### Folder Naming Convention

```
{CompanyName} — {DealName} ({YYYY-MM-DD})
```

Example: `Acme Corp — Enterprise Onboarding (2026-03-06)`

### PDF Naming Convention

```
RevAuto_Briefing_{CompanyName}_{YYYY-MM-DD}.pdf
```

Example: `RevAuto_Briefing_AcmeCorp_2026-03-06.pdf`

### What the Folder Enables

Today, the folder contains just the briefing PDF. In production, it becomes the client's living workspace:

- Briefing PDF (auto-generated by RevAuto)
- Signed contract (uploaded manually or via future automation)
- Meeting notes (added by PM during onboarding)
- Deliverables and handoff documents
- Client communication archive

This is the iPaaS value: RevAuto doesn't just notify — it creates the **operational infrastructure** for the onboarding.

---

## 11. Slack — Block Kit Output

### Message Structure

```
┌─────────────────────────────────────────────┐
│  🚀 RevAuto — New Deal Onboarding           │
├─────────────────────────────────────────────┤
│  Deal: Acme Corp Onboarding                 │
│  Company: Acme Corp                         │
│  Value: $50,000        Contact: M. López    │
├─────────────────────────────────────────────┤
│  AI Confidence: ████████░░ 85%              │
├─────────────────────────────────────────────┤
│  🟢 Risk Audit — MEDIUM Risk                │
│                                             │
│  🟡 [Technical] Client uses Kubernetes...   │
│     ↳ Schedule DevOps review on day 3       │
│                                             │
│  🟢 [Process] Standard SaaS onboarding...   │
│     ↳ Follow Tier 2 playbook               │
├─────────────────────────────────────────────┤
│  📋 30-Day Delivery Strategy                │
│                                             │
│  Discovery & Kickoff (Days 1-7)             │
│     Stakeholder mapping, requirements...    │
│                                             │
│  Technical Setup (Days 8-14)                │
│     Integrations, data migration...         │
│                                             │
│  Training & Config (Days 15-21)             │
│     User training, workflow setup...        │
│                                             │
│  Go-Live & Handoff (Days 22-30)             │
│     Monitoring, success criteria...         │
├─────────────────────────────────────────────┤
│  🚨 Escalation Triggers: milestone miss...  │
├─────────────────────────────────────────────┤
│  [📊 View in HubSpot] [📁 View Client       │
│   Folder] [✅ Acknowledge]                  │
├─────────────────────────────────────────────┤
│  Powered by RevAuto AI · Generated at ...   │
└─────────────────────────────────────────────┘
```

### Human Review Variant

Same structure, but with:

- Warning header: "⚠️ HUMAN REVIEW REQUIRED"
- Reason: "AI confidence below threshold (65%)" or "Multiple risks detected (5 flags)"
- Additional button: "👤 Assign Reviewer"
- Posted to `#human-review` channel instead of `#onboarding-alerts`

---

## 12. Guardrails and Safety

### Layer 1: Confidence Scoring

Claude self-rates its analysis from 0.0 to 1.0 based on data quality. This is not random — the system prompt includes specific guidance on what raises and lowers confidence.

### Layer 2: Risk Audit

Claude analyzes the deal across five categories (Technical, Process, Communication, Scope, Resource). Each risk gets a severity level (LOW / MEDIUM / HIGH / CRITICAL), a description, a mitigation strategy, and an owner.

### Layer 3: Human Routing (IF Node)

```
IF confidenceScore >= 0.7 AND flaggedRisks.length <= 3:
    → Post to #onboarding-alerts (main workflow)
ELSE:
    → Post to #human-review (escalation workflow)
```

Low-confidence outputs get human eyes before they affect the client.

### Layer 4: JSON Parse Safety

If Claude's response fails JSON parsing (malformed output), the Code node constructs a fallback:

```json
{
  "confidenceScore": 0.3,
  "riskAudit": {
    "overallRiskLevel": "CRITICAL",
    "risks": [
      {
        "category": "Process",
        "severity": "CRITICAL",
        "description": "AI analysis could not be parsed",
        "mitigation": "Full manual review required",
        "owner": "PM"
      }
    ],
    "summary": "Automated analysis failed."
  },
  "flaggedRisks": ["AI response parsing failed — full human review required"]
}
```

The pipeline **never silently fails.** Every path produces output.

### Layer 5: Rate Limiting

Express API limits requests to 30/minute per IP. Prevents abuse and protects downstream API costs (Anthropic, Pinecone).

### Layer 6: Scraper Fallback

If the client website is unreachable or returns no content, the scraper returns `pagesScraped: 0` with a sparse summary. This flows into Claude's prompt, which will detect the missing data and lower its confidence score, triggering the human review route automatically.

---

## 13. Docker Infrastructure

### docker-compose.yml

```yaml
version: "3.8"
services:
  n8n:
    image: n8nio/n8n:latest
    ports:
      - "5678:5678"
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=revauto2024
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - PINECONE_API_KEY=${PINECONE_API_KEY}
      - SLACK_BOT_TOKEN=${SLACK_BOT_TOKEN}
    volumes:
      - n8n_data:/home/node/.n8n
    networks:
      - revauto-net
    restart: unless-stopped

  nexus-api:
    build: ./api
    environment:
      - NODE_ENV=production
    networks:
      - revauto-net
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  n8n_data:

networks:
  revauto-net:
    driver: bridge
```

### Dockerfile (api/)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
EXPOSE 3000
CMD ["node", "src/index.js"]
```

**Key design decisions:**

- N8N port 5678 is exposed externally (you need to access the UI).
- Express port 3000 is NOT exposed externally — only accessible within the Docker network via `http://nexus-api:3000`.
- Shared network `revauto-net` allows N8N to call Express by service name.
- N8N data persisted in a named volume so workflows survive container restarts.
- Healthcheck on Express ensures Docker restarts it if it crashes.

---

## 14. Environment Variables

| Variable            | Format       | Where Used            |
| ------------------- | ------------ | --------------------- |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | N8N → Claude node     |
| `PINECONE_API_KEY`  | `pcsk_...`   | N8N → Pinecone node   |
| `SLACK_BOT_TOKEN`   | `xoxb-...`   | N8N → Slack node      |
| `HUBSPOT_API_KEY`   | `pat-...`    | N8N → HubSpot trigger |

Google Drive credentials are configured directly in N8N's credential manager via OAuth2 flow — they are not stored in the `.env` file.

---

## 15. Folder Structure

```
revauto/
├── api/
│   ├── src/
│   │   ├── index.js              # Express server entry point
│   │   ├── routes/
│   │   │   └── scrape.js         # POST /api/scrape
│   │   ├── services/
│   │   │   ├── scraper.js        # Axios + Cheerio scraping logic
│   │   │   └── pdfGenerator.js   # PDF creation with PDFKit
│   │   └── middleware/
│   │       └── rateLimiter.js    # Express rate limiting
│   ├── package.json
│   └── Dockerfile
├── knowledge-base/
│   └── global-onboarding-standards.pdf
├── docker-compose.yml
├── .env
├── .gitignore
├── ARCHITECTURE.md
└── README.md
```

---

## 16. Cost Analysis

### Monthly Running Costs (Estimated)

| Service           | Cost            | Notes                                            |
| ----------------- | --------------- | ------------------------------------------------ |
| N8N               | $0              | Self-hosted (Docker)                             |
| Express.js API    | $0              | Self-hosted (Docker)                             |
| Pinecone          | $0              | Free Starter tier (sufficient for small index)   |
| Claude 3.5 Sonnet | ~$5–15          | ~$0.50–1.00 per deal analysis, 10-15 deals/month |
| HubSpot           | $0              | Free Developer account                           |
| Google Drive      | $0              | Free tier (15GB)                                 |
| Slack             | $0              | Free workspace                                   |
| **Total**         | **< $50/month** |                                                  |

### Value Delivered

| Metric                        | Without RevAuto          | With RevAuto                          |
| ----------------------------- | ------------------------ | ------------------------------------- |
| PM research time per deal     | 3–4 hours                | < 2 minutes (review only)             |
| Monthly PM hours burned       | 30–60 hours              | ~2–3 hours total                      |
| Cost of PM time wasted        | $3,000–$6,000/month      | ~$150/month                           |
| Client onboarding consistency | Variable (depends on PM) | Standardized (AI + company standards) |
| Missed requirement risk       | High                     | Low (systematic risk audit)           |

**ROI: 60x–120x return on running costs.**

---

## 17. Known Limitations and Production Roadmap

### Current Limitations

**Scraper uses keyword pattern matching.** The Express scraper detects industry, company size, and tech stack using hardcoded keyword lists. A company describing itself as "distributed systems platform" instead of "microservices" gets miscategorized. In production, replace the pattern matching with a Claude API call inside the scraper — cost is ~$0.02 per scrape, robustness improvement is significant.

**No data persistence.** Scraped data and Claude's analysis flow through the pipeline but are not stored permanently. In production, add a PostgreSQL database to store structured client data for future reference and analytics.

**Single-document RAG.** The knowledge base currently contains one PDF. Production would ingest contract templates, industry playbooks, case studies, and past delivery reports — each as a separate Pinecone namespace or tagged with metadata for filtered retrieval.

**No conversational Slack layer.** The current output is one-directional: RevAuto posts to Slack, the PM reads it. A future version could support two-way conversation — the PM asks follow-up questions in the Slack thread, and RevAuto responds with Claude, maintaining conversation context.

### Production Roadmap

| Priority | Enhancement                                             | Impact                                          |
| -------- | ------------------------------------------------------- | ----------------------------------------------- |
| P0       | Replace keyword scraper with Claude-powered extraction  | Dramatically better industry/size detection     |
| P1       | Add PostgreSQL for client data persistence              | Historical analysis, reporting, trend detection |
| P1       | Multi-document RAG (contracts, playbooks, case studies) | Richer, more specific AI analysis               |
| P2       | Birdview PSA integration (create project automatically) | Full Sales → Delivery automation                |
| P2       | Two-way Slack conversational layer                      | PMs can ask follow-up questions                 |
| P3       | Client health scoring over time                         | Proactive churn prevention                      |
| P3       | Auto-generate SOWs from deal + standards                | Eliminate manual document creation              |

---

_RevAuto — Autonomous Lifecycle Engine v2.0_
_Built for the Birdview PSA AI Automation Engineer role._
