import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

export const SERVER_UPLOADS_DIR = path.resolve(process.cwd(), 'uploads', 'receipts');
export const SERVER_AVATARS_DIR = path.resolve(process.cwd(), 'uploads', 'avatars');

// Ensure directories exist on startup
if (!fs.existsSync(SERVER_UPLOADS_DIR)) {
  fs.mkdirSync(SERVER_UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(SERVER_AVATARS_DIR)) {
  fs.mkdirSync(SERVER_AVATARS_DIR, { recursive: true });
}

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const storage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb) => {
    if (!fs.existsSync(SERVER_UPLOADS_DIR)) {
      fs.mkdirSync(SERVER_UPLOADS_DIR, { recursive: true });
    }
    cb(null, SERVER_UPLOADS_DIR);
  },
  filename: (_req: Request, file: Express.Multer.File, cb) => {
    // Strictly derive extension from verified MIME type — NEVER trust user-supplied originalname
    const ext = MIME_TO_EXT[file.mimetype] || '.jpg';
    const safeFilename = `${crypto.randomUUID()}${ext}`;
    cb(null, safeFilename);
  },
});

const avatarStorage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb) => {
    if (!fs.existsSync(SERVER_AVATARS_DIR)) {
      fs.mkdirSync(SERVER_AVATARS_DIR, { recursive: true });
    }
    cb(null, SERVER_AVATARS_DIR);
  },
  filename: (_req: Request, file: Express.Multer.File, cb) => {
    const ext = MIME_TO_EXT[file.mimetype] || '.jpg';
    const safeFilename = `avatar-${crypto.randomUUID()}${ext}`;
    cb(null, safeFilename);
  },
});

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const error: any = new Error('Invalid file type: strictly image/jpeg, image/png, and image/webp are allowed.');
    error.status = 400;
    cb(error, false);
  }
};

export const uploadReceipt = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
});

export const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
});

/**
 * Inspects actual file header bytes (magic numbers) to confirm the uploaded file
 * is genuinely a JPEG, PNG, or WebP image — prevents spoofed Content-Type attacks.
 */
function hasValidImageMagicBytes(filePath: string, mimeType: string): boolean {
  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(12);
    const bytesRead = fs.readSync(fd, buf, 0, 12, 0);
    if (bytesRead < 3) return false;

    if (mimeType === 'image/jpeg') {
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    }
    if (mimeType === 'image/png') {
      return (
        bytesRead >= 8 &&
        buf[0] === 0x89 &&
        buf[1] === 0x50 &&
        buf[2] === 0x4e &&
        buf[3] === 0x47 &&
        buf[4] === 0x0d &&
        buf[5] === 0x0a &&
        buf[6] === 0x1a &&
        buf[7] === 0x0a
      );
    }
    if (mimeType === 'image/webp') {
      return (
        bytesRead >= 12 &&
        buf.toString('ascii', 0, 4) === 'RIFF' &&
        buf.toString('ascii', 8, 12) === 'WEBP'
      );
    }
    return false;
  } catch {
    return false;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore close error
      }
    }
  }
}

export function verifyImageMagicBytes(req: Request, res: Response, next: NextFunction): void {
  if (!req.file) {
    next();
    return;
  }

  if (!hasValidImageMagicBytes(req.file.path, req.file.mimetype)) {
    try {
      fs.unlinkSync(req.file.path);
    } catch {
      // ignore unlink error
    }
    res.status(400).json({
      error: 'Invalid image file: file content does not match a valid JPEG, PNG, or WebP image.',
    });
    return;
  }

  next();
}
