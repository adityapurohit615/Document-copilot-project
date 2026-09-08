import uuid
from dataclasses import dataclass
from datetime import date
from typing import Any

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.database.config import settings
from app.database.models import DocumentChunk, SourceDocument
from app.retrieval.embedder import embed_query

# Database engine helper
db_url = settings.database_url
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)
elif db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+psycopg://", 1)

engine = create_engine(db_url)


@dataclass
class RetrievedPassage:
    """A single retrieved passage from an SEC filing."""
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    ticker: str
    company_name: str
    filing_date: date
    chunk_index: int
    text: str
    similarity_score: float  # Higher is better (0.0 to 1.0)
    metadata: dict[str, Any] | None


def search_filings(
    query: str,
    ticker: str | None = None,
    limit: int = 4,
) -> list[RetrievedPassage]:
    """Performs semantic vector search against document_chunks in Supabase."""
    # 1. Generate query vector
    query_vector = embed_query(query)

    # 2. Build pgvector cosine distance query
    # In pgvector: distance = 0 means identical, distance = 2 means opposite.
    distance_col = DocumentChunk.embedding.cosine_distance(query_vector).label("distance")

    stmt = (
        select(DocumentChunk, SourceDocument, distance_col)
        .join(SourceDocument, DocumentChunk.document_id == SourceDocument.id)
    )

    # Optional filter by company ticker (e.g. 'AAPL')
    if ticker:
        stmt = stmt.where(SourceDocument.ticker == ticker.upper())

    # Order by nearest cosine distance
    stmt = stmt.order_by(distance_col).limit(limit)

    passages: list[RetrievedPassage] = []

    with Session(engine) as session:
        results = session.execute(stmt).all()

        for chunk, doc, distance in results:
            # Convert cosine distance to a similarity score (1 - distance)
            score = round(1.0 - float(distance), 4)

            passages.append(
                RetrievedPassage(
                    chunk_id=chunk.id,
                    document_id=doc.id,
                    ticker=doc.ticker,
                    company_name=doc.company_name,
                    filing_date=doc.filing_date,
                    chunk_index=chunk.chunk_index,
                    text=chunk.chunk_text,
                    similarity_score=score,
                    metadata=chunk.metadata_,
                )
            )

    return passages