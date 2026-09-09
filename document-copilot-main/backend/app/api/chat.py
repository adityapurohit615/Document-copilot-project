import asyncio
import json
import uuid
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.assistant.agent import document_agent
from app.assistant.deps import DocumentAgentDeps
from app.auth.dependencies import AuthenticatedUser, get_current_user
from app.database.config import settings
from app.database.models import (
    ChatMessage,
    ChatThread,
    DocumentChunk,
    MessageCitation,
    Profile,
)
from app.grounding.validator import GroundingValidator
from app.retrieval.retriever import search_filings

router = APIRouter()

# Engine setup
db_url = settings.database_url
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)
elif db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+psycopg://", 1)
engine = create_engine(db_url)


class ChatMessageInput(BaseModel):
    role: str = Field(..., description="Role of the sender: 'user' or 'assistant'")
    content: str = Field(..., description="The message text")


class ChatStreamRequest(BaseModel):
    thread_id: uuid.UUID = Field(..., description="UUID of the chat thread")
    messages: list[ChatMessageInput] = Field(..., description="Conversation history")


async def chat_stream_generator(
    user_query: str,
    thread_id: uuid.UUID,
    user_id: uuid.UUID,
    user_email: str = "",
) -> AsyncGenerator[str, None]:
    """Runs the PydanticAI agent, validates citations, streams tokens, and saves to DB."""
    deps = DocumentAgentDeps(user_id=user_id, thread_id=thread_id)

    # 1. Run the agent
    result = await document_agent.run(user_query, deps=deps)
    grounded_answer = result.output

    # 2. Validate citations
    # Fetch passages to verify citations against
    passages = search_filings(user_query, limit=4)
    validation = GroundingValidator.validate(grounded_answer, passages)

    if not validation.is_valid:
        yield f"[Grounding Warning]: {validation.error_message}\n\n"

    # 3. Stream the answer text word-by-word
    words = grounded_answer.answer.split(" ")
    for word in words:
        yield f"{word} "
        await asyncio.sleep(0.02)

    # 4. Stream structured citation metadata for frontend interactive badges
    if grounded_answer.citations:
        citations_payload = [
            {
                "chunk_id": str(c.chunk_id),
                "ticker": c.ticker,
                "snippet": c.snippet,
            }
            for c in grounded_answer.citations
        ]
        yield f"\n\n<!--CITATIONS:{json.dumps(citations_payload)}-->\n"

    # 5. Persist to Supabase in a background transaction
    try:
        with Session(engine) as session:
            # Ensure profile exists in public.profiles to satisfy Foreign Key
            profile = session.get(Profile, user_id)
            if not profile:
                profile = Profile(
                    id=user_id,
                    email=user_email or "analyst@firm.com",
                )
                session.add(profile)
                session.flush()

            # Ensure thread exists or create it
            thread = session.get(ChatThread, thread_id)
            if not thread:
                thread = ChatThread(
                    id=thread_id,
                    user_id=user_id,
                    title=user_query[:50] + ("..." if len(user_query) > 50 else ""),
                )
                session.add(thread)
                session.flush()

            # Save user message
            user_msg = ChatMessage(
                id=uuid.uuid4(),
                thread_id=thread_id,
                role="user",
                content=user_query,
            )
            session.add(user_msg)

            # Save assistant message
            assistant_msg_id = uuid.uuid4()
            asst_msg = ChatMessage(
                id=assistant_msg_id,
                thread_id=thread_id,
                role="assistant",
                content=grounded_answer.answer,
            )
            session.add(asst_msg)

            # Save citations
            for c in grounded_answer.citations:
                citation_record = MessageCitation(
                    id=uuid.uuid4(),
                    message_id=assistant_msg_id,
                    chunk_id=uuid.UUID(c.chunk_id),
                    snippet=c.snippet,
                )
                session.add(citation_record)

            session.commit()
            print(f"✅ Successfully persisted thread {thread_id} and messages to Supabase")
    except Exception as e:
        # Logging without breaking client stream
        print(f"[Database Error]: Failed to persist chat: {e}")


@router.post("/stream")
async def chat_stream(
    request: ChatStreamRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> StreamingResponse:
    if not request.messages:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Messages list cannot be empty",
        )

    last_user_message = request.messages[-1].content

    return StreamingResponse(
        chat_stream_generator(
            user_query=last_user_message,
            thread_id=request.thread_id,
            user_id=current_user.id,
            user_email=current_user.email,
        ),
        media_type="text/plain",
    )

# ==========================================
# Thread Management Endpoints
# ==========================================

@router.get("/threads")
async def list_user_threads(
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> list[dict]:
    """Returns all chat threads belonging to the authenticated analyst."""
    with Session(engine) as session:
        stmt = (
            select(ChatThread)
            .where(ChatThread.user_id == current_user.id)
            .order_by(ChatThread.updated_at.desc())
        )
        threads = session.scalars(stmt).all()
        return [
            {
                "id": str(t.id),
                "title": t.title,
                "created_at": t.created_at.isoformat(),
                "updated_at": t.updated_at.isoformat(),
            }
            for t in threads
        ]


@router.get("/threads/{thread_id}/messages")
async def get_thread_messages(
    thread_id: uuid.UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> list[dict]:
    """Loads all message turns and citations for a specific thread."""
    with Session(engine) as session:
        # Verify ownership
        thread = session.get(ChatThread, thread_id)
        if not thread or thread.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Thread not found",
            )

        stmt = (
            select(ChatMessage)
            .where(ChatMessage.thread_id == thread_id)
            .order_by(ChatMessage.created_at.asc())
        )
        messages = session.scalars(stmt).all()

        results = []
        for m in messages:
            msg_dict = {
                "id": str(m.id),
                "role": m.role,
                "content": m.content,
                "created_at": m.created_at.isoformat(),
                "citations": [
                    {
                        "chunk_id": str(c.chunk_id),
                        "snippet": c.snippet,
                        "ticker": c.chunk.document.ticker if c.chunk and c.chunk.document else "SEC",
                        "company_name": c.chunk.document.company_name if c.chunk and c.chunk.document else "",
                    }
                    for c in m.citations
                ],
            }
            results.append(msg_dict)

        return results


@router.get("/chunks/{chunk_id}")
async def get_chunk_detail(
    chunk_id: uuid.UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    """Returns the full text passage and SEC filing metadata for a chunk."""
    with Session(engine) as session:
        chunk = session.get(DocumentChunk, chunk_id)
        if not chunk:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document chunk not found",
            )
        doc = chunk.document
        return {
            "chunk_id": str(chunk.id),
            "chunk_index": chunk.chunk_index,
            "chunk_text": chunk.chunk_text,
            "token_count": chunk.token_count,
            "ticker": doc.ticker if doc else "UNKNOWN",
            "company_name": doc.company_name if doc else "Unknown Company",
            "filing_type": doc.filing_type if doc else "10-K",
            "filing_date": doc.filing_date.isoformat() if doc and doc.filing_date else "",
            "source_url": doc.source_url if doc else "",
            "accession_number": doc.accession_number if doc else "",
        }