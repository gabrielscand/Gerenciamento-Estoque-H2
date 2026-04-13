# Import API (.xlsx)

Backend Node/Express para importacao em duas fases (`preview` + `commit`) no endpoint:

- `POST /api/import-items?phase=preview`
- `POST /api/import-items?phase=commit`

## Como rodar

1. Entre na pasta `backend`.
2. Rode `npm install`.
3. Copie `.env.example` para `.env` e preencha `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.
4. Rode `npm run start`.

Servidor padrao: `http://localhost:3001`
