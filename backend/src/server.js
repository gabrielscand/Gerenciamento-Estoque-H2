require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { handleImportItems } = require('./controllers/importItemsController');

const app = express();
const port = Number(process.env.PORT ?? '3001');

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/import-items', handleImportItems);

app.use((error, _req, res, _next) => {
  const message = error instanceof Error ? error.message : 'Erro inesperado na importacao.';
  console.error('[import-api] erro', message);
  res.status(400).json({ error: message });
});

app.listen(port, () => {
  console.log(`[import-api] online na porta ${port}`);
});
