import uuid
from dataclasses import dataclass


@dataclass
class DocumentAgentDeps:
    """Runtime dependencies injected into the PydanticAI agent."""
    user_id: uuid.UUID
    thread_id: uuid.UUID