from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from app.database.config import settings
from app.auth.dependencies import get_current_user, AuthenticatedUser
from app.api.chat import router as chat_router  # <--- Import chat router

app = FastAPI(title="Document Copilot", version="0.1.0")

# Setup CORS
origins = [origin.strip() for origin in settings.allowed_origins.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(chat_router, prefix="/chat", tags=["chat"])  # <--- Mount here

@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}

@app.get("/auth/me")
async def get_me(current_user: AuthenticatedUser = Depends(get_current_user)) -> dict[str, str]:
    return {
        "user_id": str(current_user.id),
        "email": current_user.email,
    }