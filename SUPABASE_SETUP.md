# Supabase Setup

1. Crie um projeto no Supabase.
2. Abra o SQL Editor e rode o arquivo `supabase/schema.sql`.
3. Crie um arquivo `.env` a partir de `.env.example`.
4. Preencha `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
5. Reinicie o Expo.

Observacoes:

- O app continua funcionando localmente com SQLite mesmo sem configurar o Supabase.
- Esta configuracao inicial desabilita RLS para simplificar um prototipo de dono unico. Se voce for publicar o app para terceiros, o proximo passo precisa ser adicionar autenticacao e politicas de acesso.
- O login desta versao usa autenticacao interna do app (tabela `app_users`), sincronizada com Supabase. Nao usa Supabase Auth nesta etapa.
- Se voce ja tinha rodado um schema antigo, rode novamente `supabase/schema.sql` para aplicar as colunas novas em `stock_items` (`is_deleted`, `deleted_at`, `category`, `current_stock_quantity`) e em `daily_stock_entries` (`is_deleted`, `deleted_at`, `movement_type`, `stock_after_quantity`, `created_by_user_remote_id`, `created_by_username`).
- O schema mais recente tambem cria `app_users` para usuarios/funcoes/permissoes por aba. O seed inicial (`admh2`) e criado localmente quando nao existe usuario ativo.
- O schema mais recente remove a restricao unica de `(item_id, date)` em `daily_stock_entries` para permitir varias movimentacoes no mesmo dia (entrada e saida separadas).
- Exclusao de item e logica: o registro permanece em `stock_items` com `is_deleted = true` e `deleted_at` preenchido.
- Exclusao de movimentacao no historico diario tambem e logica: o registro permanece em `daily_stock_entries` com `is_deleted = true` e `deleted_at` preenchido.
- Exclusao de usuario no Painel ADM e logica: o registro permanece em `app_users` com `is_deleted = true` e `deleted_at` preenchido.
- Categoria e obrigatoria no app para novos cadastros, mas itens legados podem ficar com `category = NULL` ate serem editados.
- Para visualizar apenas itens ativos no painel SQL, prefira a view `public.stock_items_active`.
- Para consultar itens arquivados, use a view `public.stock_items_archived`.
- Para visualizar apenas usuarios ativos, use a view `public.app_users_active`.

Consultas uteis no SQL Editor:

```sql
select * from public.stock_items_active order by updated_at desc;
select * from public.stock_items_archived order by updated_at desc;
select id, name, category from public.stock_items where category is null order by updated_at desc;
select id, name, current_stock_quantity, min_quantity from public.stock_items order by updated_at desc;
select id, item_id, date, quantity, movement_type, stock_after_quantity, is_deleted, deleted_at from public.daily_stock_entries order by updated_at desc;
select id, username, function_name, is_admin, is_deleted from public.app_users order by updated_at desc;
select * from public.app_users_active order by updated_at desc;
```
