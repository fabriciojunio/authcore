import { z } from 'zod';

// Campos binários do WebAuthn chegam em base64url. O teto evita que um corpo de
// 10 kB inteiro vire uma única string que a biblioteca tenta decodificar.
const base64url = (max: number): z.ZodString =>
  z.string().min(1).max(max).regex(/^[A-Za-z0-9_-]+$/, 'Invalid base64url');

// Mesmo tamanho da coluna credential_id: id maior que isso nem chega ao banco.
const CREDENTIAL_ID_MAX = 1024;

const transports = z
  .array(z.enum(['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb']))
  .max(7)
  .optional();

export const passkeyRegistrationSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60, 'Name must not exceed 60 characters'),
  response: z.object({
    id: base64url(CREDENTIAL_ID_MAX),
    rawId: base64url(CREDENTIAL_ID_MAX),
    type: z.literal('public-key'),
    authenticatorAttachment: z.enum(['platform', 'cross-platform']).optional(),
    clientExtensionResults: z.object({}).default({}),
    response: z.object({
      clientDataJSON: base64url(2048),
      attestationObject: base64url(4096),
      transports,
    }),
  }),
});

export const passkeyAuthenticationSchema = z.object({
  flowId: z.uuid('Invalid flow id'),
  response: z.object({
    id: base64url(CREDENTIAL_ID_MAX),
    rawId: base64url(CREDENTIAL_ID_MAX),
    type: z.literal('public-key'),
    authenticatorAttachment: z.enum(['platform', 'cross-platform']).optional(),
    clientExtensionResults: z.object({}).default({}),
    response: z.object({
      clientDataJSON: base64url(2048),
      authenticatorData: base64url(2048),
      signature: base64url(1024),
      userHandle: base64url(128).optional(),
    }),
  }),
});

export const passkeyIdSchema = z.object({
  id: z.uuid('Invalid passkey id'),
});

export type PasskeyRegistrationDto = z.infer<typeof passkeyRegistrationSchema>;
export type PasskeyAuthenticationDto = z.infer<typeof passkeyAuthenticationSchema>;
