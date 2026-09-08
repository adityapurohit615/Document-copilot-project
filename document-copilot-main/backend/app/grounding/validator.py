import uuid
from dataclasses import dataclass
from app.assistant.outputs import GroundedAnswer
from app.retrieval.retriever import RetrievedPassage


@dataclass
class ValidationResult:
    is_valid: bool
    error_message: str | None = None


class GroundingValidator:
    """Enforces that AI answers strictly cite retrieved evidence."""

    @staticmethod
    def validate(
        answer: GroundedAnswer,
        retrieved_passages: list[RetrievedPassage],
    ) -> ValidationResult:
        # 1. If evidence is insufficient, no citations are required
        if not answer.evidence_sufficient:
            return ValidationResult(is_valid=True)

        # 2. If claims were made, at least one citation must be provided
        if not answer.citations:
            return ValidationResult(
                is_valid=False,
                error_message="Answer made claims without providing any citations.",
            )

        # Set of legitimate chunk IDs retrieved during this turn
        valid_chunk_ids = {str(p.chunk_id) for p in retrieved_passages}

        # 3. Verify every citation maps to a real retrieved chunk
        for citation in answer.citations:
            if citation.chunk_id not in valid_chunk_ids:
                return ValidationResult(
                    is_valid=False,
                    error_message=f"Hallucinated citation: Chunk {citation.chunk_id} was not retrieved.",
                )

        return ValidationResult(is_valid=True)