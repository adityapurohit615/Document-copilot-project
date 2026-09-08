from pathlib import Path
from pydantic_ai import Agent, RunContext
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider

from app.assistant.deps import DocumentAgentDeps
from app.assistant.outputs import GroundedAnswer
from app.database.config import settings
from app.retrieval.retriever import search_filings

# 1. Configure the Hugging Face OpenAI-compatible provider
provider = OpenAIProvider(
    base_url="https://router.huggingface.co/v1",
    api_key=settings.huggingface_api_key,
)

# 2. Llama-3.3-70B is fast, capable, and excels at citations
llm_model = OpenAIChatModel(
    "meta-llama/Llama-3.3-70B-Instruct",
    provider=provider,
)

# 3. Load System Instructions from instructions.md
INSTRUCTIONS_PATH = Path(__file__).parent / "instructions.md"
SYSTEM_PROMPT = INSTRUCTIONS_PATH.read_text(encoding="utf-8")

# 4. Create the Typed Agent
document_agent = Agent(
    model=llm_model,
    deps_type=DocumentAgentDeps,
    output_type=GroundedAnswer,
    system_prompt=SYSTEM_PROMPT,
    model_settings={"parallel_tool_calls": False},
)


# 5. Register the Retrieval Tool
@document_agent.tool
def search_sec_filings(
    ctx: RunContext[DocumentAgentDeps],
    query: str,
    ticker: str | None = None,
) -> str:
    """Searches the SEC filing corpus using semantic vector search.

    Args:
        query: Natural language financial query (e.g., 'Apple total net sales 2025')
        ticker: Optional stock ticker filter (e.g., 'AAPL')

    Returns:
        Formatted passages with chunk IDs and filing metadata.
    """
    results = search_filings(query=query, ticker=ticker, limit=4)

    if not results:
        return "No relevant passages found in the SEC filings."

    formatted_passages = []
    for i, p in enumerate(results, 1):
        formatted_passages.append(
            f"[Passage {i}]\n"
            f"Chunk ID: {p.chunk_id}\n"
            f"Company: {p.company_name} ({p.ticker})\n"
            f"Filing Date: {p.filing_date}\n"
            f"Content:\n{p.text}\n"
        )

    return "\n---\n".join(formatted_passages)