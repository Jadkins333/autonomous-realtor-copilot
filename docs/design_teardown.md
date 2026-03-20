# Multi-Lens UX Teardown: "AI Garbage" vs "Professional Copilot"

To repair the "AI Garbage" feeling, we evaluate the current Outreach interface through four distinct personas:

## 1. The Real Estate Agent (Primary User)
**The Problem:** The current UI strips agents of their autonomy. It dumps raw AI-generated text into a table cell and forces a binary choice: "Approve" or "Reject." Agents are highly protective of their personal brand, local expertise, and client tone. If they cannot tweak a word or fix a robotic phrase, they will reject the tool entirely.
**The Fix:** 
- **Inline Editing is Non-Negotiable:** Convert the static text blocks into editable text areas. A true "Copilot" provides a first draft, but the agent drives.
- **Vibe Check:** Remove technical phrasing like "Draft Packs". Realtors think in terms of "Campaigns", "Follow-ups", and "Client Comms".

## 2. The UI/UX Designer
**The Problem:** The layout is a sterile, brutalist data grid. Raw `<table>` rows cramming multi-line email bodies next to dense metadata JSON blocks create overwhelming cognitive load. There is zero visual hierarchy or delightful micro-interaction.
**The Fix:**
- Break drafts out of the tabular jail. Use native-feeling Email Composer or SMS Bubble layouts depending on the channel.
- Implement clear typography hierarchy: Bolder subject lines, softer timestamps, and contextual iconography (✉️ / 📱).

## 3. The Non-Tech-Savvy User
**The Problem:** The app leaks database jargon directly into the view. Exposing elements like `sandbox_indicator`, `policy_snapshot.reason_codes`, and dumping RAW JSON on button clicks (`actionResult`) terrifies non-technical users.
**The Fix:**
- Translate engineering states into traffic-light nomenclature: 🟢 Ready to Send, 🟡 Needs Agent Review, 🔴 Blocked by Rules.
- Replace JSON output dumps with polite Toast notifications or localized success borders.

## 4. The Techie / Auditor
**The Problem:** While the engineer appreciates seeing the metadata, they also want to know the system is robust. Missing loading states (`disabled={isLoading}`) when clicking "Approve" causes double-clicks and race conditions.
**The Fix:**
- Hide the `compliance_snapshot` behind a "Debug Info" or "View Trace" accordion so it's out of the way for normal users but accessible for audits.
- Implement explicit loading/disabled states across all network requests.
