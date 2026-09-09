FROM python:3.12-slim

WORKDIR /app

# Install curl for healthchecks and build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast dependency installation
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy dependency specifications
COPY pyproject.toml .

# Install dependencies directly into system Python
RUN uv pip install --system -r pyproject.toml

# Copy backend application code & migrations
COPY . .

# Set default port fallback
ENV PORT=8000

EXPOSE 8000

# Start Uvicorn bound to Railway dynamic $PORT
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
