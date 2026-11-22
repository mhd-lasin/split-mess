import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getDbClient } from '../db/client.js';

export interface AuthUser {
  id: string;
  name: string;
  role: 'admin' | 'member' | 'external';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const DEFAULT_DEV_SECRET = 'splitmess_ultra_secure_dev_jwt_secret_key_at_least_32_bytes';
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_DEV_SECRET;

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEFAULT_DEV_SECRET)) {
  throw new Error('FATAL: JWT_SECRET must be set to a strong, unique secret in production.');
}

/**
 * Verifies JWT token from HttpOnly cookie `splitmess_token`,
 * and confirms the user is still active in the database (prevents deactivated users from using old tokens).
 */
export async function authenticateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.splitmess_token;

  if (!token) {
    res.status(401).json({ error: 'Authentication required. No session cookie found.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as AuthUser;
    const db = await getDbClient();
    const userRes = await db.query(
      `SELECT id, name, role, is_active FROM users WHERE id = $1;`,
      [decoded.id]
    );

    if (userRes.rowCount === 0 || !userRes.rows[0].is_active) {
      res.status(401).json({ error: 'Account is inactive or no longer exists.' });
      return;
    }

    req.user = {
      id: userRes.rows[0].id,
      name: userRes.rows[0].name,
      role: userRes.rows[0].role,
    };
    next();
  } catch (err: any) {
    res.status(401).json({ error: 'Invalid or expired session token.' });
    return;
  }
}

/**
 * Optionally verifies JWT token from HttpOnly cookie `splitmess_token`.
 * Sets req.user if valid & active, otherwise continues without returning 401.
 */
export async function optionalAuthenticateToken(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.splitmess_token;
  if (!token) {
    next();
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as AuthUser;
    const db = await getDbClient();
    const userRes = await db.query(
      `SELECT id, name, role, is_active FROM users WHERE id = $1;`,
      [decoded.id]
    );

    if (userRes.rowCount > 0 && userRes.rows[0].is_active) {
      req.user = {
        id: userRes.rows[0].id,
        name: userRes.rows[0].name,
        role: userRes.rows[0].role,
      };
    }
  } catch {
    // Invalid or expired token -> treat as unauthenticated
  }

  next();
}

/**
 * Restricts access strictly to users with role === 'admin'.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'Access denied. Administrator privilege required.' });
    return;
  }

  next();
}

/**
 * Signs a standard JWT for Split Mess users.
 */
export function generateToken(user: AuthUser): string {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      role: user.role,
    },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '30d' }
  );
}
