# Gerenciamento de Estoque H2

Aplicativo em Expo + React Native para controlar itens de estoque, registrar movimentacoes de entrada e saida, e acompanhar historicos consolidados. O projeto usa SQLite no aparelho para funcionar offline e Supabase para sincronizar os dados entre maquinas.

## O que o projeto faz

- Cadastra itens com nome, unidade de medida e quantidade minima
- Permite editar itens ja cadastrados
- Registra entradas de estoque (incluindo estoque inicial)
- Registra saidas de estoque com validacao de saldo disponivel
- Atualiza o saldo atual automaticamente na aba Estoque
- Exibe historico diario das movimentacoes salvas
- Gera relatorio quinzenal e relatorio mensal
- Sincroniza itens e movimentacoes com o Supabase quando o `.env` esta configurado
- Exibe o status da sincronizacao na interface, com tentativa manual em caso de falha

## Stack do projeto

- Expo
- React Native
- TypeScript
- Expo SQLite
- Supabase REST API
- React Navigation

## Estrutura principal

- `src/screens`: telas de estoque, itens, entrada, saida e historico
- `src/database`: banco local SQLite, migracoes, repositorios e sync com Supabase
- `src/components`: componentes reutilizaveis da interface, incluindo o card de status do sync
- `supabase/schema.sql`: schema SQL do banco remoto no Supabase

## Como um novo usuario pode usar

### 1. Clonar o repositorio

```bash
git clone https://github.com/gabrielscand/Gerenciamento-Estoque-H2.git
cd Gerenciamento-Estoque-H2
```

### 2. Instalar as dependencias

```bash
npm install
```

### 3. Criar e configurar o `.env`

Use o arquivo de exemplo da raiz:

```bash
cp .env.example .env
```

Depois edite o `.env` e preencha com os dados do seu projeto Supabase:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

Observacoes importantes:

- O arquivo `.env` nao sobe para o GitHub
- Sem o `.env`, o app continua funcionando localmente com SQLite
- Para sincronizar entre maquinas, todas precisam usar o mesmo projeto Supabase

## Configuracao do Supabase

Se for a primeira vez configurando um banco novo para este projeto:

1. Crie um projeto no Supabase.
2. Abra o `SQL Editor`.
3. Rode o arquivo `supabase/schema.sql`.
4. Configure o `.env`.
5. Reinicie o Expo, se ele ja estiver aberto.

Se voce ja tinha um banco antigo rodando este projeto, rode novamente o `supabase/schema.sql` para aplicar as tabelas novas de catalogo (`item_categories` e `measurement_units`) e liberar categorias dinamicas.

Se voce ja vai usar o mesmo projeto Supabase que o restante do time, nao precisa rodar o schema novamente. Basta clonar o projeto, instalar as dependencias, configurar o `.env` e iniciar o app.

Observacao:

- O setup atual foi pensado como prototipo funcional de dono unico. Hoje o schema deixa o RLS desabilitado para simplificar. Se esse projeto for publicado para varios usuarios, o proximo passo recomendado e adicionar autenticacao e politicas de acesso no Supabase.

## Como abrir pelo terminal

### Iniciar o ambiente

```bash
npm run start
```

Isso abre o Expo/Metro no terminal.

### Abrir no navegador

```bash
npm run web
```

### Abrir em outras plataformas

```bash
npm run android
npm run ios
```

## Como fechar pelo terminal

Para encerrar o Expo/Metro que esta rodando no terminal atual:

```bash
Ctrl + C
```

Se alguma porta ficar presa por um processo antigo, descubra o PID e finalize manualmente. Exemplo com a porta `8081`:

```bash
lsof -nP -iTCP:8081 -sTCP:LISTEN
kill <PID>
```

Se o processo nao encerrar normalmente:

```bash
kill -9 <PID>
```

## Fluxo de uso em maquina nova

Sempre que abrir este projeto em outro computador:

1. Clone o repositorio.
2. Rode `npm install`.
3. Rode `cp .env.example .env`.
4. Preencha o `.env` com a URL e a publishable key do Supabase.
5. Rode `npm run start` ou `npm run web`.

Se o `.env` apontar para o mesmo projeto Supabase usado nas outras maquinas, os dados serao sincronizados automaticamente.

## Como a persistencia funciona

- O app grava os dados localmente em SQLite
- O SQLite permite continuar usando o app offline
- Quando o Supabase esta configurado, os dados locais sao enviados para a nuvem
- Ao abrir o app, ele tambem busca os dados remotos para manter as maquinas alinhadas
- A interface mostra o status da ultima sincronizacao e permite tentar novamente manualmente

## Scripts disponiveis

```bash
npm run start
npm run web
npm run android
npm run ios
npm run build:android:preview
npm run update:preview
npm run update:production
```

## Como gerar APK para o tablet

Este projeto ja esta preparado para gerar APK Android com EAS Build.

### 1. Fazer login na conta Expo

```bash
npm install -g eas-cli
eas login
```

### 2. Conferir se o `.env` esta preenchido

Antes do build, confirme se o arquivo `.env` tem as credenciais do Supabase:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

### 3. Gerar o APK

```bash
eas build --platform android --profile preview
```

Esse comando envia o projeto para a Expo e gera um APK instalavel.

### 4. Instalar no tablet

Quando o build terminar:

1. Abra o link gerado pela Expo.
2. Baixe o arquivo `.apk` no tablet.
3. Permita instalar apps desconhecidos, se o Android pedir.
4. Instale o APK.

## Como atualizar o app no tablet depois de mudar o codigo

Agora o projeto tambem esta configurado com `EAS Update`.

Importante:

- A versao do app que ja estava instalada antes dessa configuracao ainda nao recebe updates OTA.
- Para ativar esse fluxo no tablet, voce precisa instalar **mais um APK novo** gerado depois da configuracao do `EAS Update`.

### 0. Fazer a primeira instalacao compativel com EAS Update

Rode:

```bash
npm run build:android:preview
```

Depois baixe e instale esse APK no tablet. A partir dessa versao, o app passa a aceitar updates OTA do canal `preview`.

### Depois disso: atualizacao sem reinstalar APK

Sempre que voce alterar o codigo e quiser mandar a nova versao para o tablet, faca este fluxo:

### 1. Salvar as mudancas do projeto

Opcionalmente, voce pode fazer commit antes do build:

```bash
git add .
git commit -m "sua mensagem"
git push
```

### 2. Publicar o update OTA

```bash
npm run update:preview -- --message "sua mensagem"
```

Esse comando envia a nova versao JavaScript para o canal `preview`, que e o mesmo canal usado pelo APK do tablet.

### 3. Abrir o app no tablet

No tablet:

1. Feche o app completamente.
2. Abra o app de novo.
3. Aguarde alguns segundos.
4. Feche e abra novamente, se necessario.

Normalmente o update aparece apos reabrir o aplicativo.

## Quando precisa gerar um novo APK

Depois de instalar o APK compativel com `EAS Update`, voce **nao precisa reinstalar APK para toda mudanca**.

Mesmo assim, ainda existem casos em que o caminho certo continua sendo gerar um novo APK:

```bash
npm run build:android:preview
```

Isso vale para:

- primeira instalacao com suporte a `EAS Update`
- mudancas nativas ou de configuracao do Expo
- alteracoes em plugins
- mudancas que afetem o binario Android
- quando quiser reinstalar uma versao completa do app

## Quando o `EAS Update` e suficiente

Depois da nova instalacao do APK, o `EAS Update` funciona muito bem para:

- ajustes de layout
- textos
- telas
- regras de negocio em TypeScript/JavaScript
- mudancas de dashboard
- melhorias de fluxo no app

## Resumo rapido de onboarding

```bash
git clone https://github.com/gabrielscand/Gerenciamento-Estoque-H2.git
cd Gerenciamento-Estoque-H2
npm install
cp .env.example .env
npm run start
```

Depois disso, basta preencher o `.env` corretamente para ativar a sincronizacao com o Supabase.
