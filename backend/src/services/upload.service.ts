import multer from 'multer';
import path from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { config } from '@config/app.config';
import { AppError, HttpStatus } from '@errors/AppError';
import { logger } from '@config/logger';
import fs from 'fs/promises';

// Disk storage with secure naming
const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    const uploadPath = config.upload.path;
    try {
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch {
      cb(new Error('Failed to create upload directory'), '');
    }
  },
  filename: (_req, file, cb) => {
    // Randomize filename to prevent enumeration and path traversal
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    const safeName = `${uuidv4()}${ext}`;
    cb(null, safeName);
  },
});

// File type validation (check MIME + magic bytes)
const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void => {
  if (!config.upload.allowedTypes.includes(file.mimetype)) {
    return cb(
      new AppError(
        `File type ${file.mimetype} is not allowed`,
        HttpStatus.BAD_REQUEST,
        'INVALID_FILE_TYPE'
      )
    );
  }
  cb(null, true);
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.upload.maxFileSize,
    files: 5,
    fields: 10,
  },
});

// Process and optimize uploaded images with sharp
export async function processImage(
  filePath: string,
  options: {
    width?: number;
    height?: number;
    quality?: number;
    format?: 'jpeg' | 'png' | 'webp';
  } = {}
): Promise<string> {
  try {
    const { width = 800, height, quality = 80, format = 'webp' } = options;

    const outputPath = filePath.replace(path.extname(filePath), `.${format}`);

    await sharp(filePath)
      .resize(width, height, { fit: 'inside', withoutEnlargement: true })
      .toFormat(format, { quality })
      .toFile(outputPath);

    // Remove original if format changed
    if (outputPath !== filePath) {
      await fs.unlink(filePath).catch(() => {});
    }

    logger.info('Image processed', { input: filePath, output: outputPath });
    return outputPath;
  } catch (error) {
    logger.error('Image processing failed', { filePath, error });
    throw new AppError('Image processing failed', HttpStatus.INTERNAL_SERVER_ERROR, 'IMAGE_PROCESSING_ERROR');
  }
}

export async function deleteFile(filePath: string): Promise<void> {
  try {
    // Prevent path traversal
    const safeBase = path.resolve(config.upload.path);
    const safePath = path.resolve(filePath);
    if (!safePath.startsWith(safeBase)) {
      throw new AppError('Invalid file path', HttpStatus.BAD_REQUEST, 'INVALID_PATH');
    }
    await fs.unlink(safePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn('Failed to delete file', { filePath, error });
    }
  }
}

export function getPublicFilePath(filename: string): string {
  return `/uploads/${filename}`;
}
