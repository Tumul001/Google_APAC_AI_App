# Gemini Journal & Reflections

A secure, user-authenticated personal reflection and journaling web application powered by **Gemini 3.6 Flash** and **Cloud Firestore**, designed with strict user-data isolation, zero plain-text credential storage, and a resilient server-side model fallback architecture.

---

## 1. Agentic Threat Modeling Summary

| Threat Zone | Scenario & Threat Vector | Active Countermeasures & Mitigations | Status |
| :--- | :--- | :--- | :---: |
| **1. Input Surfaces** | Prompt injection, malformed payloads, payload tampering | Server-side top-level body decoding, strict sanitization, and defensive null-safe destructuring with HTTP 400 rejection on invalid shapes. | **Enforced** |
| **2. Planning & Reasoning** | System instruction bypass, persona hijacking, jailbreaking | Segregated immutable server-side system prompts, temperature bounding, and non-executable data encapsulation. | **Enforced** |
| **3. Tool Execution** | Gemini API key exposure, SSRF, model manipulation | Zero-Hardcoding architecture: `GEMINI_API_KEY` stored exclusively on server with resilient fallback ladder (`gemini-3.6-flash` &rarr; `gemini-3.1-flash-lite` &rarr; `gemini-flash-latest` &rarr; `gemini-3.7-flash`). | **Enforced** |
| **4. Memory & State** | Cross-user data leakage, unauthorized Firestore reads/writes | Strict owner-bound Firestore security rules (`/users/{userId}/interactions/{id}` validating `request.auth.uid == userId`) and undefined-stripping payload hygiene. | **Enforced** |
| **5. Inter-System Comm.** | Token interception, credential leakage | Google Sign-In via Firebase Auth (no password storage in database), HTTPS in-transit encryption, and scoped access tokens. | **Enforced** |

---

## 2. Cloud Firestore Security Rules

Deploy the following security rules to guarantee complete data isolation between authenticated users:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // User-isolated interactions, journal entries, and reflections
    match /users/{userId}/interactions/{interactionId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // User profile settings
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

---

## 3. Secret Management & IAM Configuration

Store your Gemini API key in **Google Cloud Secret Manager** and grant Cloud Run access:

```bash
# 1. Enable Secret Manager API
gcloud services enable secretmanager.googleapis.com

# 2. Create the GEMINI_API_KEY secret
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"

# 3. Add your secret key value
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

# 4. Grant Cloud Run Default Service Account access to read the secret
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 4. Cloud Run Deployment Flow

Deploy the containerized full-stack application to **Google Cloud Run**:

```bash
# 1. Enable required GCP services
gcloud services enable run.googleapis.com firestore.googleapis.com

# 2. Build and deploy to Cloud Run with Secret Manager binding
gcloud run deploy gemini-reflections \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest" \
  --set-env-vars="NODE_ENV=production"

# 3. Apply the required campaign challenge verification label
gcloud run services update gemini-reflections \
  --update-labels=dev-tutorial=cloud-run-ai-challenge \
  --region=us-central1
```

---

## 5. Functional Walkthrough & Step-by-Step Test Scenarios

### Test Suite 1: Authentication & Landing View
- **Test Case 1.1 - Landing Page Render**:
  - *Action*: Open the root URL as an unauthenticated visitor.
  - *Expected Outcome*: Landing page renders with title, feature cards, and "Sign in with Google" button. No private journal entries are visible.
- **Test Case 1.2 - Google Sign-In Flow**:
  - *Action*: Click "Sign in with Google".
  - *Expected Outcome*: Firebase Auth popup opens. Upon user consent, user profile is loaded, and the user is redirected to their private dashboard.
- **Test Case 1.3 - Sign Out Flow**:
  - *Action*: Click "Sign Out" in the top navigation bar.
  - *Expected Outcome*: User session terminates, active journal entries unmount from memory, and the app resets to the landing page.

### Test Suite 2: Conversational Journaling with Gemini 3.6 Flash
- **Test Case 2.1 - First-Turn Reflection**:
  - *Action*: Type a daily reflection (e.g., *"Today I led a team retro that went well, but I felt anxious during conflict management"*), press Enter.
  - *Expected Outcome*: Message immediately renders in chat and saves to Firestore. Gemini returns an empathetic, structured reflection response.
- **Test Case 2.2 - Multi-Turn Exploration**:
  - *Action*: Send a follow-up reply (e.g., *"How can I remain calm when team members disagree strongly?"*).
  - *Expected Outcome*: Gemini maintains conversation context and provides concrete de-escalation strategies.
- **Test Case 2.3 - Mode Switching (Brainstorm / Deep Thinking / Gratitude)**:
  - *Action*: Switch reflection mode to "Brainstorm" or "Gratitude" using the mode pill tabs.
  - *Expected Outcome*: Mode changes, starter prompt suggestions update accordingly, and subsequent AI replies adapt their perspective.

### Test Suite 3: Cloud Firestore Isolation & History Persistence
- **Test Case 3.1 - Real-time Entry Persistence**:
  - *Action*: Create an entry and reload the browser tab.
  - *Expected Outcome*: The saved entry reloads from Firestore in the sidebar with its complete message history and title.
- **Test Case 3.2 - Pinning & Deletion**:
  - *Action*: Hover over an entry in the sidebar, click the Pin icon, then test the Delete confirmation prompt.
  - *Expected Outcome*: Pinned entries float to the top; confirming deletion safely removes the document from Firestore.
- **Test Case 3.3 - User Data Isolation Verification**:
  - *Action*: Sign in with User A, write an entry, then sign out and sign in with User B.
  - *Expected Outcome*: User B sees an empty list or only User B's entries. User A's entries are strictly inaccessible due to owner-bound Firestore security rules.

### Test Suite 4: AI Summary & Takeaways Extraction
- **Test Case 4.1 - Executive Summary Generation**:
  - *Action*: Click "Summarize" on any multi-turn journal entry.
  - *Expected Outcome*: Gemini processes the conversation and displays a structured summary banner containing Core Themes, Mindset Insights, Actionable Steps, and Follow-Up Reflection prompts.
