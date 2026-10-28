// Imported first by main.tsx, before any schema exists. The CSP forbids eval, and Zod would
// otherwise probe `new Function` to compile faster validators, which the browser reports as a
// Trusted Types violation. Jitless mode validates without generating code.
import { z } from 'zod'

z.config({ jitless: true })
