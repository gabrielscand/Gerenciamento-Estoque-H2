// Prepara o empacotamento do app desktop:
// 1) copia o export web (../dist) para ./renderer
// 2) copia o icone do app para ./build/icon.png (o electron-builder gera o .ico)
// 3) sincroniza a versao com a do package.json raiz (usada pelo auto-update)
'use strict';

const fs = require('fs');
const path = require('path');

const DESKTOP_DIR = path.join(__dirname, '..');
const ROOT_DIR = path.join(DESKTOP_DIR, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const RENDERER_DIR = path.join(DESKTOP_DIR, 'renderer');
const BUILD_DIR = path.join(DESKTOP_DIR, 'build');
const SOURCE_ICON = path.join(ROOT_DIR, 'assets', 'icon.png');

function fail(message) {
  console.error(`[desktop] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  fail('dist/index.html nao encontrado. Rode primeiro: npx expo export --platform web');
}

fs.rmSync(RENDERER_DIR, { recursive: true, force: true });
fs.cpSync(DIST_DIR, RENDERER_DIR, { recursive: true });
console.log('[desktop] renderer atualizado a partir de dist/');

fs.mkdirSync(BUILD_DIR, { recursive: true });

if (fs.existsSync(SOURCE_ICON)) {
  fs.copyFileSync(SOURCE_ICON, path.join(BUILD_DIR, 'icon.png'));
  console.log('[desktop] icone copiado');
} else {
  console.warn('[desktop] assets/icon.png nao encontrado; o instalador usara o icone padrao');
}

// Mantem a versao do desktop igual a do app (o auto-update compara versoes).
const rootPackage = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
const desktopPackagePath = path.join(DESKTOP_DIR, 'package.json');
const desktopPackage = JSON.parse(fs.readFileSync(desktopPackagePath, 'utf8'));

if (rootPackage.version && desktopPackage.version !== rootPackage.version) {
  desktopPackage.version = rootPackage.version;
  fs.writeFileSync(desktopPackagePath, `${JSON.stringify(desktopPackage, null, 2)}\n`, 'utf8');
  console.log(`[desktop] versao sincronizada: ${rootPackage.version}`);
}

console.log('[desktop] pronto para empacotar');
