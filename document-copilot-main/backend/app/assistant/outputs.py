import uuid
from pydantic import BaseModel, Field


class Citation(BaseModel):
    """A citation referencing a specific passage in a retrieved filing."""
    chunk_id: str = Field(..., description="UUID of the cited document chunk")
    ticker: str = Field(..., description="Company ticker, e.g., 'AAPL'")
    snippet: str = Field(..., description="Exact excerpt or figure supporting the statement")


class GroundedAnswer(BaseModel):
    """The structured answer returned by Document Copilot."""
    answer: str = Field(
        ...,
        description="The detailed, analyst-grade answer synthesized exclusively from retrieved passages."
    )
    citations: list[Citation] = Field(
        default_factory=list,
        description="List of verified citations proving the claims in the answer."
    )
    evidence_sufficient: bool = Field(
        default=True,
        description="False if the corpus did not contain enough evidence to answer the question."
    )