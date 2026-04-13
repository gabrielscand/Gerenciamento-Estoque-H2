const path = require('path');
const multer = require('multer');
const { previewImport, commitImport } = require('../services/importItemsService');

const maxFileSizeMb = Number(process.env.IMPORT_MAX_FILE_SIZE_MB ?? '8');
const maxFileSizeBytes = Number.isFinite(maxFileSizeMb) && maxFileSizeMb > 0 ? maxFileSizeMb * 1024 * 1024 : 8 * 1024 * 1024;

function isAllowedMimeType(mimeType) {
  if (!mimeType) {
    return true;
  }

  return [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
    'application/zip',
  ].includes(String(mimeType).toLocaleLowerCase());
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxFileSizeBytes,
  },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname || '').toLocaleLowerCase();

    if (extension !== '.xlsx') {
      callback(new Error('Apenas arquivos .xlsx sao aceitos.'));
      return;
    }

    if (!isAllowedMimeType(file.mimetype)) {
      callback(new Error('Tipo MIME invalido para arquivo .xlsx.'));
      return;
    }

    callback(null, true);
  },
});

function parsePhase(req) {
  return String(req.query.phase ?? req.body?.phase ?? '').trim().toLocaleLowerCase();
}

function handlePreview(req, res, next) {
  upload.single('file')(req, res, async (uploadError) => {
    if (uploadError) {
      res.status(400).json({ error: uploadError.message });
      return;
    }

    if (!req.file?.buffer) {
      res.status(400).json({ error: 'Arquivo .xlsx nao encontrado no campo file.' });
      return;
    }

    try {
      const result = await previewImport({
        fileBuffer: req.file.buffer,
        defaultCategory: req.body.defaultCategory,
        defaultMinQuantity: req.body.defaultMinQuantity,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  });
}

async function handleCommit(req, res, next) {
  try {
    const result = await commitImport({
      importId: req.body.importId,
      conflictDecisions: req.body.conflictDecisions,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
}

function handleImportItems(req, res, next) {
  const phase = parsePhase(req);

  if (phase === 'preview') {
    handlePreview(req, res, next);
    return;
  }

  if (phase === 'commit') {
    void handleCommit(req, res, next);
    return;
  }

  res.status(400).json({ error: 'phase invalido. Use preview ou commit.' });
}

module.exports = {
  handleImportItems,
};
