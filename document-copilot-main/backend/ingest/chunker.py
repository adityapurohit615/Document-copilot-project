from dataclasses import dataclass


@dataclass
class TextChunk:
    chunk_index: int
    text: str
    token_count: int


def estimate_tokens(text: str) -> int:
    """Fast approximation of token count (~4 characters per token in English)."""
    return max(1, len(text) // 4)


def chunk_text(
    text: str,
    target_tokens: int = 600,
    overlap_tokens: int = 100,
) -> list[TextChunk]:
    """Splits normalized text into overlapping chunks, respecting paragraph
    boundaries wherever possible.
    """
    target_chars = target_tokens * 4
    overlap_chars = overlap_tokens * 4

    # 1. Split into natural paragraphs
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]

    chunks: list[TextChunk] = []
    current_chunk: list[str] = []
    current_length = 0
    chunk_index = 0

    for paragraph in paragraphs:
        para_len = len(paragraph)

        # If adding this paragraph exceeds target size and we already have content
        if current_length + para_len > target_chars and current_chunk:
            combined_text = "\n\n".join(current_chunk)
            chunks.append(
                TextChunk(
                    chunk_index=chunk_index,
                    text=combined_text,
                    token_count=estimate_tokens(combined_text),
                )
            )
            chunk_index += 1

            # Keep the trailing portion for overlap
            overlap_buffer = ""
            for item in reversed(current_chunk):
                if len(overlap_buffer) + len(item) <= overlap_chars:
                    overlap_buffer = item + "\n\n" + overlap_buffer if overlap_buffer else item
                else:
                    break

            current_chunk = [overlap_buffer] if overlap_buffer else []
            current_length = len(overlap_buffer)

        current_chunk.append(paragraph)
        current_length += para_len

    # Add remaining text as the last chunk
    if current_chunk:
        combined_text = "\n\n".join(current_chunk)
        chunks.append(
            TextChunk(
                chunk_index=chunk_index,
                text=combined_text,
                token_count=estimate_tokens(combined_text),
            )
        )

    return chunks