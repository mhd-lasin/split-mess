# Security Architecture & Policies
## Split Mess — Authentication, Authorization & Asset Security Model

**Document Version:** 1.0.0  
**Status:** Approved / Source of Truth  
**Target Environment:** Private Flat Utility (Zero Public Exposure)

---

## 1. Threat Model & Security Posture

Split Mess handles shared residential financial records and personal expenditures. While internal to flatmates, the system must withstand local network snooping, device borrowing, malicious file uploads, and unauthorized tampering.

### Threat Vectors & Mitigations
| Threat Vector | Attack Scenario | Architectural Defense |
| :--- | :--- | :--- |
| **Brute-Force PIN Attack** | Malicious flatmate or guest scripts automated requests against `/api/v1/auth/login`. | IP & User-based exponential rate-limiting (max 5 failed attempts per 15 mins) + bcrypt adaptive work factor. |
| **Session Hijacking / XSS** | Client script or malicious dependency attempts to steal authentication tokens. | JWT stored strictly in `HttpOnly`, `SameSite=Strict`, `Secure` cookies. Inaccessible via JavaScript `document.cookie`. |
| **Malicious Upload / RCE** | Attacker uploads executable PHP, Node, or shell script disguised as receipt photo. | Strict MIME-type checking, magic byte inspection, UUID renaming, and execution disabled on upload disk path. |
| **Unauthenticated Enumeration** | Outsider probes endpoint URLs to discover flatmate debts and habits. | Zero public registration; all data routes guarded by strict JWT authentication middleware. |
| **Financial State Tampering** | User submits negative or fractional amounts (`amount: -50.50`) to artificially credit balance. | Zod schema validation enforcing positive integer fils (`min(1)`) + PostgreSQL `CHECK (amount_fils > 0)`. |

---

## 2. Authentication: 4-Digit Numeric PIN + bcrypt

### 2.1 The Rationale
In a kitchen or grocery context, complex passwords or OAuth flows lead to friction, forgotten credentials, and abandoned bookkeeping. A 4-digit PIN enables friction-free mobile keypad entry while remaining cryptographically secure when paired with rate limiting and salted hashing.

### 2.2 Password / PIN Hashing Policy
- **Algorithm:** bcrypt (`bcryptjs` or native `bcrypt`).
- **Salt Rounds:** `12` rounds (approx. 250ms hashing time per attempt on modern CPU).
- **Validation Regex:** Strict numeric 4 digits: `^\d{4}$`.
- **Database Storage:** Stored as `pin_hash VARCHAR(255)`. Plaintext PINs are discarded immediately after memory comparison and never logged.

### 2.3 Rate Limiting & Lockout Defense
```typescript
import rateLimit from 'express-rate-limit';

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 5,                   // Max 5 failed attempts per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    error: 'Too many failed PIN attempts. Locked out for 15 minutes.'
  }
});
```

---

## 3. Session Management & HTTP-Only JWT Cookies

### 3.1 Token Lifecycle & Payload
- **Algorithm:** HMAC-SHA256 (`HS256`).
- **Entropy:** Secret key `JWT_SECRET` must be at least 256 bits (32 bytes) of cryptographically random entropy.
- **Expiration:** 30 days (`2592000` seconds).
- **Claims Payload:**
  ```json
  {
    "sub": "u0000000-0000-0000-0000-00000000000b",
    "role": "member",
    "name": "Member B",
    "iat": 1731081600,
    "exp": 1733673600
  }
  ```

### 3.2 Cookie Configuration Flags
Every authentication response delivers the token via the `Set-Cookie` response header:
```
Set-Cookie: splitmess_jwt=<JWT_TOKEN>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000
```
- **`HttpOnly`:** Prohibits access by `document.cookie`, defeating token theft via Cross-Site Scripting (XSS).
- **`SameSite=Strict`:** Prevents cross-site requests from including the authentication cookie, neutralizing Cross-Site Request Forgery (CSRF).
- **`Secure`:** Transmitted exclusively over TLS/HTTPS (bypassed conditionally on `NODE_ENV === 'development'` on localhost).
- **`Path=/`:** Scope limited to application root.

---

## 4. Zero Public Registration Policy

1. **Closed Ecosystem:** There is **NO** public `/api/v1/auth/register` or signup endpoint.
2. **Administrative Provisioning:**
   - New members can only be created by an Admin user (`role === 'admin'`) via `/api/v1/users` or through system migrations.
   - Admin sets the initial 4-digit PIN.
   - Users can update their own PIN only after authenticating with their current PIN.

---

## 5. Receipt File Upload Security Pipeline

### 5.1 Storage Isolation & Directory Traversal Defense
- Receipts are stored outside the web server's static root at `/uploads/receipts/`.
- Original client-provided filenames (e.g. `../../../../etc/passwd` or `malicious.exe.jpg`) are **completely stripped**.
- Files are saved strictly using randomly generated UUIDs:
  $$\text{Target File} = \text{randomUUID}() + \text{sanitized\_extension}$$
  *Example:* `f81d4fae-7dec-11d0-a765-00a0c91e6bf6.webp`

### 5.2 Upload Constraints & Verification Rules
1. **Size Limit:** Max **5MB** ($5 \times 1024 \times 1024 = 5,242,880\text{ bytes}$). Requests exceeding this are terminated immediately with HTTP 413 (Payload Too Large).
2. **MIME & Extension Whitelist:**
   - `image/jpeg` (`.jpg`, `.jpeg`)
   - `image/png` (`.png`)
   - `image/webp` (`.webp`)
   - All other MIME types (`application/pdf`, `.exe`, `.svg`, `.html`) are strictly rejected.
3. **Magic Byte Inspection:** The server inspects the initial byte headers of the uploaded file to ensure the binary payload matches real image headers (e.g., `FF D8 FF` for JPEG, `89 50 4E 47` for PNG).
4. **Access Control:** Receipt files are not exposed via open directory listings. Retrieval runs through an authenticated route `GET /api/v1/receipts/:filename` which checks JWT validity before piping disk bytes to the response.

---

## 6. Input Validation & API Defense in Depth

### 6.1 Zod Request Payloads Validation
Every input is schema-validated before reaching service logic:
```typescript
import { z } from 'zod';

export const CreateExpenseSchema = z.object({
  poolId: z.string().uuid(),
  amountFils: z.number().int().positive().max(10_000_000), // Max 100,000 AED
  description: z.string().min(2).max(255).trim(),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

export const LoginSchema = z.object({
  userId: z.string().uuid(),
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits')
});
```

### 6.2 Database Parameterization
All database interactions use PostgreSQL parameterized variables (`$1, $2, ...`), preventing SQL injection attacks entirely.
