# Supabase Setup

1. Crie um projeto no Supabase.
2. Abra o SQL Editor e rode o arquivo `supabase/schema.sql`.
3. Crie um arquivo `.env` a partir de `.env.example`.
4. Preencha `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
5. Reinicie o Expo.

Observacoes:

- O app continua funcionando localmente com SQLite mesmo sem configurar o Supabase.
- Esta configuracao inicial desabilita RLS para simplificar um prototipo de dono unico. Se voce for publicar o app para terceiros, o proximo passo precisa ser adicionar autenticacao e politicas de acesso.
