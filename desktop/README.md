# Gerenciador de Estoque — aplicativo desktop (Windows)

Empacota o app web (Expo/react-native-web) num executável Windows usando Electron.

## Como funciona

- O comando de build gera o site (`expo export --platform web` → pasta `dist/`) e copia
  para `desktop/renderer/`.
- O Electron serve esses arquivos pelo protocolo **`app://local`** (ver `main.js`).
  Isso é essencial por dois motivos:
  - **Origem fixa**: o banco local (SQLite/OPFS) é vinculado à origem. Se a origem
    mudasse a cada execução, o app abriria com o banco vazio toda vez.
  - **Tipos MIME corretos**: o SQLite carrega um arquivo `.wasm` que exige
    `application/wasm`; sem isso o banco não inicializa.
- O app roda em **instância única**: abrir o programa duas vezes apenas foca a janela
  já aberta (duas janelas disputando o mesmo banco causaria erro).

## Comandos (rodar na raiz do projeto)

```bash
npm run desktop:dev
```
Abre o app em modo desenvolvimento (usa o `renderer/` já preparado).

```bash
npm run desktop:build
```
Gera o instalador em `desktop/release/` (ex.: `GerenciadorDeEstoque-Setup-1.0.0.exe`).
**Não** publica nada.

```bash
npm run desktop:publish
```
Gera o instalador **e publica** como release no GitHub (necessário para o
auto-update). Exige o token — veja abaixo.

## Publicar uma nova versão (auto-update)

O app verifica atualizações sozinho ao abrir, baixa em segundo plano e instala ao
fechar o programa.

1. **Aumente a versão** em `package.json` da raiz (ex.: `1.0.0` → `1.0.1`).
   O script `prepare.js` sincroniza essa versão com o desktop automaticamente.
2. **Configure o token do GitHub** (só na primeira vez, no PowerShell):
   ```powershell
   $env:GH_TOKEN = "seu_token_aqui"
   ```
   O token é um *Personal Access Token* do GitHub com permissão de escrita em
   releases do repositório (`Contents: Read and write`).
3. **Publique**:
   ```bash
   npm run desktop:publish
   ```
4. Confira a release em: https://github.com/gabrielscand/Gerenciamento-Estoque-H2/releases

Quem já tem o app instalado receberá a atualização automaticamente na próxima vez
que abrir (instala ao fechar).

## Observações

- **Aviso do Windows**: por não ter assinatura digital, o Windows pode exibir
  "aplicativo desconhecido" na primeira instalação (basta continuar). Remover esse
  aviso exige comprar um certificado de assinatura de código.
- **Dados**: o app desktop tem seu próprio banco local, separado do navegador. Na
  primeira execução ele sincroniza tudo a partir do Supabase.
- Desinstalar **não apaga** os dados locais (`deleteAppDataOnUninstall: false`).
