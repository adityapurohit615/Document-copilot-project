import httpx
from app.database.config import settings

HF_API_URL = f"https://router.huggingface.co/hf-inference/models/{settings.embedding_model}/pipeline/feature-extraction"


def embed_query(query_text: str) -> list[float]:
    """Generates a 384-dimensional embedding for a single user query."""
    headers = {"Authorization": f"Bearer {settings.huggingface_api_key}"}

    with httpx.Client(timeout=60.0) as client:
        response = client.post(
            HF_API_URL,
            headers=headers,
            json={
                "inputs": query_text,
                "options": {"wait_for_model": True}
            },
        )

        if response.status_code != 200:
            raise RuntimeError(
                f"Failed to embed query ({response.status_code}): {response.text}"
            )

        data = response.json()

        # If HF returns a list of lists, take the first one
        if isinstance(data, list) and len(data) > 0 and isinstance(data[0], list):
            return data[0]
        return data