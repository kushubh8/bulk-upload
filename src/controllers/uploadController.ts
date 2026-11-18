import { Request, Response, NextFunction } from 'express';
import { UploadService } from '../services/uploadService';
import { AppError, FileTooLargeError, InvalidMimeTypeError } from '../utils/errors';
import { config } from '../config';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger({ component: 'upload-controller' });

export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  public bulkUpload = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const file = req.file;

      if (!file) {
        throw new AppError('No file uploaded. Send a CSV via multipart/form-data field "file"', 400);
      }

      // Validate file size
      if (file.size > config.maxFileSizeBytes) {
        throw new FileTooLargeError(config.maxFileSizeBytes);
      }

      // Validate MIME type
      const mimeType = file.mimetype.toLowerCase();
      const isAllowed = config.allowedMimeTypes.some(
        (allowed) => mimeType === allowed.toLowerCase() || mimeType.includes('csv'),
      );
      if (!isAllowed) {
        throw new InvalidMimeTypeError(file.mimetype, config.allowedMimeTypes);
      }

      log.info({ filename: file.originalname, size: file.size, mimeType }, 'file received');

      const result = await this.uploadService.startUpload(file.buffer);

      res.status(202).json(result);
    } catch (err) {
      next(err);
    }
  };

  public getStatus = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { uploadId } = req.params;
      if (!uploadId || typeof uploadId !== 'string') {
        throw new AppError('uploadId path parameter is required', 400);
      }

      const status = this.uploadService.getStatus(uploadId);
      res.status(200).json(status);
    } catch (err) {
      next(err);
    }
  };
}
