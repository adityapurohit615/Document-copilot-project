from dataclasses import dataclass
import uuid
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.database.supabase import supabase

# FastAPI security scheme for Bearer token
security = HTTPBearer()


@dataclass
class AuthenticatedUser:
    """Typed container for the verified user identity."""
    id: uuid.UUID
    email: str


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> AuthenticatedUser:
    """Verifies the Supabase JWT token and extracts the user.

    Raises:
        HTTPException: 401 Unauthorized if the token is invalid or expired.
    """
    token = credentials.credentials

    try:
        # Call Supabase Auth to verify the token
        response = supabase.auth.get_user(token)
        user = response.user

        if not user or not user.id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired authentication token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        return AuthenticatedUser(
            id=uuid.UUID(user.id),
            email=user.email or "",
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )