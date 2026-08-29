# Cifro API

API FastAPI do Cifro.

## Rodar localmente

Na raiz do projeto:

```bash
source .venv/bin/activate
python -m uvicorn apps.backend.app.main:app --reload --port 8000
```

Variáveis mínimas no `.env`:

```env
DATABASE_URL=...
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=...
CORS_ORIGINS=http://localhost:3000
```

O backend valida o token de sessão recebido no cabeçalho `Authorization` usando
o endpoint de autenticação do Supabase. A chave `SUPABASE_ANON_KEY` pode ser a
publishable/anon key do projeto; nunca use a `service_role` no frontend.
