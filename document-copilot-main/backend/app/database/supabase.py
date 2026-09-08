from supabase import Client, create_client
from app.database.config import settings

# 1. Standard client (uses anon key for user-level verification)
supabase: Client = create_client(
    settings.supabase_url,
    settings.supabase_anon_key
)

# 2. Admin client (uses service role key - ONLY for privileged backend tasks)
supabase_admin: Client = create_client(
    settings.supabase_url,
    settings.supabase_service_role_key
)