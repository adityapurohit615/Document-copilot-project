import uuid
from dataclasses import dataclass, field
from typing import Any


@dataclass
class DocumentAgentDeps:
    """Runtime dependencies injected into the PydanticAI agent."""
    user_id: uuid.UUID
    thread_id: uuid.UUID
    retrieved_passages: list[Any] = field(default_factory=list)