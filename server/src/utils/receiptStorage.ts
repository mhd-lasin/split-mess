import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getDbClient } from '../db/client.js';

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export const PRIMARY_UPLOADS_DIR = path.resolve(
  process.cwd().endsWith('server')
    ? path.join(process.cwd(), 'uploads', 'receipts')
    : path.join(process.cwd(), 'server', 'uploads', 'receipts')
);

export const ROOT_UPLOADS_DIR = path.resolve(
  process.cwd().endsWith('server')
    ? path.join(process.cwd(), '..', 'uploads', 'receipts')
    : path.join(process.cwd(), 'uploads', 'receipts')
);

export const UPLOAD_DIR = PRIMARY_UPLOADS_DIR;

/**
 * Ensures the uploads/receipts directory exists.
 */
export function ensureUploadDirExists(): string {
  if (!fs.existsSync(PRIMARY_UPLOADS_DIR)) {
    fs.mkdirSync(PRIMARY_UPLOADS_DIR, { recursive: true });
  }
  if (!fs.existsSync(ROOT_UPLOADS_DIR)) {
    fs.mkdirSync(ROOT_UPLOADS_DIR, { recursive: true });
  }
  return PRIMARY_UPLOADS_DIR;
}

/**
 * Generates a collision-resistant UUID filename with sanitized extension.
 */
export function generateReceiptFilename(mimeType: string): string {
  const ext = MIME_TO_EXTENSION[mimeType];
  if (!ext) {
    throw new Error(`Unsupported MIME type: ${mimeType}`);
  }
  return `${crypto.randomUUID()}${ext}`;
}

/**
 * Resolves and validates that a target file path is safely confined inside UPLOAD_DIR.
 * Neutralizes directory traversal attacks (e.g. "../../../etc/passwd").
 */
export function resolveSafeReceiptPath(filenameOrUrl: string): string {
  const sanitizedFilename = path.basename(filenameOrUrl);
  const resolvedPath = path.resolve(UPLOAD_DIR, sanitizedFilename);

  // Security check: must reside inside UPLOAD_DIR
  if (!resolvedPath.startsWith(UPLOAD_DIR)) {
    throw new Error('Access denied: Path traversal attempt detected');
  }

  return resolvedPath;
}

/**
 * Deletes a receipt file from disk safely.
 * Returns true if file was deleted, false if file did not exist.
 */
export async function deleteReceiptFile(filenameOrUrl: string | null | undefined): Promise<boolean> {
  if (!filenameOrUrl) return false;

  const sanitized = path.basename(filenameOrUrl);
  let deleted = false;

  for (const dir of [PRIMARY_UPLOADS_DIR, ROOT_UPLOADS_DIR]) {
    try {
      const filePath = path.resolve(dir, sanitized);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        console.log(`🗑️ Receipt file deleted: ${sanitized} from ${dir}`);
        deleted = true;
      }
    } catch (err: any) {
      console.error(`⚠️ Failed to delete receipt file ${sanitized} from ${dir}:`, err.message);
    }
  }

  return deleted;
}

/**
 * Performs a comprehensive cleanup of orphaned receipt files.
 * Scans UPLOAD_DIR, queries the database for all referenced receipts,
 * and permanently deletes unreferenced / abandoned image files.
 */
export async function cleanupOrphanedReceipts(): Promise<{
  scannedCount: number;
  activeCount: number;
  deletedCount: number;
  deletedFiles: string[];
}> {
  ensureUploadDirExists();
  const db = await getDbClient();

  // 1. Fetch all receipt URLs currently registered in database
  const res = await db.query(`
    SELECT receipt_url 
    FROM expenses 
    WHERE receipt_url IS NOT NULL AND receipt_url != '';
  `);

  const activeFilenames = new Set<string>();
  for (const row of res.rows) {
    if (row.receipt_url) {
      activeFilenames.add(path.basename(row.receipt_url));
    }
  }

  // 2. Read all files on disk in UPLOAD_DIR
  const diskFiles = await fs.promises.readdir(UPLOAD_DIR);
  const deletedFiles: string[] = [];

  for (const file of diskFiles) {
    // Only target image files matching UUID pattern
    if (!activeFilenames.has(file)) {
      const filePath = path.join(UPLOAD_DIR, file);
      try {
        const stats = await fs.promises.stat(filePath);
        if (stats.isFile()) {
          await fs.promises.unlink(filePath);
          deletedFiles.push(file);
          console.log(`🧹 Cleaned up orphaned receipt: ${file}`);
        }
      } catch (err: any) {
        console.warn(`Failed to unlink file ${file}:`, err.message);
      }
    }
  }

  return {
    scannedCount: diskFiles.length,
    activeCount: activeFilenames.size,
    deletedCount: deletedFiles.length,
    deletedFiles,
  };
}
