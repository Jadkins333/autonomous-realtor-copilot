# Manual Accessibility Walkthrough

This note supports the local launch-polish pass for the remaining secondary routes:

- `/properties/[id]`
- `/sources`
- `/opportunities/events`

It does not replace external staging checks for Twilio or Postmark.

## Preconditions

Run the app build first:

```bash
pnpm --filter web build
```

Run the local authenticated axe sweep and screenshot capture:

```bash
node apps/web/scripts/run-a11y-audit.mjs secondary-a11y --start-server --port=3152
```

Save the generated evidence:

- `artifacts/verification/secondary-a11y.json`
- `artifacts/redesign/secondary-a11y/`

## Route walkthroughs

### `/properties/[id]`

Check:

- Keyboard focus lands on the page shell skip link, then moves into the page header and back-link cleanly.
- The map section announces as a labeled image region instead of an unlabeled visual block.
- Nearby POIs and the timeline announce as labeled lists.
- Error, loading, and empty states read clearly without implying generated facts are authoritative.
- Insight copy still distinguishes saved parcel facts from explanatory guidance.

### `/sources`

Check:

- Each source card exposes a labeled admin-actions region.
- Pause flow moves focus into the reason field.
- Action confirmations announce through the live region.
- Pause, resume, and replay controls stay keyboard reachable in a logical order.
- Drift and error messages remain explicit and visible without relying on color alone.

### `/opportunities/events`

Check:

- Filter form announces as `Opportunity event filters`.
- Severity and lookback controls have explicit labels.
- Summary chips announce through a status region when filters change.
- The event list exposes busy state while loading and reads as deterministic event history.
- Empty and error states explain that AI is not generating the event rows.

## Evidence to capture manually

During the walkthrough, confirm:

- keyboard order is sensible
- visible focus is present on interactive controls
- landmarks and headings are easy to navigate
- live-region updates are understandable
- deterministic-versus-AI wording remains truthful

If anything fails, capture:

- the route
- the exact keyboard path that exposed it
- the observed screen-reader or focus issue
- a screenshot in `artifacts/redesign/secondary-a11y/`

## Still out of scope here

These items still require a real external environment:

- Twilio outbound voice round-trip
- Twilio signed public callback verification
- Postmark signed/public callback verification
