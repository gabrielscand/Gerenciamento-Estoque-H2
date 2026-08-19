// Processo principal do Electron: cria a janela e serve o app web exportado
// (pasta ./renderer) atraves do protocolo app://, garantindo uma origem fixa e
// segura. A origem fixa e importante: o banco local (OPFS/SQLite) e vinculado a
// origem, entao ela nao pode mudar entre execucoes.
const path = require('path');
const { pathToFileURL } = require('url');
const { app, BrowserWindow, Menu, net, protocol, shell } = require('electron');
const { autoUpdater } = require('electron-updater');

// Empacotado: o conteudo web fica em resources/renderer (fora do asar).
// Desenvolvimento: fica em desktop/renderer.
const RENDERER_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'renderer')
  : path.join(__dirname, 'renderer');
const APP_ORIGIN = 'app://local';

// O Content-Type precisa ser explicito: o SQLite (wa-sqlite) carrega o .wasm via
// WebAssembly.instantiateStreaming, que exige 'application/wasm'. Sem isso o
// banco local nao inicializa.
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

// Uma instancia so: evita duas janelas disputarem o mesmo arquivo do banco
// (a mesma trava que causa erro quando se abre duas abas no navegador).
const hasInstanceLock = app.requestSingleInstanceLock();

if (!hasInstanceLock) {
  app.quit();
} else {
  let mainWindow = null;

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  function registerAppProtocol() {
    protocol.handle('app', async (request) => {
      const requestUrl = new URL(request.url);
      let relativePath = decodeURIComponent(requestUrl.pathname);

      if (!relativePath || relativePath === '/') {
        relativePath = '/index.html';
      }

      const resolvedPath = path.normalize(path.join(RENDERER_DIR, relativePath));

      // Barreira contra path traversal (ex.: app://local/../../algo).
      if (!resolvedPath.startsWith(RENDERER_DIR)) {
        return new Response('Forbidden', { status: 403 });
      }

      const response = await net.fetch(pathToFileURL(resolvedPath).toString());
      const mimeType = MIME_TYPES[path.extname(resolvedPath).toLowerCase()];

      if (!mimeType) {
        return response;
      }

      const headers = new Headers(response.headers);
      headers.set('Content-Type', mimeType);

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    });
  }

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 900,
      minHeight: 600,
      show: false,
      title: 'Gerenciador de Estoque',
      backgroundColor: '#F5EEFB',
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    mainWindow.once('ready-to-show', () => {
      mainWindow.maximize();
      mainWindow.show();
    });

    // Espelha os logs da aplicacao no terminal: ajuda a diagnosticar falhas de
    // inicializacao (banco, rede) sem abrir o DevTools. Ativo em
    // desenvolvimento e tambem no build empacotado quando rodando o smoke test.
    if (!app.isPackaged || process.env.DESKTOP_SMOKE_TEST === '1') {
      mainWindow.webContents.on('console-message', (...args) => {
        const message = typeof args[0] === 'object' && args[0] !== null && 'message' in args[0]
          ? args[0].message
          : args[2];
        console.log(`[app] ${message}`);
      });

      mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, url) => {
        console.error(`[app] falha ao carregar ${url}: ${errorDescription} (${errorCode})`);
      });
    }

    // Teste automatizado: abre, espera carregar e fecha sozinho.
    if (process.env.DESKTOP_SMOKE_TEST === '1') {
      setTimeout(() => {
        console.log('[smoke-test] encerrando');
        app.quit();
      }, 20000);
    }

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    // Links externos abrem no navegador padrao, nunca dentro do app.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        void shell.openExternal(url);
      }
      return { action: 'deny' };
    });

    mainWindow.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith(APP_ORIGIN)) {
        event.preventDefault();
        if (url.startsWith('http://') || url.startsWith('https://')) {
          void shell.openExternal(url);
        }
      }
    });

    void mainWindow.loadURL(`${APP_ORIGIN}/index.html`);
  }

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    registerAppProtocol();
    createWindow();

    if (app.isPackaged) {
      autoUpdater.autoDownload = true;
      autoUpdater.checkForUpdatesAndNotify().catch(() => {
        // Sem internet ou sem release publicada: segue sem atualizar.
      });
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
