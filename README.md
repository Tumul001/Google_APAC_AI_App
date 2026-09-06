# Gemini Reflections

[![Google Cloud Run](https://img.shields.io/badge/Google_Cloud-Cloud_Run-4285F4?logo=googlecloud&logoColor=white)](https://cloud.google.com/run)
[![Gemini 3.6 Flash](https://img.shields.io/badge/Google_DeepMind-Gemini_3.6_Flash-8E75B2?logo=googlegemini&logoColor=white)](https://ai.google.dev/)
[![Firebase Firestore](https://img.shields.io/badge/Database-Cloud_Firestore-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/docs/firestore)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript_5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Security Hardened](https://img.shields.io/badge/Security-OWASP_Top_10_Mitigated-10B981?logo=shield&logoColor=white)](#2-agentic-threat-modeling--security-architecture)

A production-grade, enterprise-ready conversational journaling and self-reflection web application powered by **Gemini 3.6 Flash** and **Google Cloud Firestore**. Architected with strict tenant data isolation, zero-hardcoded secret hygiene, cryptographic Firebase Auth custom claims validation, resilient server-side model fallback ladders, optional Google Maps Platform location tagging, opt-in Slack webhook notifications, and a dedicated Coach/Admin workspace.

---

## Table of Contents
1. [System Architecture](#1-system-architecture)
2. [Agentic Threat Modeling & Security Architecture](#2-agentic-threat-modeling--security-architecture)
3. [Cloud Firestore Security Rules](#3-cloud-firestore-security-rules)
4. [Secret Management & Zero-Hardcoding Hygiene](#4-secret-management--zero-hardcoding-hygiene)
5. [Production Cloud Run Deployment Flow](#5-production-cloud-run-deployment-flow)
6. [Feature 1: Google Maps Integration & Geolocation Security](#6-feature-1-google-maps-integration--geolocation-security)
7. [Feature 2: Role-Based Access Control (RBAC) & Coach Review Flow](#7-feature-2-role-based-access-control-rbac--coach-review-flow)
8. [Feature 3: Opt-In Slack Notifications & Webhook Security](#8-feature-3-opt-in-slack-notifications--webhook-security)
9. [Security Remediation: Environment Template & Repository Hygiene](#9-security-remediation-environment-template--repository-hygiene)
10. [Local Development & Environment Setup](#10-local-development--environment-setup)
11. [Functional Walkthrough & Verification Test Suites](#11-functional-walkthrough--verification-test-suites)
12. [OWASP Top 10 & LLM Security Compliance Checklist](#12-owasp-top-10--llm-security-compliance-checklist)

---

## 1. System Architecture

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                     CLIENT BROWSER                                     │
│  React 18 + TypeScript + Tailwind CSS (Stone Neutral / Modern Editorial Palette)       │
│  ├── Firebase Auth (Federated Google Sign-In, ID Token with Custom Claims)             │
│  ├── Google Maps JS & Places API (New) (Domain-Restricted Key, Interactive Canvas)     │
│  ├── Live Diagnostics Panel (Real-time Token Claim Inspector & In-App Retry)           │
│  └── Notification Settings Modal (Opt-in Modes, Test Ping Diagnostic)                  │
└───────────────────────────┬──────────────────────────────────────▲─────────────────────┘
                            │ HTTPS Requests                       │ HTTPS Responses
                            ▼                                      │
┌──────────────────────────────────────────────────────────────────┴─────────────────────┐
│                        GOOGLE CLOUD RUN BACKEND SERVICE                                │
│  Express 4 Application Gateway                                                         │
│  ├── JSON Parser & Null-Safe Request Deserializer Middleware                           │
│  ├── Resilient Model Fallback Ladder Engine:                                           │
│  │   [Primary: gemini-3.6-flash] ──► [Fallback: gemini-3.1-flash-lite]                │
│  │   [Dynamic: gemini-flash-latest] ──► [Reasoning: gemini-3.7-flash]                 │
│  ├── Server-Side Slack Webhook Notification Proxy (/api/notifications/slack)           │
│  │   ├── SSRF Domain Whitelist Validation (https://hooks.slack.com/services/)         │
│  │   ├── In-Memory Rate-Limiter (Max 1 per Entry Mode, Transition Aware)               │
│  │   └── Content Sanitizer (~200 char cap, control chars stripped, mrkdwn escaped)     │
│  └── Secret Manager Integration (Runtime Secret Accessor)                              │
└──────────────┬───────────────────────────────┬──────────────────────────┬──────────────┘
               │ Dynamic Secret Resolution     │ Server-side AI Calls     │ Outgoing Webhooks
               ▼                               ▼                          ▼
┌────────────────────────────┐   ┌───────────────────────────┐   ┌───────────────────────┐
│ GOOGLE CLOUD               │   │ GOOGLE DEEPMIND           │   │ SLACK INCOMING        │
│ SECRET MANAGER             │   │ GEMINI API                │   │ WEBHOOK SERVICE       │
│ ├── GEMINI_API_KEY         │   │ @google/genai SDK         │   │ (Encrypted Channel)   │
│ └── SLACK_WEBHOOK_URL      │   │ (Private In-VPC Channel)  │   │                       │
└────────────────────────────┘   └───────────────────────────┘   └───────────────────────┘
               │ Direct Client Subscriptions
               ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                             GOOGLE CLOUD FIRESTORE                                     │
│  Database: rules_version = '2';                                                        │
│  ├── /users/{userId}/interactions/{interactionId} (Strict Owner-Bound Access)          │
│  ├── /{path=**}/interactions/{interactionId} (Collection Group for Coach RBAC)         │
│  ├── /users/{userId} (User Profile & Opt-in Slack Notification Settings)               │
│  └── /admin_audit_logs/{logId} (Append-Only Immutable Security Audit Trail)            │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Agentic Threat Modeling & Security Architecture

The application enforces a defense-in-depth model across the **5 Core Threat Zones** and **3 Domain Directives**, mitigating vulnerabilities identified in the OWASP Top 10 (Web) and OWASP Top 10 for LLM Applications.

| # | Threat Zone | Threat Vector & Attack Scenario | Active Countermeasures & Architectural Controls | Status |
| :--- | :--- | :--- | :--- | :---: |
| **1** | **Input Surfaces** | Prompt injection, malformed request bodies, payload tampering, NoSQL injection | Top-level express body-parser deserialization; schema-bound sanitization; strict coordinate range validation; 400 Bad Request rejection on invalid payloads. | **Enforced** |
| **2** | **Planning & Reasoning** | System instruction bypass, persona hijacking, jailbreaks | Segregated immutable server-side system instructions; bounded temperature parameters; treating user inputs as non-executable data strings. | **Enforced** |
| **3** | **Tool Execution** | API credential exfiltration, SSRF, dynamic code execution | Zero-hardcoding architecture; API keys never present in client bundles; runtime Secret Manager resolution; automated 4-stage model fallback ladder. | **Enforced** |
| **4** | **Memory & State** | Cross-user data leaks, unauthorized reads/writes, privilege escalation | Owner-bound Firestore security rules (`request.auth.uid == userId`); collection group scoping; undefined-stripping payload sanitizer on all database writes. | **Enforced** |
| **5** | **Inter-System Comm.** | Credential interception, man-in-the-middle, replay attacks, token leakage | Federated Google Sign-In via Firebase Auth; token verification over HTTPS; zero plain-text password handling or storage anywhere in custom code. | **Enforced** |
| **6** | **Google Maps (Directive 8)** | Maps key quota theft, unauthorized tracking, coordinates spoofing, SSRF | HTTP referrer restriction; API scope lockdown (Maps JS + Places API New only); explicit browser GPS permission prompt; client/server key separation; strict lat/lng numeric range bounds (-90..90, -180..180). | **Enforced** |
| **7** | **Admin RBAC (Directive 9)** | Forged client role claims, horizontal data leakage, unauthorized snooping | Custom claims issued exclusively by Firebase Admin SDK (`admin: true`); dual-condition rule check (`request.auth.token.admin == true && resource.data.sharedWithCoach == true`); user opt-in toggle (default OFF); append-only `admin_audit_logs`. | **Enforced** |
| **8** | **Slack Webhook (Directive 10)** | Webhook secret leakage, SSRF via arbitrary URLs, payload injection, private text leakage | Webhook URL strictly held in Secret Manager (`SLACK_WEBHOOK_URL`); backend-only execution; domain lockdown (`https://hooks.slack.com/services/`); user opt-in trigger modes; ~200-char max sanitized excerpt (mrkdwn-escaped, control chars stripped); rate-limited to 1 alert per entry save. | **Enforced** |

---

## 3. Cloud Firestore Security Rules

Deploy the following production rules via Firebase CLI or Google Cloud Console. These rules enforce strict data isolation between tenants, provide collection group support for coach reviews, and maintain an immutable audit trail.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // 1. Direct path for user-isolated reflections with opt-in Coach Sharing
    match /users/{userId}/interactions/{interactionId} {
      allow read: if request.auth != null && (
        request.auth.uid == userId
        || (request.auth.token.admin == true && resource.data.sharedWithCoach == true)
      );
      allow write: if request.auth != null && request.auth.uid == userId;
    }

    // 2. Collection Group rule (Mandatory for coach collectionGroup('interactions') queries)
    match /{path=**}/interactions/{interactionId} {
      allow read: if request.auth != null && (
        request.auth.uid == resource.data.userId
        || (request.auth.token.admin == true && resource.data.sharedWithCoach == true)
      );
    }

    // 3. User profile metadata and opt-in notification preferences
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // 4. Admin Audit Logs: Append-only by verified admins; immutable to prevent tampering
    match /admin_audit_logs/{logId} {
      allow read: if request.auth != null && request.auth.token.admin == true;
      allow create: if request.auth != null 
        && request.auth.token.admin == true 
        && request.resource.data.adminUid == request.auth.uid;
      allow update, delete: if false; // Strict immutability guarantee
    }
  }
}
```

### Deploying Firestore Rules
```bash
# Using the Firebase CLI:
firebase deploy --only firestore:rules
```

---

## 4. Secret Management & Zero-Hardcoding Hygiene

All operational secrets are stored exclusively in **Google Cloud Secret Manager** and accessed by Cloud Run via least-privilege IAM bindings. **No secrets or API keys are hardcoded in application source code or committed to version control.**

### 1. Enable Secret Manager API
```bash
gcloud services enable secretmanager.googleapis.com
```

### 2. Create the Secrets & Add Versions

#### Gemini API Key:
```bash
# Create the secret container
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"

# Populate secret value from standard input (prevents shell history leakage)
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-
```

#### Slack Incoming Webhook URL:
```bash
# Create the secret container
gcloud secrets create SLACK_WEBHOOK_URL --replication-policy="automatic"

# Populate secret value with your incoming webhook URL
echo -n "https://hooks.slack.com/services/YOUR/WEBHOOK/URL" | \
  gcloud secrets versions add SLACK_WEBHOOK_URL --data-file=-
```

### 3. Grant Cloud Run Service Account Access
```bash
# Obtain Project Number
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format="value(projectNumber)")

# Grant Secret Accessor role for GEMINI_API_KEY
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Grant Secret Accessor role for SLACK_WEBHOOK_URL
gcloud secrets add-iam-policy-binding SLACK_WEBHOOK_URL \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 5. Production Cloud Run Deployment Flow

Deploy the containerized full-stack application directly to **Google Cloud Run** using `gcloud run deploy`.

### 1. Enable Required Cloud APIs
```bash
gcloud services enable run.googleapis.com firestore.googleapis.com cloudbuild.googleapis.com
```

### 2. Build & Deploy Service with Secret Mount
```bash
gcloud run deploy gemini-reflections \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest,SLACK_WEBHOOK_URL=SLACK_WEBHOOK_URL:latest" \
  --set-env-vars="NODE_ENV=production"
```

### 3. Apply Mandatory Campaign Verification Label
```bash
gcloud run services update gemini-reflections \
  --update-labels=dev-tutorial=cloud-run-ai-challenge \
  --region=us-central1
```

---

## 6. Feature 1: Google Maps Integration & Geolocation Security

In accordance with **Production Directive 8**, the application integrates the **Google Maps JavaScript API** and **Places API (New)** for location-tagged journal reflections:

- **Optional Location Schema Invariance**: Location tagging is completely opt-in per journal entry. Journal entries without location save cleanly without schemas failing.
- **Embedded Interactive Map**: Attached locations render directly in the journal entry card as an interactive visual map canvas with custom stone styling, zoom controls, and marker pinning.
- **Explicit User Consent**: Browser geolocation is never captured silently. It requires explicit user activation ("Use Current Location") and adheres to native browser permission prompts.
- **Strict Numeric Range Validation**: Latitude and longitude are strictly validated before persistence:
  $$\text{Latitude} \in [-90.0, 90.0] \quad\text{and}\quad \text{Longitude} \in [-180.0, 180.0]$$
- **HTTP Referrer & API Scope Restrictions**:
  1. In **Google Cloud Console &rarr; APIs & Services &rarr; Credentials**, select `VITE_GOOGLE_MAPS_API_KEY`.
  2. Under **Application restrictions**, choose **Websites (HTTP referrers)** and authorize your domains:
     - `https://*.run.app/*`
     - `https://your-custom-domain.com/*`
  3. Under **API restrictions**, restrict the key strictly to:
     - *Maps JavaScript API*
     - *Places API (New)*
- **Server/Client Key Segregation**: Any server-side geocoding batch jobs must use a distinct secret key in Secret Manager, never the browser key.

---

## 7. Feature 2: Role-Based Access Control (RBAC) & Coach Review Flow

In accordance with **Production Directive 9**, the application implements least-privilege role-based access for an elevated "Coach / Admin" review workspace without violating base user data isolation:

- **Cryptographic Custom Claims**: Authorization relies strictly on Firebase Auth ID tokens containing the claim `admin: true`. Client-writable Firestore fields (such as `users/{uid}.role`) are never trusted.
- **Opt-In Data Sharing**: Regular users control access to their private reflections. Entries have `sharedWithCoach: false` by default. Coaches cannot read an entry unless the user explicitly flips the sharing toggle.
- **Client Confidentiality**: In the Coach Workspace, author identities are anonymized (e.g. `Client #A49`) to preserve client confidentiality.
- **Immutable Admin Audit Logging**: Every coach view event triggers an append-only entry in `/admin_audit_logs` storing:
  - `adminUid`: Firebase Auth UID of the viewing coach
  - `entryAuthorUid`: Firebase Auth UID of the reflection author
  - `entryId`: ID of the reviewed interaction
  - `entryTitle`: Title of the reflection
  - `viewedAt`: Server timestamp
- **Token Synchronization & Diagnostics**: Firebase Auth client SDKs cache ID tokens for up to 1 hour. The `/admin` view implements:
  - Forced ID token refresh on mount (`user.getIdTokenResult(true)`)
  - A real-time token claim inspector displaying whether `admin: true` is cryptographically present
  - An interactive **"Refresh Token & Retry"** button for immediate permission updates without page reloads.

### Assigning the Admin Custom Claim
Run the pre-configured server-side script using the Firebase Admin SDK:
```bash
# Set Google Application Credentials
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"

# Grant claim by user email:
node scripts/set-admin-claim.js user@domain.com

# Or grant claim by Firebase Auth UID:
node scripts/set-admin-claim.js <FIREBASE_AUTH_UID>
```

---

## 8. Feature 3: Opt-In Slack Notifications & Webhook Security

In accordance with **Production Directive 10**, the application supports opt-in notifications dispatched to a team's **Slack Incoming Webhook** when specific journal reflection types are saved:

- **Zero Client Leakage**: The incoming webhook URL acts as a bearer secret and is stored exclusively in **Google Cloud Secret Manager** (`SLACK_WEBHOOK_URL`). It is never exposed in client JS bundles, network responses, or Firestore documents.
- **Server-Side Trigger Only**: Notifications fire exclusively from the Cloud Run Express backend route (`/api/notifications/slack`) only after a confirmed Firestore write (`saveJournalEntry`).
- **SSRF Defense**: The backend validates that incoming webhook URLs strictly originate from `https://hooks.slack.com/services/`.
- **Content Sanitization & Privacy Bounding**: Private multi-turn dialogues are never dispatched. The backend sanitizes the excerpt by stripping control characters, escaping Slack markdown characters (`*`, `_`, `~`, `` ` ``, `<`, `>`, `&`), and enforcing a strict **~200-character cap**.
- **Rate-Limiting & Mode-Transition Aware**: Restricted to a maximum of **1 notification per entry save**, with in-memory caching preventing duplicate triggers on successive session keystrokes or edits. Intentional mode changes (e.g. switching from Brainstorm to Gratitude) clear prior locks to ensure valid notifications are dispatched.
- **Strict Opt-In & Mode Filtering**: Disabled by default. Users configure their preferences in the Settings panel, selecting which modes trigger notifications (e.g. *Gratitude*, *Deep Thinking*).
- **Built-in Test Ping**: Includes a "Send Test Ping" diagnostic in the UI that validates the webhook connection and Secret Manager binding end-to-end.

---

## 8b. Feature 4: Weekly AI Digest (Cloud Scheduler → OIDC → Gemini → Slack)

Every Sunday evening, opted-in users receive one Gemini-written summary of the week they journalled.

- **Off by default, and it needs a destination.** The toggle lives in Settings beside the existing Slack controls. Enabling it requires the user to paste **their own** Slack incoming webhook; the save button stays disabled until they do.
- **Never the shared channel.** `SLACK_WEBHOOK_URL` is one team webhook. A digest describes a week of private journalling, so it is delivered **only** to the per-user webhook stored at `/users/{uid}.notificationSettings.digestWebhookUrl`. The shared secret is never used as a fallback for a digest — that would publish one person's reflections to everyone.
- **Not a public endpoint.** `POST /api/digest/weekly` accepts only a Google-signed OIDC token whose `aud` matches `DIGEST_AUDIENCE`, whose issuer is `accounts.google.com`, whose `email_verified` is true, and whose `email` appears in the `DIGEST_INVOKER_SA` allowlist. Anything else gets a bare `401` with no diagnostic detail. If either variable is unset the route **refuses every caller** rather than falling open.
- **Why in-process verification.** Cloud Run serves the web app and therefore runs `--allow-unauthenticated`, so IAM does not gate this path. The handler reads with the Firebase Admin SDK, which bypasses `firestore.rules` entirely, making this token check the only barrier in front of every user's journal.
- **Per-user scoping.** One user is read at a time — never a cross-user query or join. Bounded at 200 users per run, 40 entries per user, a 220-character excerpt of each entry's opening message, and a 1,200-character sanitised summary. Full multi-turn threads are never read or sent.
- **Reuses the hardened path.** Gemini output goes through the same `sanitizeSlackContent` used by per-entry notifications, and the webhook is checked against the `https://hooks.slack.com/services/` origin.
- **Retry-safe.** `lastDigestSentAt` is written per user; a re-run within six days skips them, so a Cloud Scheduler retry cannot double-send.
- **Responses carry counts only** — `{processed, sent, skipped, failed}`. No journal content is ever returned or logged.

### Required environment variables

```bash
DIGEST_AUDIENCE="https://<service>-<hash>-<region>.a.run.app/api/digest/weekly"
DIGEST_INVOKER_SA="journal-digest-scheduler@$PROJECT_ID.iam.gserviceaccount.com"
```

### Setting up the Cloud Scheduler job

```bash
# ── 0. Variables ───────────────────────────────────────────────────────────
export PROJECT_ID="apac-track2-507117"
export REGION="asia-south1"                     # run the job near your users
export SERVICE="gemini-reflections"
export SA_NAME="journal-digest-scheduler"
export SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"

gcloud config set project "$PROJECT_ID"
gcloud services enable cloudscheduler.googleapis.com run.googleapis.com

# ── 1. A dedicated identity for the job ────────────────────────────────────
# Its own service account, so the allowlist names exactly one caller and the
# default compute identity is not reused for a privileged endpoint.
gcloud iam service-accounts create "$SA_NAME"   --display-name="Weekly journal digest scheduler"

# ── 2. Resolve the deployed URL and tell the service what to trust ─────────
export SERVICE_URL="$(gcloud run services describe "$SERVICE"   --region "$REGION" --format='value(status.url)')"
export DIGEST_URL="$SERVICE_URL/api/digest/weekly"

gcloud run services update "$SERVICE"   --region "$REGION"   --update-env-vars "DIGEST_AUDIENCE=$DIGEST_URL,DIGEST_INVOKER_SA=$SA_EMAIL"

# ── 3. Let the job invoke the service ──────────────────────────────────────
# Harmless if the service is already public; required the moment it is not.
gcloud run services add-iam-policy-binding "$SERVICE"   --region "$REGION"   --member="serviceAccount:$SA_EMAIL"   --role="roles/run.invoker"

# ── 4. The job: every Sunday at 18:00 IST ──────────────────────────────────
# --oidc-token-audience must equal DIGEST_AUDIENCE exactly, or the route 401s.
gcloud scheduler jobs create http weekly-journal-digest   --location="$REGION"   --schedule="0 18 * * SUN"   --time-zone="Asia/Kolkata"   --uri="$DIGEST_URL"   --http-method=POST   --headers="Content-Type=application/json"   --message-body='{}'   --oidc-service-account-email="$SA_EMAIL"   --oidc-token-audience="$DIGEST_URL"   --attempt-deadline=540s   --max-retry-attempts=3   --min-backoff=60s

# ── 5. Grant the runtime service account Firestore read/write ──────────────
# The digest reads across users with the Admin SDK and writes lastDigestSentAt.
export RUNTIME_SA="$(gcloud run services describe "$SERVICE"   --region "$REGION" --format='value(spec.template.spec.serviceAccountName)')"
gcloud projects add-iam-policy-binding "$PROJECT_ID"   --member="serviceAccount:${RUNTIME_SA:-$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')-compute@developer.gserviceaccount.com}"   --role="roles/datastore.user"

# ── 6. Fire it once now to confirm the whole chain ─────────────────────────
gcloud scheduler jobs run weekly-journal-digest --location="$REGION"
gcloud beta run services logs read "$SERVICE" --region "$REGION" --limit=20 | grep Digest
```

Expect `[Digest] Run started by journal-digest-scheduler@… : N opted-in user(s).` A `401` means `--oidc-token-audience` and `DIGEST_AUDIENCE` disagree, or the caller is missing from `DIGEST_INVOKER_SA`.

---

## 9. Security Remediation: Environment Template & Repository Hygiene

### Problem Statement & Threat Vector
If `.env.example` contains actual operational secrets (API keys or live webhook URLs) instead of generic placeholder text, committing the file to a public or shared GitHub repository creates an immediate credential leakage vulnerability (OWASP A02:2021).

### Architectural Remediation Applied
1. **Strict Placeholder Templates in `.env.example`**:
   All values in `.env.example` have been replaced with generic placeholder strings. No real API keys, project identifiers, or webhook endpoints exist in the file:
   ```env
   GEMINI_API_KEY="your_gemini_api_key_here"
   APP_URL="https://your-app-url.run.app"
   VITE_GOOGLE_MAPS_API_KEY="your_google_maps_api_key_here"
   SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
   ```
2. **Repository Exclusion (`.gitignore`)**:
   The repository's `.gitignore` explicitly excludes all `.env*` variants while preserving the sanitized `.env.example` template:
   ```gitignore
   node_modules/
   build/
   dist/
   coverage/
   .DS_Store
   *.log
   .env*
   !.env.example
   ```
3. **Zero Hardcoded Secrets in Codebase**:
   Full repository scanning confirms that no production secrets or bearer credentials exist in client-side bundles or source files. Secrets are resolved dynamically at runtime via Secret Manager and environment variables.

---

## 10. Local Development & Environment Setup

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm** or **bun**
- **Google Cloud SDK (`gcloud`)**
- **Firebase CLI (`firebase-tools`)**

### Installation
```bash
# 1. Clone the repository
git clone <REPOSITORY_URL>
cd gemini-reflections

# 2. Install dependencies
npm install

# 3. Create your local .env from the sanitized template
cp .env.example .env
```

### Local Environment Configuration (`.env`)
Fill in your local testing keys in `.env` (never commit this file):
```env
# Gemini API Key (Server-side only)
GEMINI_API_KEY="your_gemini_api_key_here"

# Public App URL (For links and OAuth redirection)
APP_URL="http://localhost:3000"

# Google Maps API Key (Client-side, domain-restricted)
VITE_GOOGLE_MAPS_API_KEY="your_google_maps_api_key_here"

# Slack Webhook URL (Server-side only)
SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
```

### Running the Full-Stack Dev Server
```bash
npm run dev
```
The application will boot at `http://localhost:3000`.

---

## 11. Functional Walkthrough & Verification Test Suites

Every user interaction, state change, and security boundary is mapped to the following verification test matrix.

### Test Suite 1: Authentication & Session Lifecycle
- **Test 1.1 — Public Unauthenticated Landing**: Open `/` in incognito. Renders landing page with product overview and "Sign in with Google" call-to-action. No user data is accessible.
- **Test 1.2 — Google Federated Sign-In**: Click "Sign in with Google". Completes OAuth consent, initializes user profile in `/users/{userId}`, and loads the workspace.
- **Test 1.3 — Secure Session Termination**: Click "Sign Out". Active user context and Firestore snapshot listeners unmount cleanly; returns to landing view.

### Test Suite 2: AI Conversational Journaling & Model Fallback
- **Test 2.1 — Conversational Reflection**: Submit a reflection prompt. Renders immediately, persists to Firestore, and triggers Gemini 3.6 Flash. AI response renders in structured markdown with empathetic tone.
- **Test 2.2 — Context Retention in Multi-Turn Threads**: Ask contextual follow-up. Gemini responds incorporating full dialogue history.
- **Test 2.3 — Persona & Mode Adaptation**: Switch modes (*Gratitude*, *Brainstorm*, *Deep Thinking*). Mode indicator updates, suggestion chips refresh, and Gemini adapts its conversational style.
- **Test 2.4 — Automated Fallback Ladder Execution**: Simulate upstream 503/429 on primary model. Server catch-block gracefully degrades (`gemini-3.6-flash` &rarr; `gemini-3.1-flash-lite` &rarr; `gemini-flash-latest` &rarr; `gemini-3.7-flash`) without failing the user's request.

### Test Suite 3: Tenant Data Isolation & History Management
- **Test 3.1 — Real-time Persistence & Refresh**: Add an entry, reload tab. Title, timestamp, messages, and metadata reload completely from Firestore.
- **Test 3.2 — Cross-Tenant Data Isolation**: Create entry as User A. Sign in as User B. User B sees only their reflections. Direct reads against User A's subcollection path are rejected by Firestore rules.
- **Test 3.3 — Entry Pinning & Safe Deletion**: Pin an entry to the top; delete an entry via confirmation modal. Pinned entry remains at top; deleted entry is permanently removed from Firestore.

### Test Suite 4: Executive Insights & Summarization
- **Test 4.1 — Conversation Synthesis**: Click "Summarize" on any multi-turn reflection. Generates structured breakdown with Core Themes, Mindset Insights, Action Items, and Growth Inquiries.

### Test Suite 5: Geolocation Tagging & Maps Integration (Directive 8)
- **Test 5.1 — Google Places Autocomplete**: Click "Add Location", search *"Kyoto, Japan"*, select from dropdown. Place resolved, interactive map preview rendered, and location pill attached.
- **Test 5.2 — Explicit Browser GPS Capture**: Click "Use Current Location". Browser displays native permission prompt. Upon consent, coordinates are captured and validated against numeric bounds (-90..90, -180..180).
- **Test 5.3 — Optional Location Invariance**: Save an entry without location. Saves cleanly with location object omitted.
- **Test 5.4 — Location Detachment**: Click "Remove" on an attached location preview. Map unmounts and location object is removed from Firestore document.

### Test Suite 6: Role-Based Access Control & Coach Audit Trail (Directive 9)
- **Test 6.1 — Default Privacy (Opt-in Off)**: Newly created entry has "Share with Coach" toggle set to OFF (`sharedWithCoach: false`).
- **Test 6.2 — Explicit Sharing Consent**: Toggle "Share with Coach" to active. Document updates in Firestore with `sharedWithCoach: true`; status badge appears in entry list.
- **Test 6.3 — Silent Redirection for Non-Admins**: Attempt navigating to `/admin` as standard user without `admin: true` claim. Redirects quietly to `/` without leaking route existence.
- **Test 6.4 — Coach Workspace Anonymized Dashboard**: Navigate to `/admin` as user with `admin: true`. Displays only reflections marked `sharedWithCoach: true`. Author identities are anonymized (e.g. `Client #8F2`).
- **Test 6.5 — Immutable Admin Audit Logging**: Click on shared client reflection in Coach Workspace. Append-only log written to `/admin_audit_logs`. Direct updates or deletes to the log fail under Firestore rules.
- **Test 6.6 — Token Claim Inspector & In-App Retry**: If token is stale, diagnostic panel displays claims status and provides "Refresh Token & Retry" button for immediate resolution.

### Test Suite 7: Opt-In Slack Notifications & Content Sanitization (Directive 10)
- **Test 7.1 — Default Inactivity**: Save entry with default settings. No HTTP calls to `/api/notifications/slack`.
- **Test 7.2 — Opt-In & Trigger Mode Configuration**: Open Settings modal, toggle "Enable Slack Notifications" to ON, select "Gratitude". Preferences persist to `/users/{userId}` in Firestore.
- **Test 7.3 — Mode-Filtered Server Dispatch**: Save reflection in **Gratitude** mode. After Firestore write confirmation, backend sanitizes excerpt and posts to Slack webhook. UI displays confirmation banner.
- **Test 7.4 — Unselected Mode Suppression**: Save reflection in **Brainstorm** mode. Firestore saves, but Slack notification is suppressed.
- **Test 7.5 — Content Sanitization & Truncation**: Submit entry with formatting marks and >400 characters. Slack preview escapes markdown characters, strips control characters, and truncates strictly at ~200 characters.
- **Test 7.6 — Duplicate Suppression (Rate-Limiting)**: Edit same Gratitude entry multiple times. In-memory rate-limiter and session tracker skip redundant webhook calls (`skipped: true`).
- **Test 7.7 — Mode Transition Lock Clearing**: Switch entry from Gratitude to Brainstorm and back to Gratitude. Intentional mode transition flag resets lock so the new Gratitude message dispatches properly.
- **Test 7.8 — Test Ping Diagnostic**: Click "Send Test Ping" in Settings. Backend sends verified diagnostic ping to Slack channel confirming end-to-end integration.

### Test Suite 8: Security Remediation & Repository Hygiene
- **Test 8.1 — Environment Template Sanitization**: Inspect `.env.example`. All variables contain generic placeholders (`"your_..._here"`), with zero real keys or webhook URLs.
- **Test 8.2 — Repository Secret Exclusion**: Inspect `.gitignore`. Confirms `.env*` is excluded and `!.env.example` is whitelisted. Verify no local `.env` is tracked in git.

---

## 12. OWASP Top 10 & LLM Security Compliance Checklist

- [x] **OWASP A01:2021 — Broken Access Control**: Owner-bound Firestore rules, custom claims verification, silent non-admin route redirection.
- [x] **OWASP A02:2021 — Cryptographic Failures**: HTTPS in-transit encryption, Google Secret Manager for operational credentials (`GEMINI_API_KEY`, `SLACK_WEBHOOK_URL`), zero plain-text token storage, sanitized `.env.example`.
- [x] **OWASP A03:2021 — Injection**: Schema-bound JSON request deserialization, strict coordinate numeric range checking, non-executable prompt assembly, Slack mrkdwn character escaping.
- [x] **OWASP A04:2021 — Insecure Design**: Threat modeling applied across 8 zones, default-deny Firestore rules, user opt-in coach sharing, user opt-in external notifications.
- [x] **OWASP A05:2021 — Security Misconfiguration**: Explicit collection group wildcard rules, zero `allow read, write: if true;`, restrictive CORS and header policies.
- [x] **OWASP A07:2021 — Identification & Authentication Failures**: Federated Google Sign-In with Firebase Auth, server-verified custom claims, automatic token refresh.
- [x] **OWASP A09:2021 — Security Logging & Monitoring Failures**: Immutable `admin_audit_logs` tracking every administrative access event.
- [x] **OWASP A10:2021 — Server-Side Request Forgery (SSRF)**: Webhook destination validated strictly against `https://hooks.slack.com/services/` with arbitrary external URI inputs rejected.
- [x] **OWASP LLM01 — Prompt Injection**: Server-segregated system instructions, non-executable user message framing, bounded temperature.
- [x] **OWASP LLM02 — Insecure Output Handling**: Markdown sanitization and safe React component rendering to prevent XSS.
- [x] **OWASP LLM05 — Supply Chain & Resource Exhaustion**: Resilient 4-stage model fallback ladder to prevent downtime during quota exhaustion or service degradation.
- [x] **OWASP LLM06 — Sensitive Information Disclosure**: Anonymized client IDs in coach review mode, strict tenant-bound database partitioning, ~200-char truncated Slack excerpts.

---

## License

This project is licensed under the [MIT License](LICENSE).
