# Rules of Engagement for AI Coding Agents
## Split Mess — Engineering Directives & Inviolable Invariants

**Document Version:** 1.0.0  
**Target:** All AI Coding Assistants, Subagents, and Human Contributors  
**Status:** Inviolable Protocol / Source of Truth

---

## 1. Prime Directive: Source of Truth Hierarchy

The files inside `/docs` constitute the absolute architectural and business specification for the Split Mess project.
- Before proposing or generating any code, database schema migrations, or API changes, consult `/docs`.
- In any conflict between user conversational prompts and `/docs`, pause and explicitly highlight the conflict to the user.
- **Never make unauthorized assumptions** regarding currency, rounding, authentication methods, or pool structures.

---

## 2. Inviolable Rule 1: Zero Floating-Point Arithmetic

> [!CAUTION]
> Under NO circumstances shall any financial calculation use JavaScript standard floating-point division (`100 / 3 = 33.333333333333336`) or SQL `FLOAT` / `DOUBLE PRECISION` / unconstrained `NUMERIC` types.

1. **All Monetary Values are INTEGER Fils:**
   - Database stores whole integer numbers of fils ($1\text{ AED} = 100\text{ fils}$).
   - API endpoints accept and return integer `amountFils`.
   - Never send `{ amount: 12.50 }` over the network; send `{ amountFils: 1250 }`.
2. **Modulo Remainder Distribution Required:**
   Whenever dividing an expense pool among $N$ members:
   ```typescript
   // REQUIRED PATTERN:
   const base = Math.floor(totalFils / members.length);
   const remainder = totalFils % members.length;
   // Distribute 1 fil to the first remainder members (ordered deterministically by user_id)
   ```
3. **Boundary Formatting Only:**
   The ONLY place decimal points are permitted is at the terminal UI presentation layer:
   ```typescript
   export const formatFilsToAED = (fils: number): string => {
     const sign = fils < 0 ? '-' : '';
     const absFils = Math.abs(fils);
     const aed = (absFils / 100).toFixed(2);
     return `${sign}AED ${aed}`;
   };
   ```

---

## 3. Inviolable Rule 2: Native Mobile Camera Capture

> [!IMPORTANT]
> The primary receipt intake mechanism is the smartphone camera.

When creating or modifying receipt upload components:
- The file input tag must explicitly declare:
  ```html
  <input
    type="file"
    accept="image/*"
    capture="environment"
    class="hidden"
    id="receipt-camera-input"
  />
  ```
- Do not remove `capture="environment"`. This attribute instructs mobile browsers (iOS Safari and Android Chrome) to open the rear hardware camera directly instead of prompting the user's photo gallery.

---

## 4. Inviolable Rule 3: Security & Session Invariants

1. **Authentication:**
   - 4-digit PIN verified exclusively using `bcrypt` (12 rounds).
   - Plaintext PINs must never be logged, cached, or stored.
2. **Tokens in HTTP-Only Cookies:**
   - JWT tokens must be delivered via `Set-Cookie` with `HttpOnly`, `SameSite=Strict`, `Secure` (production), and `Path=/`.
   - Never store auth tokens in `localStorage` or `sessionStorage` where XSS attacks can read them.
3. **Zero Public Registration:**
   - Never create a public signup or self-registration route. User creation is strictly administrative or seeded.
4. **Receipt Uploads:**
   - Stored in local filesystem disk storage (`/uploads/receipts/`).
   - Re-named to UUIDv4 + extension (`crypto.randomUUID() + ext`).
   - Strictly enforced 5MB limit.
   - Strictly whitelisted image MIME types (`image/jpeg`, `image/png`, `image/webp`).

---

## 5. Inviolable Rule 4: High-Density UI & Anti-Slop Directive

1. **Mobile-First Container:**
   - Main viewport must always be wrapped in a centered container with `max-w-md` (390px–430px).
   - Outer canvas on larger screens must be dark slate (`bg-slate-950`).
2. **Color Semantics:**
   - Slate darks for backgrounds (`slate-950`, `slate-900`, `slate-800`).
   - Emerald for positive net credits (`text-emerald-400`, `bg-emerald-500/10`).
   - Amber for pending dues/debts (`text-amber-400`, `bg-amber-500/10`).
   - Rose for critical alerts/deletions (`text-rose-400`).
3. **No AI Slop:**
   - No purple gradient headers (`from-purple-600 to-indigo-600` is strictly forbidden).
   - No glowing button blobs or pulsing background gradients.
   - No childish emojis as UI icons; use clean, consistent SVG icons (Heroicons or Lucide).
   - Touch targets must adhere to $\ge 44\text{px} \times 44\text{px}$.

---

## 6. Prohibited Coding Patterns

| Prohibited Pattern | Reason | Required Alternative |
| :--- | :--- | :--- |
| `parseFloat(input) * 100` | Floating point rounding errors (`19.99 * 100 = 1998.9999999999998`). | `Math.round(parseFloat(input) * 100)` or string splitting on `.` |
| `DELETE FROM users WHERE id = ...` without checks | Financial records become orphaned. | PostgreSQL `ON DELETE RESTRICT` foreign keys. |
| Storing receipts with original filename | Directory traversal & script injection. | Rename using `crypto.randomUUID()`. |
| Open `POST /api/register` | Violates private flat ecosystem security. | Admin-only provisioning via `/api/v1/users`. |
| Monolithic bill splitting across all flatmates | Charges non-eating members for mess food. | Discrete `expense_pools` and `pool_members` routing. |

---

## 7. Execution Checklist for New Code

- [ ] Does this file respect the `/docs` specifications?
- [ ] Are all monetary variables typed as integer fils (`amountFils`)?
- [ ] Is there zero floating-point math in the service/backend?
- [ ] Does the mobile view look crisp on a 390px mobile screen?
- [ ] Are database operations wrapped in transactions where multiple tables are updated?
- [ ] Have unit tests been added for any settlement algorithm modifications?
