import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { authRouter } from './routes/auth.routes.js';
import { cyclesRouter } from './routes/cycles.routes.js';
import { poolsRouter } from './routes/pools.routes.js';
import { expensesRouter } from './routes/expenses.routes.js';
import { settlementRouter } from './routes/settlement.routes.js';
import { authenticateToken } from './middleware/auth.middleware.js';

export const app = express();

// Disable X-Powered-By header to avoid fingerprinting Express
app.disable('x-powered-by');

// Configure trust proxy strictly by hop count from env (default 0 when exposed directly; set to 1 behind Nginx/Render/Railway)
const trustProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS || '0', 10);
if (!Number.isNaN(trustProxyHops) && trustProxyHops > 0) {
  app.set('trust proxy', trustProxyHops);
}

// 0. Security Headers Middleware (Defense-in-depth against XSS, clickjacking, MIME sniffing)
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// 1. CORS Middleware (Supports Vite dev server on 5173 and configurable CORS_ORIGIN in prod)
const envOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://localhost:4000',
  ...envOrigins,
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (same-origin, mobile apps, curl)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else if (process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

// 2. Parsers (Strict body size limits to prevent payload DoS)
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(cookieParser());

// 3. Security Rate Limiting
// 3a. General API rate limiter (prevents abuse while comfortably supporting 10+ roommates on shared Wi-Fi)
const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { status: 429, error: 'Too many requests. Please slow down and try again shortly.' },
});
app.use('/api', apiRateLimiter);

// 3b. Login PIN brute-force protection:
// - Per-account (IP-independent) failed-PIN lockout so spoofing X-Forwarded-For cannot brute-force a 4-digit PIN
export const loginAccountRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `acct:${typeof req.body?.userId === 'string' ? req.body.userId : 'anon'}`,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    status: 429,
    error: 'Too many failed PIN attempts for this account. Please wait 15 minutes.',
  },
});

// - Per-IP + userId limiter to prevent distributed probing while keeping roommates on shared Wi-Fi unaffected
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${req.ip ? ipKeyGenerator(req.ip) : 'unknown'}:${typeof req.body?.userId === 'string' ? req.body.userId : 'anon'}`,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    status: 429,
    error: 'Too many failed PIN attempts for this account. Please wait 15 minutes.',
  },
});

app.use('/api/auth/login', loginAccountRateLimiter, loginRateLimiter);

// 3c. Strict rate limiters for registration and PIN changes
const authMutationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    status: 429,
    error: 'Too many requests. Please wait 15 minutes and try again.',
  },
});
app.use('/api/auth/register', authMutationRateLimiter);
app.use('/api/auth/pin', authMutationRateLimiter);

// 4. Static Uploads Serving (Receipts require authentication; sandbox CSP prevents script execution)
const receiptStaticOptions = {
  setHeaders: (res: Response) => {
    res.setHeader('Content-Security-Policy', 'sandbox');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
  },
};
const avatarStaticOptions = {
  setHeaders: (res: Response) => {
    res.setHeader('Content-Security-Policy', 'sandbox');
    res.setHeader('X-Content-Type-Options', 'nosniff');
  },
};

const uploadsDir = path.resolve(process.cwd(), 'uploads', 'receipts');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads/receipts', authenticateToken, express.static(uploadsDir, receiptStaticOptions));

const avatarsDir = path.resolve(process.cwd(), 'uploads', 'avatars');
if (!fs.existsSync(avatarsDir)) {
  fs.mkdirSync(avatarsDir, { recursive: true });
}
app.use('/uploads/avatars', express.static(avatarsDir, avatarStaticOptions));

// Also check relative to root uploads
const rootUploadsDir = path.resolve(process.cwd(), '..', 'uploads', 'receipts');
if (fs.existsSync(rootUploadsDir)) {
  app.use('/uploads/receipts', authenticateToken, express.static(rootUploadsDir, receiptStaticOptions));
}
const rootAvatarsDir = path.resolve(process.cwd(), '..', 'uploads', 'avatars');
if (fs.existsSync(rootAvatarsDir)) {
  app.use('/uploads/avatars', express.static(rootAvatarsDir, avatarStaticOptions));
}

// 5. Mount API Routes
app.use('/api/auth', authRouter);
app.use('/api/cycles', cyclesRouter);
app.use('/api/pools', poolsRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/settlement', settlementRouter);

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', service: 'Split Mess API', timestamp: new Date().toISOString() });
});

// 6. Global Error Handling Middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'File size exceeds maximum permitted limit of 5MB.' });
      return;
    }
    res.status(400).json({ error: `Upload error: ${err.message}` });
    return;
  }

  const statusCode = err.status || 500;
  const isProd = process.env.NODE_ENV === 'production';
  if (statusCode >= 500) {
    console.error('Unhandled server error:', err);
  }
  res.status(statusCode).json({
    error: isProd && statusCode >= 500 ? 'Internal server error' : err.message || 'Internal server error',
  });
});

// 7. Production Client SPA Serving
const clientDist = path.resolve(process.cwd(), 'client', 'dist');
const altClientDist = path.resolve(__dirname, '..', '..', 'client', 'dist');
const resolvedDist = fs.existsSync(clientDist) ? clientDist : (fs.existsSync(altClientDist) ? altClientDist : null);

if (resolvedDist) {
  app.use(express.static(resolvedDist));
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }
    res.sendFile(path.join(resolvedDist, 'index.html'));
  });
}
