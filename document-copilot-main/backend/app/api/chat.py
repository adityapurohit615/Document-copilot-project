import asyncio
import json
import re
import uuid
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.assistant.agent import document_agent
from app.assistant.deps import DocumentAgentDeps
from app.assistant.outputs import Citation, GroundedAnswer
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

UUID_REGEX = re.compile(r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})", re.IGNORECASE)


class ChatMessageInput(BaseModel):
    role: str = Field(..., description="Role of the sender: 'user' or 'assistant'")
    content: str = Field(..., description="The message text")


class ChatStreamRequest(BaseModel):
    thread_id: uuid.UUID = Field(..., description="UUID of the chat thread")
    messages: list[ChatMessageInput] = Field(..., description="Conversation history")


def build_grounded_answer(
    raw_text: str,
    retrieved_passages: list,
    evidence_sufficient: bool = True,
) -> GroundedAnswer:
    """Builds a GroundedAnswer from raw text and retrieved passages, cleaning citations."""
    found_uuids = UUID_REGEX.findall(raw_text)

    # Index passages by lowercase chunk_id string
    passage_by_id = {str(getattr(p, "chunk_id", "")).lower(): p for p in retrieved_passages}

    citations: list[Citation] = []
    seen_cids = set()

    # 1. Add passages whose chunk_id was explicitly cited in raw_text
    for cid in found_uuids:
        cid_lower = cid.lower()
        if cid_lower not in seen_cids:
            p = passage_by_id.get(cid_lower)
            ticker = getattr(p, "ticker", "SEC") if p else "SEC"
            raw_snip = getattr(p, "text", "") if p else ""
            snippet = (raw_snip[:200] + "...") if len(raw_snip) > 200 else raw_snip
            citations.append(
                Citation(
                    chunk_id=cid,
                    ticker=ticker or "SEC",
                    snippet=snippet,
                )
            )
            seen_cids.add(cid_lower)

    # 2. If no chunk IDs cited in text, supplement with top retrieved passages
    if not citations and retrieved_passages:
        for p in retrieved_passages[:3]:
            cid = str(getattr(p, "chunk_id", ""))
            if cid and cid.lower() not in seen_cids:
                raw_snip = getattr(p, "text", "")
                snippet = (raw_snip[:200] + "...") if len(raw_snip) > 200 else raw_snip
                citations.append(
                    Citation(
                        chunk_id=cid,
                        ticker=getattr(p, "ticker", "SEC") or "SEC",
                        snippet=snippet,
                    )
                )
                seen_cids.add(cid.lower())

    # 3. Clean up the raw UUIDs in the text to readable bracketed numbers [1], [2], etc.
    clean_text = raw_text
    for idx, citation in enumerate(citations, 1):
        cid = citation.chunk_id
        pattern = r"[【\[\(]?(?:chunk:?\s*(?:id:?)?\s*)?" + re.escape(cid) + r"[】\]\)]?"
        clean_text = re.sub(pattern, f"[{idx}]", clean_text, flags=re.IGNORECASE)

    # Clean up leftover Chinese brackets
    clean_text = clean_text.replace("【", "[").replace("】", "]")

    return GroundedAnswer(
        answer=clean_text.strip(),
        citations=citations,
        evidence_sufficient=evidence_sufficient,
    )


def extract_grounded_answer_from_exception(
    err: Exception,
    retrieved_passages: list | None = None,
) -> GroundedAnswer | None:
    """Extracts GroundedAnswer if model generation completed but API provider failed tool validation."""
    body = getattr(err, "body", None)
    if isinstance(body, dict) and "failed_generation" in body:
        raw_gen = body["failed_generation"]
        if isinstance(raw_gen, str) and raw_gen.strip():
            # 1. Try JSON parsing
            try:
                parsed = json.loads(raw_gen, strict=False)
                args = parsed.get("arguments", parsed)
                if isinstance(args, str):
                    args = json.loads(args, strict=False)
                if isinstance(args, dict) and "answer" in args:
                    citations_list = []
                    for c in args.get("citations", []):
                        if isinstance(c, dict) and "chunk_id" in c:
                            citations_list.append(
                                Citation(
                                    chunk_id=str(c.get("chunk_id", "")),
                                    ticker=c.get("ticker", "SEC"),
                                    snippet=c.get("snippet", ""),
                                )
                            )
                    return GroundedAnswer(
                        answer=args["answer"],
                        citations=citations_list,
                        evidence_sufficient=args.get("evidence_sufficient", True),
                    )
            except Exception:
                pass

            # 2. Raw text generation fallback
            return build_grounded_answer(
                raw_text=raw_gen,
                retrieved_passages=retrieved_passages or [],
            )
    return None


async def chat_stream_generator(
    user_query: str,
    thread_id: uuid.UUID,
    user_id: uuid.UUID,
    user_email: str = "",
) -> AsyncGenerator[str, None]:
    """Runs the PydanticAI agent, validates citations, streams tokens, and saves to DB."""
    try:
        deps = DocumentAgentDeps(user_id=user_id, thread_id=thread_id)

        # 1. Run the agent (with fallback and failed_generation recovery)
        grounded_answer: GroundedAnswer | None = None
        try:
            result = await document_agent.run(user_query, deps=deps)
            out = result.output
            if isinstance(out, GroundedAnswer):
                grounded_answer = out
            else:
                grounded_answer = build_grounded_answer(str(out), deps.retrieved_passages)
        except Exception as run_err:
            recovered = extract_grounded_answer_from_exception(run_err, deps.retrieved_passages)
            if recovered:
                print("✅ Successfully recovered GroundedAnswer from Groq failed_generation!", flush=True)
                grounded_answer = recovered
            else:
                err_str = str(run_err).lower()
                if "model_not_found" in err_str or "does not exist" in err_str or "access to it" in err_str:
                    from app.assistant.agent import get_groq_provider
                    from pydantic_ai.models.openai import OpenAIChatModel
                    groq_provider = get_groq_provider()
                    if groq_provider:
                        print(f"⚠️ Primary model error ({run_err}), falling back to openai/gpt-oss-120b...", flush=True)
                        try:
                            m1 = OpenAIChatModel("openai/gpt-oss-120b", provider=groq_provider)
                            result = await document_agent.run(user_query, deps=deps, model=m1)
                            out = result.output
                            if isinstance(out, GroundedAnswer):
                                grounded_answer = out
                            else:
                                grounded_answer = build_grounded_answer(str(out), deps.retrieved_passages)
                        except Exception as fb_err:
                            rec_fb = extract_grounded_answer_from_exception(fb_err, deps.retrieved_passages)
                            if rec_fb:
                                grounded_answer = rec_fb
                            else:
                                print(f"⚠️ Fallback to 120b failed ({fb_err}), falling back to openai/gpt-oss-20b...", flush=True)
                                m2 = OpenAIChatModel("openai/gpt-oss-20b", provider=groq_provider)
                                try:
                                    result = await document_agent.run(user_query, deps=deps, model=m2)
                                    out = result.output
                                    if isinstance(out, GroundedAnswer):
                                        grounded_answer = out
                                    else:
                                        grounded_answer = build_grounded_answer(str(out), deps.retrieved_passages)
                                except Exception as fb2_err:
                                    rec_fb2 = extract_grounded_answer_from_exception(fb2_err, deps.retrieved_passages)
                                    if rec_fb2:
                                        grounded_answer = rec_fb2
                                    else:
                                        raise fb2_err
                    else:
                        raise run_err
                else:
                    raise run_err

        if not grounded_answer:
            raise RuntimeError("Failed to obtain grounded answer from agent.")

        # Ensure we have retrieved passages for citation validation
        passages = deps.retrieved_passages
        if not passages:
            passages = search_filings(user_query, limit=4)

        # If citations are empty, fill them from passages
        if not grounded_answer.citations and passages:
            grounded_answer = build_grounded_answer(grounded_answer.answer, passages)

        # 2. Validate citations
        validation = GroundingValidator.validate(grounded_answer, passages)
        if not validation.is_valid:
            print(f"[Grounding Warning]: {validation.error_message}", flush=True)

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

                # Save citations safely
                for c in grounded_answer.citations:
                    try:
                        cid_val = uuid.UUID(str(c.chunk_id))
                    except Exception:
                        continue
                    citation_record = MessageCitation(
                        id=uuid.uuid4(),
                        message_id=assistant_msg_id,
                        chunk_id=cid_val,
                        snippet=c.snippet,
                    )
                    session.add(citation_record)

                session.commit()
                print(f"✅ Successfully persisted thread {thread_id} and messages to Supabase", flush=True)
        except Exception as e:
            # Logging without breaking client stream
            print(f"[Database Error]: Failed to persist chat: {e}", flush=True)
    except Exception as e:
        print(f"[Chat Stream Generator Error]: {e}", flush=True)
        yield f"⚠️ Agent Error: {str(e)}"


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