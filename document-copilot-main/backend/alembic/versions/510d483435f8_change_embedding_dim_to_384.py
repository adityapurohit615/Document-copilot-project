"""change_embedding_dim_to_384

Revision ID: 510d483435f8
Revises: a0119fb3c466
Create Date: 2026-09-09 03:10:47.016168

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '510d483435f8'
down_revision: Union[str, Sequence[str], None] = 'a0119fb3c466'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop old index, alter column to 384 dims, and recreate HNSW index
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_embedding_hnsw;")
    op.execute("ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector(384);")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_document_chunks_embedding_hnsw "
        "ON document_chunks USING hnsw (embedding vector_cosine_ops);"
    )

def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_embedding_hnsw;")
    op.execute("ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector(1536);")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_document_chunks_embedding_hnsw "
        "ON document_chunks USING hnsw (embedding vector_cosine_ops);"
    )