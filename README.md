# Gemini Reflections

[![Google Cloud Run](https://img.shields.io/badge/Google_Cloud-Cloud_Run-4285F4?logo=googlecloud&logoColor=white)](https://cloud.google.com/run)
[![Gemini 3.6 Flash](https://img.shields.io/badge/Google_DeepMind-Gemini_3.6_Flash-8E75B2?logo=googlegemini&logoColor=white)](https://ai.google.dev/)
[![Firebase Firestore](https://img.shields.io/badge/Database-Cloud_Firestore-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/docs/firestore)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript_5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Security Hardened](https://img.shields.io/badge/Security-OWASP_Top_10_Mitigated-10B981?logo=shield&logoColor=white)](#1-agentic-threat-modeling--security-architecture)

A production-grade, enterprise-ready conversational journaling and self-reflection web application powered by **Gemini 3.6 Flash** and **Google Cloud Firestore**. Architected with strict tenant isolation, zero-hardcoded secret hygiene, client-side cryptographic custom claims validation, resilient server-side model fallback ladders, and optional Google Maps geolocation tagging.

---

## Table of Contents
1. [System Architecture](#system-architecture)
2. [Agentic Threat Modeling & Security Architecture](#1-agentic-threat-modeling--security-architecture)
3. [Cloud Firestore Security Rules](#2-cloud-firestore-security-rules)
4. [Secret Management & Zero-Hardcoding Hygiene](#3-secret-management--zero-hardcoding-hygiene)
5. [Production Cloud Run Deployment Flow](#4-production-cloud-run-deployment-flow)
6. [Role-Based Access Control (RBAC) & Coach Review Flow](#5-role-based-access-control-rbac--coach-review-flow)
7. [Client-Side Token Synchronization & In-App Diagnostics](#6-client-side-token-synchronization--in-app-diagnostics)
8. [Google Maps Key Security & Referrer Restrictions](#7-google-maps-key-security--referrer-restrictions)
9. [Local Development & Environment Setup](#8-local-development--environment-setup)
10. [Functional Walkthrough & Verification Test Suites](#9-functional-walkthrough--verification-test-suites)
11. [OWASP Top 10 & LLM Security Compliance Checklist](#10-owasp-top-10--llm-security-compliance-checklist)

---

## System Architecture

```text
┌───────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT BROWSER                                   │
│  React 18 + TypeScript + Tailwind CSS                                         │
│  ├── Firebase Auth (Federated Google Sign-In, ID Token with Custom Claims)   │
│  ├── Google Maps JS & Places API (New) (Domain-Restricted Key)               │
│  └── Live Diagnostics Panel (Real-time Token Claim Inspector & In-App Retry) │
└────────────────────────┬───────────────────────────────────▲──────────────────┘
                         │ HTTPS Requests                    │ HTTPS Responses
                         ▼                                   │
┌────────────────────────────────────────────────────────────┴──────────────────┐
│                     GOOGLE CLOUD RUN BACKEND SERVICE                          │
│  Express 4 Application Gateway                                                │
│  ├── JSON Parser & Null-Safe Request Deserializer Middleware                  │
│  ├── Resilient Model Fallback Ladder Engine:                                  │
│  │   [Primary: gemini-3.6-flash] ──► [Fallback: gemini-3.1-flash-lite]       │
│  │   [Dynamic: gemini-flash-latest] ──► [Reasoning: gemini-3.7-flash]        │
│  └── Secret Manager Integration (Runtime Secret Retrieval)                    │
└────────────┬─────────────────────────────┬────────────────────────────────────┘
             │ Dynamic Secret Resolution   │ Server-side AI Calls
             ▼                             ▼
┌─────────────────────────┐   ┌─────────────────────────────────────────────────┐
│ GOOGLE CLOUD            │   │ GOOGLE DEEPMIND GEMINI API                      │
│ SECRET MANAGER          │   │ @google/genai SDK (Private In-VPC Channel)      │
│ (GEMINI_API_KEY)        │   └─────────────────────────────────────────────────┘
└─────────────────────────┘
             │ Direct Client Subscriptions
             ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                          GOOGLE CLOUD FIRESTORE                               │
│  Database: rules_version = '2';                                               │
│  ├── /users/{userId}/interactions/{interactionId} (Strict Owner-Bound Access) │
│  ├── /{path=**}/interactions/{interactionId} (Collection Group for Coach RBAC)│
│  └── /admin_audit_logs/{logId} (Append-Only Immutable Security Audit Trail)   │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Agentic Threat Modeling & Security Architecture

The application enforces a defense-in-depth model across the **5 Core Threat Zones** and 2 Domain Extension Zones, mitigating vulnerabilities identified in the OWASP Top 10 (Web) and OWASP Top 10 for LLM Applications.

| # | Threat Zone | Threat Vector & Attack Scenario | Active Countermeasures & Architectural Controls | Status |
| :--- | :--- | :--- | :--- | :---: |
| **1** | **Input Surfaces** | Prompt injection, malformed request bodies, payload tampering | Top-level express body-parser deserialization; schema-bound sanitization; strict coordinate range validation; 400 Bad Request rejection on invalid payloads. | **Enforced** |
| **2** | **Planning & Reasoning** | System instruction bypass, persona hijacking, jailbreaks | Segregated immutable server-side system instructions; bounded temperature parameters; treating user inputs as non-executable data strings. | **Enforced** |
| **3** | **Tool Execution** | API credential exfiltration, SSRF, dynamic code execution | Zero-hardcoding architecture; API keys never present in client bundles; runtime Secret Manager resolution; automated 4-stage model fallback ladder. | **Enforced** |
| **4** | **Memory & State** | Cross-user data leaks, unauthorized reads/writes, privilege escalation | Owner-bound Firestore security rules (`request.auth.uid == userId`); collection group scoping; undefined-stripping payload sanitizer on all database writes. | **Enforced** |
| **5** | **Inter-System Comm.** | Credential interception, man-in-the-middle, replay attacks | Federated Google Sign-In via Firebase Auth; token verification over HTTPS; zero plain-text password handling or storage anywhere in custom code. | **Enforced** |
| **6** | **Google Maps & Geolocation** | Maps key quota theft, unauthorized tracking, coordinates spoofing | HTTP referrer restriction; API scope lockdown (Maps JS + Places API New only); explicit browser GPS permission prompt; client/server key separation; strict lat/lng numeric range bounds (-90..90, -180..180). | **Enforced** |
| **7** | **Admin Role & RBAC (Coach View)** | Forged client role claims, horizontal data leakage, unauthorized snooping | Custom claims issued exclusively by Firebase Admin SDK (`admin: true`); dual-condition rule check (`request.auth.token.admin == true && resource.data.sharedWithCoach == true`); user opt-in toggle (default OFF); append-only `admin_audit_logs`. | **Enforced** |

---

## 2. Cloud Firestore Security Rules

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

    // 3. User profile metadata
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

## 3. Secret Management & Zero-Hardcoding Hygiene

All operational secrets are stored exclusively in **Google Cloud Secret Manager** and accessed by Cloud Run via least-privilege IAM bindings. **No secrets or API keys are hardcoded in application source code or committed to version control.**

### 1. Enable Secret Manager API
```bash
gcloud services enable secretmanager.googleapis.com
```

### 2. Create the Secret & Add Version
```bash
# Create the secret container
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"

# Populate secret value from standard input (prevents shell history leakage)
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-
```

### 3. Grant Cloud Run Service Account Access
```bash
# Obtain Project Number
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format="value(projectNumber)")

# Grant Secret Accessor role to the default Cloud Run Compute Service Account
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 4. Production Cloud Run Deployment Flow

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
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest" \
  --set-env-vars="NODE_ENV=production"
```

### 3. Apply Mandatory Campaign Verification Label
```bash
gcloud run services update gemini-reflections \
  --update-labels=dev-tutorial=cloud-run-ai-challenge \
  --region=us-central1
```

---

## 5. Role-Based Access Control (RBAC) & Coach Review Flow

The application implements a strict least-privilege RBAC architecture:
- **Zero Client-Side Trust**: Role flags (e.g. `role: "admin"`) written to client-accessible Firestore documents are never trusted for authorization.
- **Cryptographic Custom Claims**: Privileges are bound to the user's Firebase Auth JWT via Firebase Auth Custom Claims (`admin: true`).
- **Opt-In Sharing Model**: Regular users control access to their data. Entries have `sharedWithCoach: false` by default. Coaches cannot read an entry unless the user explicitly flips the sharing toggle.
- **Immutable Audit Logging**: Every coach view event triggers an append-only entry in `admin_audit_logs` storing the admin UID, client UID, entry ID, title, and timestamp.

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

## 6. Client-Side Token Synchronization & In-App Diagnostics

Firebase Auth client SDKs cache ID tokens in memory and IndexedDB for up to **1 hour**. When an administrator is granted custom claims on the backend, the client token must be explicitly refreshed.

### How Token Synchronization Operates
1. **Forced Token Refresh on Auth Changes**: The client invokes `user.getIdTokenResult(true)` during `onAuthStateChanged`, forcing a round-trip network token exchange with Google Identity servers.
2. **Mount Refresh on `/admin`**: When navigating to the Coach Workspace, the application performs an automatic token refresh prior to attaching the Firestore `collectionGroup('interactions')` stream.
3. **In-App Diagnostic Panel**: If a query encounters a permission or configuration issue, the UI renders:
   - The exact Firestore error code (e.g. `permission-denied`, `failed-precondition`).
   - A real-time token claim inspector displaying whether `admin: true` is cryptographically present in the active JWT.
   - An interactive **"Refresh Token & Retry"** button that refreshes the token on demand without requiring a full browser reload.

### Firestore Collection Group Index
The Coach Review dashboard queries across collections with:
```typescript
query(collectionGroup(db, 'interactions'), where('sharedWithCoach', '==', true), orderBy('createdAt', 'desc'))
```
If a composite index is required, Firestore provides an index creation URL in the browser console. Follow the link to build the index:
- **Collection group**: `interactions`
- **Fields indexed**: `sharedWithCoach` (ASCENDING), `createdAt` (DESCENDING)
- **Query scope**: Collection group

---

## 7. Google Maps Key Security & Referrer Restrictions

The application integrates the **Google Maps JavaScript API** and **Places API (New)** for location tagging. Because client-side JavaScript keys are accessible in browser runtimes, security is enforced via Cloud Console constraints:

1. **Storage**: Stored in `VITE_GOOGLE_MAPS_API_KEY` (injected via client environment variables).
2. **HTTP Referrer Restriction**:
   - In **Google Cloud Console &rarr; APIs & Services &rarr; Credentials**, select your key.
   - Under **Application restrictions**, select **Websites (HTTP referrers)**.
   - Authorize your production domains:
     - `https://*.run.app/*`
     - `https://your-custom-domain.com/*`
3. **API Restriction**:
   - Under **API restrictions**, select **Restrict key**.
   - Enable **ONLY**:
     - *Maps JavaScript API*
     - *Places API (New)*
4. **Server/Client Key Segregation**: Any server-side geocoding batch jobs must use a distinct secret key in Secret Manager, never the browser key.

---

## 8. Local Development & Environment Setup

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

# 3. Configure environment variables
cp .env.example .env
```

### Environment Configuration (`.env`)
```env
# Gemini API Key (Server-side only)
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"

# Public App URL (For links and OAuth redirection)
APP_URL="http://localhost:3000"

# Google Maps API Key (Client-side, domain-restricted)
VITE_GOOGLE_MAPS_API_KEY="YOUR_MAPS_API_KEY"
```

### Running the Full-Stack Dev Server
```bash
npm run dev
```
The application will boot at `http://localhost:3000`.

---

## 9. Functional Walkthrough & Verification Test Suites

Every user interaction, state change, and security boundary is mapped to the following verification test matrix.

### Test Suite 1: Authentication & Session Lifecycle
- **Test 1.1 — Public Unauthenticated Landing**:
  - *Action*: Open `/` in an incognito window.
  - *Expected Result*: Renders landing page with product overview and "Sign in with Google" call-to-action. No user data is accessible.
- **Test 1.2 — Google Federated Sign-In**:
  - *Action*: Click "Sign in with Google" and complete OAuth consent.
  - *Expected Result*: Returns authenticated user profile, initializes user document in `/users/{userId}`, and loads the journal workspace.
- **Test 1.3 — Secure Session Termination**:
  - *Action*: Click "Sign Out" in the navigation bar.
  - *Expected Result*: Active user context and Firestore snapshot listeners unmount; application returns to the unauthenticated landing view.

### Test Suite 2: AI Conversational Journaling & Model Fallback
- **Test 2.1 — Conversational Reflection**:
  - *Action*: Enter a reflective prompt in the chat input and submit.
  - *Expected Result*: Input immediately renders in conversation thread, persists to Firestore, and triggers Gemini 3.6 Flash. AI response renders in structured markdown with empathetic tone.
- **Test 2.2 — Context Retention in Multi-Turn Threads**:
  - *Action*: Ask a contextual follow-up question referencing the prior message.
  - *Expected Result*: Gemini responds taking full previous turn history into account.
- **Test 2.3 — Persona & Mode Adaptation**:
  - *Action*: Switch modes (e.g. *Gratitude*, *Brainstorm*, *Deep Thinking*).
  - *Expected Result*: Mode indicator updates, suggested reflection chips refresh, and Gemini adapts its analytical framework.
- **Test 2.4 — Automated Fallback Ladder Execution**:
  - *Action*: Simulate transient 503/429 upstream status on primary model.
  - *Expected Result*: Server catch-block gracefully degrades down the ladder (`gemini-3.6-flash` &rarr; `gemini-3.1-flash-lite` &rarr; `gemini-flash-latest` &rarr; `gemini-3.7-flash`) without failing the user's request.

### Test Suite 3: Tenant Data Isolation & History Management
- **Test 3.1 — Real-time Persistence & Refresh**:
  - *Action*: Add an entry, reload the browser tab.
  - *Expected Result*: Entry title, timestamp, and message array reload completely from Firestore.
- **Test 3.2 — Cross-Tenant Data Isolation**:
  - *Action*: Create an entry as User A. Sign out and sign in as User B.
  - *Expected Result*: User B's dashboard shows only User B's reflections. Direct reads against User A's subcollection path are blocked by Firestore rules.
- **Test 3.3 — Entry Pinning & Safe Deletion**:
  - *Action*: Pin an entry to the top; delete an entry and confirm the confirmation modal.
  - *Expected Result*: Pinned entry remains at top of sidebar; deleted entry is permanently deleted from Firestore subcollection.

### Test Suite 4: Executive Insights & Summarization
- **Test 4.1 — Conversation Synthesis**:
  - *Action*: Click "Summarize" on any multi-turn reflection.
  - *Expected Result*: Generates a structured breakdown with Core Themes, Mindset Insights, Action Items, and Growth Inquiries.

### Test Suite 5: Geolocation Tagging & Maps Integration
- **Test 5.1 — Google Places Autocomplete**:
  - *Action*: Click "Add Location", search for a location (e.g. *"Kyoto, Japan"*), and select from dropdown.
  - *Expected Result*: Place details resolved, map preview card rendered in editor, and location pill attached to entry.
- **Test 5.2 — Explicit Browser GPS Capture**:
  - *Action*: Click "Use My Current Location".
  - *Expected Result*: Browser requests explicit permission. Upon consent, coordinates are captured and validated against numeric bounds (-90..90, -180..180).
- **Test 5.3 — Optional Location Invariance**:
  - *Action*: Save an entry without a location tag.
  - *Expected Result*: Entry saves cleanly with location object omitted. No console errors or schema rejections.
- **Test 5.4 — Location Detachment**:
  - *Action*: Click "Remove" on an attached location preview.
  - *Expected Result*: Map unmounts and updated Firestore document removes the location object.

### Test Suite 6: Role-Based Access Control & Coach Audit Trail
- **Test 6.1 — Default Privacy (Opt-in Off)**:
  - *Action*: Inspect newly created entry.
  - *Expected Result*: "Share with Coach" toggle is present and set to OFF (`sharedWithCoach: false`).
- **Test 6.2 — Explicit Sharing Consent**:
  - *Action*: Toggle "Share with Coach" to active.
  - *Expected Result*: Document updates in Firestore with `sharedWithCoach: true`; status badge appears in entry list.
- **Test 6.3 — Silent Redirection for Non-Admins**:
  - *Action*: Attempt navigating to `/admin` as a standard user without the `admin: true` claim.
  - *Expected Result*: Route guard redirects quietly to `/` without leaking route existence or throwing unhandled exceptions.
- **Test 6.4 — Coach Workspace Anonymized Dashboard**:
  - *Action*: Navigate to `/admin` as an authenticated user with `{ admin: true }`.
  - *Expected Result*: Workspace displays only reflections marked `sharedWithCoach: true`. Author identities are anonymized (e.g. `Client #8F2`) for client confidentiality.
- **Test 6.5 — Immutable Admin Audit Logging**:
  - *Action*: Click on a shared client reflection in the Coach Workspace.
  - *Expected Result*: Append-only log written to `/admin_audit_logs`. Direct updates or deletes to the log fail under Firestore security rules.

---

## 10. OWASP Top 10 & LLM Security Compliance Checklist

- [x] **OWASP A01:2021 — Broken Access Control**: Owner-bound Firestore rules, custom claims verification, silent non-admin route redirection.
- [x] **OWASP A02:2021 — Cryptographic Failures**: HTTPS in-transit encryption, Google Secret Manager for operational credentials, zero plain-text token storage.
- [x] **OWASP A03:2021 — Injection**: Schema-bound JSON request deserialization, strict coordinate numeric range checking, non-executable prompt assembly.
- [x] **OWASP A04:2021 — Insecure Design**: Threat modeling applied across 7 zones, default-deny Firestore rules, user opt-in coach sharing.
- [x] **OWASP A05:2021 — Security Misconfiguration**: Explicit collection group wildcard rules, zero `allow read, write: if true;`, restrictive CORS and header policies.
- [x] **OWASP A07:2021 — Identification & Authentication Failures**: Federated Google Sign-In with Firebase Auth, server-verified custom claims, automatic token refresh.
- [x] **OWASP A09:2021 — Security Logging & Monitoring Failures**: Immutable `admin_audit_logs` tracking every administrative access event.
- [x] **OWASP LLM01 — Prompt Injection**: Server-segregated system instructions, non-executable user message framing, bounded temperature.
- [x] **OWASP LLM02 — Insecure Output Handling**: Markdown sanitization and safe React component rendering to prevent XSS.
- [x] **OWASP LLM05 — Supply Chain & Resource Exhaustion**: Resilient 4-stage model fallback ladder to prevent downtime during quota exhaustion or service degradation.
- [x] **OWASP LLM06 — Sensitive Information Disclosure**: Anonymized client IDs in coach review mode, strict tenant-bound database partitioning.

---

## License

This project is licensed under the [MIT License](LICENSE).
