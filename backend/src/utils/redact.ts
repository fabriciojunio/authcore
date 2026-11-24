const SENSITIVE =
  /passw(or)?d|passphrase|token|secret|authorization|cookie|api[-_]?key|credit[-_]?card|totp|otp|e-?mail/i;
const REDACTED = '[REDACTED]';
const MAX_DEPTH = 6;

/**
 * Copia o valor trocando todo campo sensível, em qualquer profundidade.
 *
 * Um Error vira só nome, mensagem e pilha: o erro do driver do Postgres carrega
 * os parâmetros do INSERT (e-mail, hash de senha, IP) como propriedades, e o
 * JSON do log levava tudo junto.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (value instanceof Date || value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE.test(key) ? REDACTED : redact(item, depth + 1),
    ])
  );
}
