import json
import uuid
from datetime import datetime
from pathlib import Path
import httpx

from openai import OpenAI
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.database.config import settings
from app.database.models import DocumentChunk, SourceDocument
from ingest.chunker import chunk_text
from ingest.parser import parse_sec_html

# Company names lookup
COMPANY_NAMES = {
    "AAPL": "Apple Inc.",
    "MSFT": "Microsoft Corporation",
    "NVDA": "NVIDIA Corporation",
    "AMZN": "Amazon.com, Inc.",
    "GOOGL": "Alphabet Inc.",
}

# Resolve paths
DOWNLOADS_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "downloads"
MANIFEST_PATH = DOWNLOADS_DIR / "manifest.json"

# Database engine helper (handles postgresql+psycopg prefix)
db_url = settings.database_url
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)
elif db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+psycopg://", 1)

engine = create_engine(db_url)
HF_API_URL = f"https://router.huggingface.co/hf-inference/models/{settings.embedding_model}/pipeline/feature-extraction"




def get_embeddings_batch(texts: list[str], batch_size: int = 20) -> list[list[float]]:
    """Generates embeddings using Hugging Face Inference API."""
    all_embeddings: list[list[float]] = []
    headers = {"Authorization": f"Bearer {settings.huggingface_api_key}"}
    with httpx.Client(timeout=60.0) as client:
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            response = client.post(
                HF_API_URL,
                headers=headers,
                json={"inputs": batch},
            )
            if response.status_code != 200:
                raise RuntimeError(
                    f"Hugging Face API Error ({response.status_code}): {response.text}"
                )
            batch_embeddings = response.json()
            all_embeddings.extend(batch_embeddings)
    return all_embeddings


def ingest_filing(filing_meta: dict, session: Session) -> bool:
    """Ingests a single filing into Supabase. Returns True if ingested, False if skipped."""
    accession_number = filing_meta["accession_number"]
    ticker = filing_meta["ticker"]

    # 1. Idempotency check: Skip if already exists
    stmt = select(SourceDocument).where(SourceDocument.accession_number == accession_number)
    existing_doc = session.scalars(stmt).first()
    if existing_doc:
        print(f"⏩ [Skip] {ticker} {accession_number} is already in database.")
        return False

    # 2. Read raw HTML
    html_file = DOWNLOADS_DIR / filing_meta["local_path"]
    if not html_file.exists():
        print(f"⚠️ [Error] File not found: {html_file}")
        return False

    print(f"\n📄 Ingesting {ticker} ({filing_meta['filing_date']})...")
    raw_html = html_file.read_text(encoding="utf-8", errors="ignore")

    # 3. Clean and parse HTML to text
    clean_text = parse_sec_html(raw_html)
    print(f"   ✓ Parsed text ({len(clean_text):,} characters)")

    # 4. Chunk text
    chunks = chunk_text(clean_text)
    print(f"   ✓ Generated {len(chunks)} chunks")

    # 5. Generate embeddings in batches
    print(f"   ✓ Computing embeddings with {settings.embedding_model}...")
    chunk_texts = [c.text for c in chunks]
    embeddings = get_embeddings_batch(chunk_texts)

    # 6. Insert parent document record
    doc_id = uuid.uuid4()
    filing_date = datetime.strptime(filing_meta["filing_date"], "%Y-%m-%d").date()

    source_doc = SourceDocument(
        id=doc_id,
        ticker=ticker,
        company_name=COMPANY_NAMES.get(ticker, ticker),
        filing_type=filing_meta["form"],
        filing_date=filing_date,
        accession_number=accession_number,
        source_url=filing_meta["source_url"],
        content=clean_text,
    )
    session.add(source_doc)

    # 7. Insert chunk records
    for c, emb in zip(chunks, embeddings):
        chunk_record = DocumentChunk(
            id=uuid.uuid4(),
            document_id=doc_id,
            chunk_index=c.chunk_index,
            chunk_text=c.text,
            token_count=c.token_count,
            embedding=emb,
            metadata_={
                "ticker": ticker,
                "year": filing_date.year,
                "filing_date": filing_meta["filing_date"],
                "accession_number": accession_number,
            },
        )
        session.add(chunk_record)

    session.commit()
    print(f"   ✅ Successfully committed {ticker} and {len(chunks)} chunks to Supabase!")
    return True


def run_pipeline(limit: int | None = 1) -> None:
    """Runs the ingestion pipeline.

    Args:
        limit: Max number of filings to ingest. Default is 1 for testing.
               Pass None to ingest all filings.
    """
    if not MANIFEST_PATH.exists():
        print(f"Manifest not found at {MANIFEST_PATH}")
        return

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    filings = manifest.get("filings", [])

    print(f"Found {len(filings)} filings in manifest.")
    if limit:
        print(f"Running in test mode: ingesting {limit} filing(s).")
        filings = filings[:limit]

    with Session(engine) as session:
        for filing in filings:
            ingest_filing(filing, session)


if __name__ == "__main__":
    import sys

    # If user runs `uv run python ingest/pipeline.py all`, process all filings.
    # Otherwise, default to ingesting 1 filing first as a test.
    if len(sys.argv) > 1 and sys.argv[1].lower() == "all":
        run_pipeline(limit=None)
    else:
        run_pipeline(limit=1)