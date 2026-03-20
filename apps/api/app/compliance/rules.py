# Legal reference links are documented in /docs/compliance/*.md.
# Keep this ruleset synchronized with counsel-approved policy updates.

FAIR_HOUSING_RULES = {
    "ideal for families": {
        "reason_code": "protected_class_family_status",
        "explanation": "Avoid language that signals a preference based on family status.",
    },
    "no children": {
        "reason_code": "protected_class_family_status",
        "explanation": "Exclusionary language about children is not allowed in housing marketing.",
    },
    "christian neighborhood": {
        "reason_code": "protected_class_religion",
        "explanation": "Avoid promoting housing based on religion or religious composition.",
    },
    "walk to synagogue": {
        "reason_code": "protected_class_religion_proxy",
        "explanation": "Religious-proxy neighborhood targeting must be blocked or reviewed.",
    },
    "perfect for singles": {
        "reason_code": "protected_class_family_status",
        "explanation": "Audience targeting by family-status proxy is not allowed.",
    },
    "not wheelchair accessible": {
        "reason_code": "protected_class_disability",
        "explanation": "Disability-related descriptors must be handled through compliant accessibility facts, not exclusionary phrasing.",
    },
    "great for young professionals": {
        "reason_code": "protected_class_age_proxy",
        "explanation": "Audience targeting by age proxy is not allowed.",
    },
    "safe neighborhood for families": {
        "reason_code": "steering_demographic_proxy",
        "explanation": "Neighborhood desirability claims framed around demographics or family status must be blocked.",
    },
    "exclusive neighborhood": {
        "reason_code": "exclusionary_language",
        "explanation": "Exclusionary audience language is not allowed in housing outreach.",
    },
}

FAIR_HOUSING_FLAGGED_TERMS = list(FAIR_HOUSING_RULES.keys())
