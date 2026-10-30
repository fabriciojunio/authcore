import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'crypto';
import { isoBase64URL, isoCBOR } from '@simplewebauthn/server/helpers';

/**
 * Autenticador WebAuthn em software, para teste.
 *
 * Monta o attestationObject e as asserções do jeito que um celular montaria e
 * assina com uma chave P-256 própria, de modo que a verificação do servidor roda
 * inteira, sem mock.
 */

export const RP_ID = 'localhost';
export const ORIGIN = 'http://localhost:3000';

export const FLAG_UP = 0x01;
export const FLAG_UV = 0x04;
export const FLAG_AT = 0x40;

function b64(bytes: Uint8Array): string {
  return isoBase64URL.fromBuffer(new Uint8Array(bytes));
}

export class SoftwareAuthenticator {
  readonly credentialId = randomBytes(32);
  private readonly privateKey: KeyObject;
  private readonly publicJwk: { x: string; y: string };
  counter = 0;

  constructor(
    private readonly userId: string,
    private readonly rpId = RP_ID,
  ) {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    this.privateKey = privateKey;
    this.publicJwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  }

  get id(): string {
    return b64(this.credentialId);
  }

  private authData(flags: number, extra?: Buffer): Buffer {
    const rpIdHash = createHash('sha256').update(this.rpId).digest();
    const signCount = Buffer.alloc(4);
    signCount.writeUInt32BE(this.counter);
    return Buffer.concat([rpIdHash, Buffer.from([flags]), signCount, ...(extra ? [extra] : [])]);
  }

  register(challenge: string, origin = ORIGIN, flags = FLAG_UP | FLAG_UV | FLAG_AT) {
    const coseKey = new Map<number, number | Uint8Array>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, isoBase64URL.toBuffer(this.publicJwk.x)],
      [-3, isoBase64URL.toBuffer(this.publicJwk.y)],
    ]);
    const idLength = Buffer.alloc(2);
    idLength.writeUInt16BE(this.credentialId.length);
    const attested = Buffer.concat([Buffer.alloc(16), idLength, this.credentialId, Buffer.from(isoCBOR.encode(coseKey))]);
    const attestationObject = isoCBOR.encode(
      new Map<string, unknown>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', new Uint8Array(this.authData(flags, attested))],
      ]) as never,
    );
    const clientData = { type: 'webauthn.create', challenge, origin, crossOrigin: false };
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key' as const,
      clientExtensionResults: {},
      response: {
        clientDataJSON: isoBase64URL.fromUTF8String(JSON.stringify(clientData)),
        attestationObject: b64(attestationObject),
        transports: ['internal' as const],
      },
    };
  }

  assert(challenge: string, options: { origin?: string; userHandle?: string; flags?: number } = {}) {
    const authenticatorData = this.authData(options.flags ?? FLAG_UP | FLAG_UV);
    const clientDataJSON = Buffer.from(
      JSON.stringify({ type: 'webauthn.get', challenge, origin: options.origin ?? ORIGIN, crossOrigin: false }),
    );
    const signed = Buffer.concat([authenticatorData, createHash('sha256').update(clientDataJSON).digest()]);
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key' as const,
      clientExtensionResults: {},
      response: {
        clientDataJSON: b64(clientDataJSON),
        authenticatorData: b64(authenticatorData),
        signature: b64(sign('sha256', signed, this.privateKey)),
        userHandle: options.userHandle ?? isoBase64URL.fromUTF8String(this.userId),
      },
    };
  }
}
