# Fair Housing Advertising Guardrails

The marketing package scorer applies a fair-housing risk screen and returns `flagged_terms` in scoring output.

Implementation notes:
- Guardrails are two-layer:
  - hard filters for clearly risky preference/exclusion language,
  - soft rewrite guidance for gray-area phrasing.
- Flagged language contributes to a compliance risk penalty.
- Terms are surfaced to the user and stored in Truth Layer metric output.
- This is a policy-control layer and should be reviewed by counsel for production deployments.

Reference:
- Guidance on application of the Fair Housing Act to digital advertising: https://www.equalhousing.org/resources/guidance-on-application-of-the-fair-housing-act-to-the-advertising-of-housing-credit-and-other-real-estate-related-transactions-through-digital-platforms/
