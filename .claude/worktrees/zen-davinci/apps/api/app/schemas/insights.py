from pydantic import BaseModel, Field


class MarketingPackageInput(BaseModel):
    photo_count: int = Field(ge=0)
    min_resolution_short_side: int = Field(ge=0)
    rooms_covered: list[str]
    description_text: str


class MarketingPackageScore(BaseModel):
    metric_key: str
    version: str
    score_0_100: float
    breakdown: dict
    flagged_terms: list[str]
    formula_markdown: str
    inputs: dict
    provenance: dict
