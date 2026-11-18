import { Router } from 'express';
import multer from 'multer';
import { UploadController } from '../controllers/uploadController';
import { config } from '../config';

/**
 * Multer is configured with memoryStorage so the file buffer is available
 * in req.file.buffer without hitting the filesystem.
 * File-size limit is enforced at the multer layer as a first line of defence;
 * the controller re-validates to produce a structured error response.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxFileSizeBytes,
  },
});

export function createUploadRouter(controller: UploadController): Router {
  const router = Router();

  router.post(
    '/bulk-upload',
    upload.single('file'),
    controller.bulkUpload,
  );

  return router;
}

export function createStatusRouter(controller: UploadController): Router {
  const router = Router();

  router.get('/:uploadId/status', controller.getStatus);

  return router;
}
