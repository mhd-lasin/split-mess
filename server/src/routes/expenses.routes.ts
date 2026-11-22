import { Router, Request, Response } from 'express';
import { getDbClient } from '../db/client.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { uploadReceipt, verifyImageMagicBytes } from '../middleware/upload.middleware.js';
import { aedToFils, filsToAed } from '../utils/money.js';
import { deleteReceiptFile } from '../utils/receiptStorage.js';
import { isValidIsoDate, isValidUuid, sanitizeText } from '../utils/sanitize.js';

export const expensesRouter = Router();

/**
 * GET /api/expenses
 * Query params: cycleId (default: current open cycle), poolId, payerId
 */
expensesRouter.get('/', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDbClient();
    let cycleId = req.query.cycleId as string;

    if (!cycleId) {
      const openCycleRes = await db.query(
        `SELECT id FROM billing_cycles WHERE status = 'open' LIMIT 1;`
      );
      if (openCycleRes.rowCount > 0) {
        cycleId = openCycleRes.rows[0].id;
      }
    }

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (cycleId) {
      conditions.push(`e.billing_cycle_id = $${paramIndex++}`);
      params.push(cycleId);
    }

    if (req.query.poolId) {
      conditions.push(`e.pool_id = $${paramIndex++}`);
      params.push(req.query.poolId);
    }

    if (req.query.payerId) {
      conditions.push(`e.paid_by_user_id = $${paramIndex++}`);
      params.push(req.query.payerId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const querySql = `
      SELECT e.id, e.billing_cycle_id, e.pool_id, e.paid_by_user_id,
             e.amount_fils, e.description, e.expense_date,
             e.receipt_url, e.receipt_mime_type, e.created_at,
             u.name as payer_name, ep.code as pool_code, ep.name as pool_name
      FROM expenses e
      JOIN users u ON u.id = e.paid_by_user_id
      JOIN expense_pools ep ON ep.id = e.pool_id
      ${whereClause}
      ORDER BY e.expense_date DESC, e.created_at DESC;
    `;

    const result = await db.query(querySql, params);

    const formattedExpenses = result.rows.map((row) => ({
      id: row.id,
      cycleId: row.billing_cycle_id,
      poolId: row.pool_id,
      poolCode: row.pool_code,
      poolName: row.pool_name,
      payerId: row.paid_by_user_id,
      payerName: row.payer_name,
      amountFils: row.amount_fils,
      amountAed: filsToAed(row.amount_fils),
      description: row.description,
      expenseDate: row.expense_date,
      receiptUrl: row.receipt_url,
      receiptMimeType: row.receipt_mime_type,
      createdAt: row.created_at,
    }));

    res.status(200).json({ expenses: formattedExpenses });
  } catch (err: any) {
    console.error('Error fetching expenses:', err);
    res.status(500).json({ error: 'Failed to retrieve expenses.' });
  }
});

/**
 * POST /api/expenses
 * Multipart form-data with optional receipt file upload.
 * Required fields: payerId, poolId, amountAed, description
 */
expensesRouter.post(
  '/',
  authenticateToken,
  uploadReceipt.single('receipt'),
  verifyImageMagicBytes,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const db = await getDbClient();
      const { payerId, paidByUserId, poolId, amountAed, description, expenseDate } = req.body;
      const requestedPayerId = payerId || paidByUserId;
      // Only admins can log expenses on behalf of another roommate
      const actualPayerId =
        requestedPayerId && req.user!.role === 'admin' ? requestedPayerId : req.user!.id;

      const cleanDesc = sanitizeText(description, 255);
      if (!actualPayerId || !poolId || !amountAed || !cleanDesc || !isValidUuid(poolId) || !isValidUuid(actualPayerId)) {
        // Clean up uploaded file if validation fails
        if (req.file) {
          await deleteReceiptFile(req.file.filename);
        }
        res.status(400).json({
          error: 'Missing or invalid required fields: valid payerId, poolId, amountAed, and description are required.',
        });
        return;
      }

      const numAed = parseFloat(amountAed);
      if (isNaN(numAed) || numAed <= 0 || numAed > 1000000) {
        if (req.file) {
          await deleteReceiptFile(req.file.filename);
        }
        res.status(400).json({ error: 'Invalid amountAed: Must be between 0.01 and 1,000,000 AED.' });
        return;
      }

      if (expenseDate && !isValidIsoDate(expenseDate)) {
        if (req.file) {
          await deleteReceiptFile(req.file.filename);
        }
        res.status(400).json({ error: 'Invalid expenseDate: Must use YYYY-MM-DD format.' });
        return;
      }

      // Convert strictly to integer fils
      const amountFils = aedToFils(numAed);

      // Fetch active open cycle
      const cycleRes = await db.query(
        `SELECT id FROM billing_cycles WHERE status = 'open' LIMIT 1;`
      );
      if (cycleRes.rowCount === 0) {
        if (req.file) {
          await deleteReceiptFile(req.file.filename);
        }
        res.status(400).json({ error: 'No open billing cycle found to record expense.' });
        return;
      }
      const cycleId = cycleRes.rows[0].id;

      // Verify pool exists
      const poolRes = await db.query(`SELECT id FROM expense_pools WHERE id = $1;`, [poolId]);
      if (poolRes.rowCount === 0) {
        if (req.file) {
          await deleteReceiptFile(req.file.filename);
        }
        res.status(400).json({ error: 'Expense pool does not exist.' });
        return;
      }

      const receiptUrl = req.file ? `/uploads/receipts/${req.file.filename}` : null;
      const receiptMimeType = req.file ? req.file.mimetype : null;
      const dateToRecord = expenseDate || new Date().toISOString().split('T')[0];

      const insertRes = await db.query(
        `INSERT INTO expenses (
           billing_cycle_id, pool_id, paid_by_user_id,
           amount_fils, description, expense_date,
           receipt_url, receipt_mime_type
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, billing_cycle_id, pool_id, paid_by_user_id, amount_fils, description, expense_date, receipt_url;`,
        [
          cycleId,
          poolId,
          actualPayerId,
          amountFils,
          cleanDesc,
          dateToRecord,
          receiptUrl,
          receiptMimeType,
        ]
      );

      // Update cycle total expense fils
      await db.query(
        `UPDATE billing_cycles 
         SET total_expense_fils = total_expense_fils + $1 
         WHERE id = $2;`,
        [amountFils, cycleId]
      );

      const created = insertRes.rows[0];
      res.status(201).json({
        message: 'Expense recorded successfully.',
        expense: {
          ...created,
          amountAed: filsToAed(created.amount_fils),
        },
      });
    } catch (err: any) {
      if (req.file) {
        await deleteReceiptFile(req.file.filename);
      }
      console.error('Error creating expense:', err);
      res.status(500).json({ error: 'Failed to record expense.' });
    }
  }
);

/**
 * PUT /api/expenses/:id
 * Allows expense creator or admin to edit an expense in an open cycle.
 * Optional receipt file replacement.
 */
expensesRouter.put(
  '/:id',
  authenticateToken,
  uploadReceipt.single('receipt'),
  verifyImageMagicBytes,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const db = await getDbClient();
      const expenseId = req.params.id;
      if (!isValidUuid(expenseId)) {
        if (req.file) await deleteReceiptFile(req.file.filename);
        res.status(400).json({ error: 'Invalid expense ID.' });
        return;
      }

      // Fetch existing expense
      const expRes = await db.query(
        `SELECT e.id, e.billing_cycle_id, e.paid_by_user_id, e.pool_id, e.amount_fils, e.description, e.expense_date, e.receipt_url, bc.status
         FROM expenses e
         JOIN billing_cycles bc ON bc.id = e.billing_cycle_id
         WHERE e.id = $1;`,
        [expenseId]
      );

      if (expRes.rowCount === 0) {
        if (req.file) await deleteReceiptFile(req.file.filename);
        res.status(404).json({ error: 'Expense not found.' });
        return;
      }

      const existing = expRes.rows[0];

      // Check permissions: author or admin
      const isPayer = req.user!.id === existing.paid_by_user_id;
      const isAdmin = req.user!.role === 'admin';
      if (!isPayer && !isAdmin) {
        if (req.file) await deleteReceiptFile(req.file.filename);
        res.status(403).json({ error: 'You are not authorized to edit this expense.' });
        return;
      }

      // Check cycle status
      if (existing.status !== 'open') {
        if (req.file) await deleteReceiptFile(req.file.filename);
        res.status(400).json({ error: 'Cannot edit expense from a closed or settled billing cycle.' });
        return;
      }

      const { payerId, paidByUserId, poolId, amountAed, description, expenseDate } = req.body;
      const requestedPayerId = payerId || paidByUserId;
      // Only admins can reassign an expense to a different payer
      const newPayerId =
        requestedPayerId && isAdmin ? requestedPayerId : existing.paid_by_user_id;
      const newPoolId = poolId && isValidUuid(poolId) ? poolId : existing.pool_id;
      const newDesc = description ? sanitizeText(description, 255) || existing.description : existing.description;
      const newDate = expenseDate && isValidIsoDate(expenseDate) ? expenseDate : existing.expense_date;

      let newAmountFils = existing.amount_fils;
      if (amountAed) {
        const numAed = parseFloat(amountAed);
        if (isNaN(numAed) || numAed <= 0 || numAed > 1000000) {
          if (req.file) await deleteReceiptFile(req.file.filename);
          res.status(400).json({ error: 'Invalid amountAed: Must be between 0.01 and 1,000,000 AED.' });
          return;
        }
        newAmountFils = aedToFils(numAed);
      }

      // If a new receipt was uploaded, delete old receipt
      let newReceiptUrl = existing.receipt_url;
      let newReceiptMime = null;
      if (req.file) {
        if (existing.receipt_url) {
          await deleteReceiptFile(existing.receipt_url);
        }
        newReceiptUrl = `/uploads/receipts/${req.file.filename}`;
        newReceiptMime = req.file.mimetype;
      }

      // Update database
      const updateRes = await db.query(
        `UPDATE expenses 
         SET pool_id = $1,
             paid_by_user_id = $2,
             amount_fils = $3,
             description = $4,
             expense_date = $5,
             receipt_url = COALESCE($6, receipt_url),
             receipt_mime_type = COALESCE($7, receipt_mime_type),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $8
         RETURNING id, billing_cycle_id, pool_id, paid_by_user_id, amount_fils, description, expense_date, receipt_url;`,
        [
          newPoolId,
          newPayerId,
          newAmountFils,
          newDesc,
          newDate,
          req.file ? newReceiptUrl : null,
          newReceiptMime,
          expenseId,
        ]
      );

      // Adjust billing cycle total if amount changed
      const filsDelta = newAmountFils - existing.amount_fils;
      if (filsDelta !== 0) {
        await db.query(
          `UPDATE billing_cycles 
           SET total_expense_fils = GREATEST(0, total_expense_fils + $1) 
           WHERE id = $2;`,
          [filsDelta, existing.billing_cycle_id]
        );
      }

      const updated = updateRes.rows[0];
      res.status(200).json({
        message: 'Expense updated successfully.',
        expense: {
          ...updated,
          amountAed: filsToAed(updated.amount_fils),
        },
      });
    } catch (err: any) {
      if (req.file) await deleteReceiptFile(req.file.filename);
      console.error('Error updating expense:', err);
      res.status(500).json({ error: 'Failed to update expense.' });
    }
  }
);

/**
 * DELETE /api/expenses/:id
 * Allows expense creator or admin to delete an expense from an open cycle.
 * Unlinks and deletes the physical receipt file.
 */
expensesRouter.delete('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDbClient();
    const expenseId = req.params.id;
    if (!isValidUuid(expenseId)) {
      res.status(400).json({ error: 'Invalid expense ID.' });
      return;
    }

    // Fetch expense and cycle status
    const expRes = await db.query(
      `SELECT e.id, e.billing_cycle_id, e.paid_by_user_id, e.amount_fils, e.receipt_url, bc.status
       FROM expenses e
       JOIN billing_cycles bc ON bc.id = e.billing_cycle_id
       WHERE e.id = $1;`,
      [expenseId]
    );

    if (expRes.rowCount === 0) {
      res.status(404).json({ error: 'Expense not found.' });
      return;
    }

    const expense = expRes.rows[0];

    // Check permissions: must be author or admin
    const isPayer = req.user!.id === expense.paid_by_user_id;
    const isAdmin = req.user!.role === 'admin';
    if (!isPayer && !isAdmin) {
      res.status(403).json({ error: 'You are not authorized to delete this expense.' });
      return;
    }

    // Check cycle status: cannot delete from closed cycle
    if (expense.status !== 'open') {
      res.status(400).json({ error: 'Cannot delete expense from a closed or settled billing cycle.' });
      return;
    }

    // Unlink physical receipt file from disk if present
    if (expense.receipt_url) {
      await deleteReceiptFile(expense.receipt_url);
    }

    // Delete expense from database
    await db.query(`DELETE FROM expenses WHERE id = $1;`, [expenseId]);

    // Update cycle total
    await db.query(
      `UPDATE billing_cycles 
       SET total_expense_fils = GREATEST(0, total_expense_fils - $1) 
       WHERE id = $2;`,
      [expense.amount_fils, expense.billing_cycle_id]
    );

    res.status(200).json({ message: 'Expense and associated receipt file deleted successfully.' });
  } catch (err: any) {
    console.error('Error deleting expense:', err);
    res.status(500).json({ error: 'Failed to delete expense.' });
  }
});
