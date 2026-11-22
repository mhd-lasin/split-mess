import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { getDbClient } from '../db/client.js';
import { authenticateToken, optionalAuthenticateToken, requireAdmin, generateToken } from '../middleware/auth.middleware.js';
import { uploadAvatar, verifyImageMagicBytes, SERVER_AVATARS_DIR } from '../middleware/upload.middleware.js';
import { isValidUuid, sanitizePhone, sanitizeText } from '../utils/sanitize.js';

export const authRouter = Router();

/** Helper to safely remove an old avatar file from disk */
function deleteAvatarFromDisk(avatarUrl: string | null | undefined): void {
  if (!avatarUrl || typeof avatarUrl !== 'string' || !avatarUrl.startsWith('/uploads/avatars/')) {
    return;
  }
  const oldPath = path.join(SERVER_AVATARS_DIR, path.basename(avatarUrl));
  if (fs.existsSync(oldPath)) {
    try {
      fs.unlinkSync(oldPath);
    } catch {}
  }
}

/**
 * GET /api/auth/users
 * Public endpoint for PIN login selector — returns ONLY minimal non-PII fields (no phone numbers).
 */
authRouter.get('/users', async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDbClient();
    const result = await db.query(
      `SELECT id, name, role, avatar_url FROM users WHERE is_active = true ORDER BY name ASC;`
    );
    res.status(200).json({ users: result.rows });
  } catch (err: any) {
    console.error('Fetch users error:', err);
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

/**
 * GET /api/auth/members
 * Authenticated endpoint returning full roommate directory with pool enrollments (includes inactive for admins).
 */
authRouter.get('/members', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDbClient();
    const isAdmin = req.user!.role === 'admin';
    const usersRes = await db.query(
      isAdmin
        ? `SELECT id, name, phone, role, avatar_url, is_active, created_at FROM users ORDER BY is_active DESC, name ASC;`
        : `SELECT id, name, phone, role, avatar_url, is_active, created_at FROM users WHERE is_active = true ORDER BY name ASC;`
    );

    const membershipsRes = await db.query(
      `SELECT pm.user_id, ep.id as pool_id, ep.code, ep.name
       FROM pool_members pm
       JOIN expense_pools ep ON ep.id = pm.pool_id
       WHERE pm.is_active = true AND ep.is_active = true
       ORDER BY ep.code;`
    );

    const poolsByUser: Record<string, Array<{ id: string; code: string; name: string }>> = {};
    for (const row of membershipsRes.rows) {
      if (!poolsByUser[row.user_id]) poolsByUser[row.user_id] = [];
      poolsByUser[row.user_id].push({ id: row.pool_id, code: row.code, name: row.name });
    }

    const members = usersRes.rows.map((u) => ({
      ...u,
      enrolledPools: poolsByUser[u.id] || [],
    }));

    res.status(200).json({ members });
  } catch (err: any) {
    console.error('Fetch members error:', err);
    res.status(500).json({ error: 'Failed to fetch members.' });
  }
});

/**
 * POST /api/auth/register
 * Self-registration endpoint.
 * - First user ever becomes 'admin' (bootstrap).
 * - All subsequent self-registrations are strictly forced to 'member' (never trusts req.body.role).
 */
authRouter.post('/register', async (req: Request, res: Response): Promise<void> => {
  const cleanName = sanitizeText(req.body.name, 100);
  const cleanPhone = sanitizePhone(req.body.phone);
  const { pin } = req.body;

  if (!cleanName) {
    res.status(400).json({ error: 'Name is required.' });
    return;
  }

  if (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: 'PIN must be exactly 4 numeric digits.' });
    return;
  }

  try {
    const db = await getDbClient();

    // Check if this is the first user; ONLY the first user becomes 'admin'
    const countRes = await db.query(`SELECT COUNT(*)::int as count FROM users;`);
    const isFirstUser = (countRes.rows[0]?.count || 0) === 0;

    // In production, disable open self-registration after initial admin setup unless explicitly allowed
    if (!isFirstUser && process.env.NODE_ENV === 'production' && process.env.ALLOW_SELF_REGISTRATION !== 'true') {
      res.status(403).json({ error: 'Self-registration is disabled. Ask your room admin to add your account.' });
      return;
    }

    const assignedRole = isFirstUser ? 'admin' : 'member';

    const pinHash = await bcrypt.hash(pin, 10);

    const insertUserRes = await db.query(
      `INSERT INTO users (name, phone, pin_hash, role, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, name, phone, role, avatar_url;`,
      [cleanName, cleanPhone, pinHash, assignedRole]
    );

    const newUser = insertUserRes.rows[0];

    // Automatically enroll new user in all active expense pools
    const poolsRes = await db.query(`SELECT id FROM expense_pools WHERE is_active = true;`);
    for (const pool of poolsRes.rows) {
      await db.query(
        `INSERT INTO pool_members (pool_id, user_id, is_active)
         VALUES ($1, $2, true)
         ON CONFLICT (pool_id, user_id) DO NOTHING;`,
        [pool.id, newUser.id]
      );
    }

    // Generate auth token and set cookie
    const token = generateToken({
      id: newUser.id,
      name: newUser.name,
      role: newUser.role,
    });

    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('splitmess_token', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      message: 'User registered successfully and enrolled in room pools.',
      user: newUser,
    });
  } catch (err: any) {
    console.error('Registration error:', err);
    if (err.code === '23505') {
      res.status(409).json({ error: 'A roommate with that phone number already exists.' });
      return;
    }
    res.status(500).json({ error: 'Failed to register user.' });
  }
});

/**
 * POST /api/auth/members
 * Admin-only endpoint to create a new roommate WITHOUT replacing the admin's session cookie.
 * Body: { name: string, pin: string, phone?: string, role?: 'member' | 'admin' | 'external', poolIds?: string[] }
 */
authRouter.post('/members', authenticateToken, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const cleanName = sanitizeText(req.body.name, 100);
  const cleanPhone = sanitizePhone(req.body.phone);
  const { pin, role, poolIds } = req.body;

  if (!cleanName) {
    res.status(400).json({ error: 'Name is required.' });
    return;
  }

  if (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: 'PIN must be exactly 4 numeric digits.' });
    return;
  }

  if (poolIds !== undefined) {
    if (!Array.isArray(poolIds) || !poolIds.every((id) => isValidUuid(id))) {
      res.status(400).json({ error: 'poolIds must be an array of valid UUIDs.' });
      return;
    }
  }

  const allowedRoles = ['member', 'admin', 'external'];
  const assignedRole = allowedRoles.includes(role) ? role : 'member';

  try {
    const db = await getDbClient();
    const pinHash = await bcrypt.hash(pin, 10);

    const newUser = await db.transaction(async (tx) => {
      const insertUserRes = await tx.query(
        `INSERT INTO users (name, phone, pin_hash, role, is_active)
         VALUES ($1, $2, $3, $4, true)
         RETURNING id, name, phone, role, avatar_url, is_active;`,
        [cleanName, cleanPhone, pinHash, assignedRole]
      );

      const createdUser = insertUserRes.rows[0];

      // Enroll in selected pools (or all active pools if poolIds not provided)
      let targetPoolIds: string[] = [];
      if (Array.isArray(poolIds)) {
        targetPoolIds = poolIds;
      } else {
        const poolsRes = await tx.query(`SELECT id FROM expense_pools WHERE is_active = true;`);
        targetPoolIds = poolsRes.rows.map((p) => p.id);
      }

      for (const poolId of targetPoolIds) {
        await tx.query(
          `INSERT INTO pool_members (pool_id, user_id, is_active)
           VALUES ($1, $2, true)
           ON CONFLICT (pool_id, user_id) DO UPDATE SET is_active = true;`,
          [poolId, createdUser.id]
        );
      }

      return createdUser;
    });

    res.status(201).json({
      message: `Roommate ${newUser.name} added successfully.`,
      user: newUser,
    });
  } catch (err: any) {
    console.error('Admin create member error:', err);
    if (err.code === '23505') {
      res.status(409).json({ error: 'A roommate with that phone number already exists.' });
      return;
    }
    res.status(500).json({ error: 'Failed to add roommate.' });
  }
});

/**
 * PUT /api/auth/pin
 * Authenticated user changes their own 4-digit PIN.
 */
authRouter.put('/pin', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const { currentPin, newPin } = req.body;

  if (!currentPin || !/^\d{4}$/.test(String(currentPin))) {
    res.status(400).json({ error: 'Current 4-digit PIN is required.' });
    return;
  }
  if (!newPin || !/^\d{4}$/.test(String(newPin))) {
    res.status(400).json({ error: 'New PIN must be exactly 4 numeric digits.' });
    return;
  }

  try {
    const db = await getDbClient();
    const userRes = await db.query(`SELECT pin_hash FROM users WHERE id = $1;`, [req.user!.id]);
    if (userRes.rowCount === 0) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    if (!(await bcrypt.compare(String(currentPin), userRes.rows[0].pin_hash))) {
      res.status(401).json({ error: 'Current PIN is incorrect.' });
      return;
    }

    const newHash = await bcrypt.hash(String(newPin), 10);
    await db.query(
      `UPDATE users SET pin_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;`,
      [newHash, req.user!.id]
    );

    res.status(200).json({ message: 'PIN updated successfully.' });
  } catch (err: any) {
    console.error('Change PIN error:', err);
    res.status(500).json({ error: 'Failed to update PIN.' });
  }
});

/**
 * PUT /api/auth/members/:id/pin
 * Admin resets a roommate's forgotten 4-digit PIN.
 */
authRouter.put('/members/:id/pin', authenticateToken, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { newPin } = req.body;
  const targetId = req.params.id;

  if (!isValidUuid(targetId)) {
    res.status(400).json({ error: 'Invalid member ID.' });
    return;
  }

  if (!newPin || !/^\d{4}$/.test(String(newPin))) {
    res.status(400).json({ error: 'New PIN must be exactly 4 numeric digits.' });
    return;
  }

  try {
    const db = await getDbClient();
    const newHash = await bcrypt.hash(String(newPin), 10);
    const updateRes = await db.query(
      `UPDATE users SET pin_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, name;`,
      [newHash, targetId]
    );
    if (updateRes.rowCount === 0) {
      res.status(404).json({ error: 'Member not found.' });
      return;
    }
    res.status(200).json({ message: `PIN reset successfully for ${updateRes.rows[0].name}.` });
  } catch (err: any) {
    console.error('Admin reset PIN error:', err);
    res.status(500).json({ error: 'Failed to reset PIN.' });
  }
});

/**
 * PUT /api/auth/members/:id/status
 * Admin activates or deactivates a roommate (e.g., when someone moves out).
 */
authRouter.put('/members/:id/status', authenticateToken, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { isActive } = req.body;
  const targetId = req.params.id;

  if (!isValidUuid(targetId)) {
    res.status(400).json({ error: 'Invalid member ID.' });
    return;
  }

  if (typeof isActive !== 'boolean') {
    res.status(400).json({ error: 'isActive boolean is required.' });
    return;
  }

  if (targetId === req.user!.id && !isActive) {
    res.status(400).json({ error: 'You cannot deactivate your own admin account.' });
    return;
  }

  try {
    const db = await getDbClient();
    const updateRes = await db.query(
      `UPDATE users SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, name, is_active;`,
      [isActive, targetId]
    );
    if (updateRes.rowCount === 0) {
      res.status(404).json({ error: 'Member not found.' });
      return;
    }
    res.status(200).json({
      message: `Member ${updateRes.rows[0].name} ${isActive ? 'reactivated' : 'deactivated'}.`,
      user: updateRes.rows[0],
    });
  } catch (err: any) {
    console.error('Update member status error:', err);
    res.status(500).json({ error: 'Failed to update member status.' });
  }
});

/**
 * POST /api/auth/login
 * Body: { userId: string, pin: string }
 */
authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { userId, pin } = req.body;

  if (!userId || !pin) {
    res.status(400).json({ error: 'User ID and 4-digit PIN are required.' });
    return;
  }

  if (!isValidUuid(userId)) {
    res.status(400).json({ error: 'Invalid user ID.' });
    return;
  }

  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: 'PIN must be exactly 4 numeric digits.' });
    return;
  }

  try {
    const db = await getDbClient();
    const result = await db.query(
      `SELECT id, name, pin_hash, role, avatar_url, is_active FROM users WHERE id = $1;`,
      [userId]
    );

    if (result.rowCount === 0) {
      res.status(401).json({ error: 'Invalid user credentials.' });
      return;
    }

    const user = result.rows[0];
    if (!user.is_active) {
      res.status(403).json({ error: 'Account is deactivated.' });
      return;
    }

    const isPinValid = await bcrypt.compare(pin, user.pin_hash);
    if (!isPinValid) {
      res.status(401).json({ error: 'Invalid PIN.' });
      return;
    }

    const token = generateToken({
      id: user.id,
      name: user.name,
      role: user.role,
    });

    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('splitmess_token', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.status(200).json({
      message: 'Login successful.',
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        avatar_url: user.avatar_url,
      },
    });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/auth/logout
 */
authRouter.post('/logout', (_req: Request, res: Response): void => {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie('splitmess_token', {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
  });
  res.status(200).json({ message: 'Logged out successfully.' });
});

/**
 * GET /api/auth/session
 * Non-throwing session check for frontend boot (returns 200 with user: null when logged out).
 */
authRouter.get('/session', optionalAuthenticateToken, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(200).json({ authenticated: false, user: null });
    return;
  }

  try {
    const db = await getDbClient();
    const userResult = await db.query(
      `SELECT id, name, phone, role, avatar_url, is_active, created_at FROM users WHERE id = $1;`,
      [req.user.id]
    );

    if (userResult.rowCount === 0) {
      res.status(200).json({ authenticated: false, user: null });
      return;
    }

    const user = userResult.rows[0];
    const poolsResult = await db.query(
      `SELECT ep.id, ep.code, ep.name 
       FROM expense_pools ep
       JOIN pool_members pm ON pm.pool_id = ep.id
       WHERE pm.user_id = $1 AND pm.is_active = true
       ORDER BY ep.code;`,
      [user.id]
    );

    res.status(200).json({
      authenticated: true,
      user: {
        ...user,
        enrolledPools: poolsResult.rows,
      },
    });
  } catch (err: any) {
    console.error('Auth /session error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /api/auth/me
 */
authRouter.get('/me', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDbClient();
    const userResult = await db.query(
      `SELECT id, name, phone, role, avatar_url, is_active, created_at FROM users WHERE id = $1;`,
      [req.user!.id]
    );

    if (userResult.rowCount === 0) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const user = userResult.rows[0];

    // Fetch enrolled pools
    const poolsResult = await db.query(
      `SELECT ep.id, ep.code, ep.name 
       FROM expense_pools ep
       JOIN pool_members pm ON pm.pool_id = ep.id
       WHERE pm.user_id = $1 AND pm.is_active = true
       ORDER BY ep.code;`,
      [user.id]
    );

    res.status(200).json({
      user: {
        ...user,
        enrolledPools: poolsResult.rows,
      },
    });
  } catch (err: any) {
    console.error('Auth /me error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/auth/avatar
 * Uploads a profile picture for the authenticated user
 */
authRouter.post('/avatar', authenticateToken, uploadAvatar.single('avatar'), verifyImageMagicBytes, async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: 'No avatar file was uploaded.' });
    return;
  }

  try {
    const db = await getDbClient();
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    // Read previous avatar URL before updating DB; delete old file only after DB update succeeds
    const prevRes = await db.query(`SELECT avatar_url FROM users WHERE id = $1;`, [req.user!.id]);
    const prevAvatarUrl = prevRes.rows[0]?.avatar_url;

    const updateRes = await db.query(
      `UPDATE users SET avatar_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, name, phone, role, avatar_url;`,
      [avatarUrl, req.user!.id]
    );

    deleteAvatarFromDisk(prevAvatarUrl);

    res.status(200).json({
      message: 'Profile picture updated successfully.',
      avatarUrl,
      user: updateRes.rows[0],
    });
  } catch (err: any) {
    // Clean up newly uploaded file if DB update failed
    if (req.file?.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        // ignore cleanup error
      }
    }
    console.error('Avatar upload error:', err);
    res.status(500).json({ error: 'Failed to update profile picture.' });
  }
});

/**
 * DELETE /api/auth/avatar
 * Removes the profile picture for the authenticated user
 */
authRouter.delete('/avatar', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDbClient();
    const prevRes = await db.query(`SELECT avatar_url FROM users WHERE id = $1;`, [req.user!.id]);
    deleteAvatarFromDisk(prevRes.rows[0]?.avatar_url);

    const updateRes = await db.query(
      `UPDATE users SET avatar_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id, name, phone, role, avatar_url;`,
      [req.user!.id]
    );

    res.status(200).json({
      message: 'Profile picture removed successfully.',
      user: updateRes.rows[0],
    });
  } catch (err: any) {
    console.error('Delete avatar error:', err);
    res.status(500).json({ error: 'Failed to remove profile picture.' });
  }
});

/**
 * PUT /api/auth/profile
 * Updates basic profile info (name, phone). Avatar is only updated via POST/DELETE /api/auth/avatar.
 */
authRouter.put('/profile', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const cleanName = req.body.name !== undefined ? sanitizeText(req.body.name, 100) : null;
  const cleanPhone = req.body.phone !== undefined ? sanitizePhone(req.body.phone) : null;

  try {
    const db = await getDbClient();
    const updateRes = await db.query(
      `UPDATE users 
       SET name = COALESCE($1, name),
           phone = COALESCE($2, phone),
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3 
       RETURNING id, name, phone, role, avatar_url;`,
      [cleanName || null, cleanPhone, req.user!.id]
    );

    res.status(200).json({
      message: 'Profile updated successfully.',
      user: updateRes.rows[0],
    });
  } catch (err: any) {
    console.error('Profile update error:', err);
    if (err.code === '23505') {
      res.status(409).json({ error: 'That phone number is already in use by another roommate.' });
      return;
    }
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});
