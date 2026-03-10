# LLM-backed feature services.
# Each module wraps one LLM use-case with:
#   - a structured system prompt that explicitly forbids fabrication
#   - deterministic data passed as context (the LLM explains, does not compute)
#   - LLMUnavailable caught at the call site — deterministic fallback is mandatory
