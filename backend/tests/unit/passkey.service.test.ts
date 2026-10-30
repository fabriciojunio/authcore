import { randomBytes } from 'crypto';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { PasskeyService } from '../../src/services/passkey.service';
import { passkeyRepository } from '../../src/repositories/passkey.repository';
import { userRepository } from '../../src/repositories/user.repository';
import { tokenService } from '../../src/services/token.service';
import { cacheService } from '../../src/services/cache.service';
import { Passkey } from '../../src/models/passkey.entity';
import { User, UserRole, UserStatus } from '../../src/models/user.entity';
import { AuthenticationError, NotFoundError } from '../../src/errors/AppError';
import { FLAG_AT, FLAG_UP, ORIGIN, SoftwareAuthenticator } from '../helpers/softwareAuthenticator';

/**
 * Passkeys com um autenticador de verdade, só que em software.
 *
 * O teste gera uma chave P-256, monta o attestationObject e as asserções do jeito
 * que um celular montaria e assina com essa chave. Assim a biblioteca de WebAuthn
 * roda sem mock e cada recusa abaixo é a verificação real que barra o ataque.
 */

jest.mock('../../src/repositories/passkey.repository');
jest.mock('../../src/repositories/user.repository');
jest.mock('../../src/services/token.service');
jest.mock('../../src/services/cache.service');
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockPasskeys = passkeyRepository as jest.Mocked<typeof passkeyRepository>;
const mockUsers = userRepository as jest.Mocked<typeof userRepository>;
const mockTokens = tokenService as jest.Mocked<typeof tokenService>;
const mockCache = cacheService as jest.Mocked<typeof cacheService>;

const USER_ID = '6f1c3c1e-9a52-4f7e-8d1a-2b7f4c0e5a10';

function usuario(campos: Partial<User> = {}): User {
  return Object.assign(new User(), {
    id: USER_ID,
    email: 'usuario@teste.com',
    name: 'Usuário',
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
    emailVerifiedAt: new Date('2026-01-01'),
    failedLoginAttempts: 0,
    sessionVersion: 3,
    ...campos,
  });
}

describe('PasskeyService', () => {
  let service: PasskeyService;
  let store: Map<string, unknown>;
  let saved: Passkey | null;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PasskeyService();
    store = new Map();
    saved = null;

    // Cache de verdade em memória: consume lê e apaga, como o GETDEL do Redis.
    mockCache.set.mockImplementation(async (key: string, value: unknown) => {
      store.set(key, value);
    });
    mockCache.consume.mockImplementation(async (key: string) => {
      const value = store.get(key) ?? null;
      store.delete(key);
      return value as never;
    });

    mockUsers.findById.mockResolvedValue(usuario());
    mockUsers.findByIdWithPassword.mockResolvedValue(usuario());
    mockUsers.completeLogin.mockResolvedValue(true);
    mockPasskeys.listByUser.mockResolvedValue([]);
    mockPasskeys.create.mockImplementation(async (data) => {
      saved = Object.assign(new Passkey(), { id: 'pk-1', createdAt: new Date(), lastUsedAt: null }, data) as Passkey;
      return saved;
    });
    mockPasskeys.findByCredentialId.mockImplementation(async (id: string) =>
      saved && saved.credentialId === id ? saved : null,
    );
    mockPasskeys.advanceCounter.mockResolvedValue(true);
    mockTokens.generateTokenPair.mockReturnValue({ accessToken: 'access', refreshToken: 'refresh', expiresIn: 900 });
    mockTokens.hashToken.mockReturnValue('refresh-hash');
  });

  async function registrar(authenticator: SoftwareAuthenticator): Promise<void> {
    const options = await service.registrationOptions(USER_ID);
    await service.verifyRegistration(USER_ID, authenticator.register(options.challenge), 'Notebook');
  }

  describe('cadastro', () => {
    it('saves the public key of a passkey made with biometrics', async () => {
      const authenticator = new SoftwareAuthenticator(USER_ID);
      const options = await service.registrationOptions(USER_ID);

      expect(options.authenticatorSelection).toMatchObject({ residentKey: 'required', userVerification: 'required' });

      const view = await service.verifyRegistration(USER_ID, authenticator.register(options.challenge), 'Notebook');

      expect(view).toEqual(expect.objectContaining({ id: 'pk-1', name: 'Notebook' }));
      expect(mockPasskeys.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID, credentialId: authenticator.id, counter: 0, transports: ['internal'] }),
      );
    });

    it('refuses to register for an inactive account', async () => {
      mockUsers.findById.mockResolvedValue(usuario({ status: UserStatus.SUSPENDED }));

      await expect(service.registrationOptions(USER_ID)).rejects.toThrow(AuthenticationError);
    });

    it('lists existing passkeys so the same device is not registered twice', async () => {
      const existente = new SoftwareAuthenticator(USER_ID);
      mockPasskeys.listByUser.mockResolvedValue([
        Object.assign(new Passkey(), { credentialId: existente.id, transports: ['internal'] }),
      ]);

      const options = await service.registrationOptions(USER_ID);

      expect(options.excludeCredentials).toEqual([{ id: existente.id, type: 'public-key', transports: ['internal'] }]);
    });

    it('uses each registration challenge only once', async () => {
      const authenticator = new SoftwareAuthenticator(USER_ID);
      const options = await service.registrationOptions(USER_ID);
      const resposta = authenticator.register(options.challenge);

      await service.verifyRegistration(USER_ID, resposta, 'Notebook');

      await expect(service.verifyRegistration(USER_ID, resposta, 'Notebook')).rejects.toThrow(
        'Passkey registration expired',
      );
    });

    it('rejects a registration signed for another site', async () => {
      const options = await service.registrationOptions(USER_ID);
      const resposta = new SoftwareAuthenticator(USER_ID).register(options.challenge, 'https://phishing.example');

      await expect(service.verifyRegistration(USER_ID, resposta, 'Notebook')).rejects.toThrow(
        'Passkey could not be verified',
      );
      expect(mockPasskeys.create).not.toHaveBeenCalled();
    });

    it('rejects a passkey created for a different relying party', async () => {
      const options = await service.registrationOptions(USER_ID);
      const resposta = new SoftwareAuthenticator(USER_ID, 'evil.example').register(options.challenge);

      await expect(service.verifyRegistration(USER_ID, resposta, 'Notebook')).rejects.toThrow(AuthenticationError);
    });

    it('rejects a registration without user verification', async () => {
      const options = await service.registrationOptions(USER_ID);
      const resposta = new SoftwareAuthenticator(USER_ID).register(options.challenge, ORIGIN, FLAG_UP | FLAG_AT);

      await expect(service.verifyRegistration(USER_ID, resposta, 'Notebook')).rejects.toThrow(AuthenticationError);
    });

    it('rejects a response to a challenge the server never issued', async () => {
      await service.registrationOptions(USER_ID);
      const resposta = new SoftwareAuthenticator(USER_ID).register(isoBase64URL.fromBuffer(new Uint8Array(randomBytes(32))));

      await expect(service.verifyRegistration(USER_ID, resposta, 'Notebook')).rejects.toThrow(AuthenticationError);
    });
  });

  describe('login', () => {
    let authenticator: SoftwareAuthenticator;

    beforeEach(async () => {
      authenticator = new SoftwareAuthenticator(USER_ID);
      await registrar(authenticator);
    });

    it('signs in with a valid assertion and issues tokens for the right session version', async () => {
      const { flowId, options } = await service.authenticationOptions();

      const result = await service.verifyAuthentication(flowId, authenticator.assert(options.challenge), '10.0.0.1');

      expect(result.tokens.accessToken).toBe('access');
      expect(mockTokens.generateTokenPair).toHaveBeenCalledWith(expect.objectContaining({ sub: USER_ID, sessionVersion: 3 }));
      expect(mockUsers.completeLogin).toHaveBeenCalledWith(expect.anything(), 'refresh-hash');
      expect(result.user).not.toHaveProperty('password');
    });

    it('does not accept the same assertion twice (replay)', async () => {
      const { flowId, options } = await service.authenticationOptions();
      const assercao = authenticator.assert(options.challenge);
      await service.verifyAuthentication(flowId, assercao, '10.0.0.1');

      await expect(service.verifyAuthentication(flowId, assercao, '10.0.0.1')).rejects.toThrow(
        'Passkey sign-in expired',
      );
    });

    it('does not accept an assertion made for another flow', async () => {
      const primeiro = await service.authenticationOptions();
      const segundo = await service.authenticationOptions();

      await expect(
        service.verifyAuthentication(segundo.flowId, authenticator.assert(primeiro.options.challenge), '10.0.0.1'),
      ).rejects.toThrow('Invalid passkey');
    });

    it('rejects an assertion collected by a phishing page', async () => {
      const { flowId, options } = await service.authenticationOptions();

      await expect(
        service.verifyAuthentication(flowId, authenticator.assert(options.challenge, { origin: 'https://phishing.example' }), '10.0.0.1'),
      ).rejects.toThrow('Invalid passkey');
      expect(mockTokens.generateTokenPair).not.toHaveBeenCalled();
    });

    it('rejects a signature from a key that is not the registered one', async () => {
      const { flowId, options } = await service.authenticationOptions();
      const impostor = new SoftwareAuthenticator(USER_ID);
      const assercao = { ...impostor.assert(options.challenge), id: authenticator.id, rawId: authenticator.id };

      await expect(service.verifyAuthentication(flowId, assercao, '10.0.0.1')).rejects.toThrow('Invalid passkey');
    });

    it('rejects an assertion without user verification', async () => {
      const { flowId, options } = await service.authenticationOptions();

      await expect(
        service.verifyAuthentication(flowId, authenticator.assert(options.challenge, { flags: FLAG_UP }), '10.0.0.1'),
      ).rejects.toThrow('Invalid passkey');
    });

    it('answers an unknown credential with the same message as a bad signature', async () => {
      const { flowId, options } = await service.authenticationOptions();

      await expect(
        service.verifyAuthentication(flowId, new SoftwareAuthenticator(USER_ID).assert(options.challenge), '10.0.0.1'),
      ).rejects.toThrow('Invalid passkey');
    });

    it('rejects a passkey presented on behalf of another user', async () => {
      const { flowId, options } = await service.authenticationOptions();
      const outro = isoBase64URL.fromUTF8String('00000000-0000-4000-8000-000000000000');

      await expect(
        service.verifyAuthentication(flowId, authenticator.assert(options.challenge, { userHandle: outro }), '10.0.0.1'),
      ).rejects.toThrow('Invalid passkey');
      expect(mockUsers.findByIdWithPassword).not.toHaveBeenCalled();
    });

    it('treats a counter that goes backwards as a cloned authenticator', async () => {
      saved!.counter = 10;
      authenticator.counter = 5;
      const { flowId, options } = await service.authenticationOptions();

      await expect(service.verifyAuthentication(flowId, authenticator.assert(options.challenge), '10.0.0.1')).rejects.toThrow(
        'Invalid passkey',
      );
      expect(mockPasskeys.advanceCounter).not.toHaveBeenCalled();
    });

    it('advances a counter that moves forward', async () => {
      saved!.counter = 10;
      authenticator.counter = 11;
      const { flowId, options } = await service.authenticationOptions();

      await service.verifyAuthentication(flowId, authenticator.assert(options.challenge), '10.0.0.1');

      expect(mockPasskeys.advanceCounter).toHaveBeenCalledWith('pk-1', 10, 11);
    });

    it('loses the race when another sign-in already advanced the counter', async () => {
      mockPasskeys.advanceCounter.mockResolvedValue(false);
      const { flowId, options } = await service.authenticationOptions();

      await expect(service.verifyAuthentication(flowId, authenticator.assert(options.challenge), '10.0.0.1')).rejects.toThrow(
        'Invalid passkey',
      );
      expect(mockTokens.generateTokenPair).not.toHaveBeenCalled();
    });

    it.each([
      ['locked', { lockedUntil: new Date(Date.now() + 60_000) }, 'temporarily locked'],
      ['unverified', { emailVerifiedAt: undefined }, 'verify your email'],
      ['suspended', { status: UserStatus.SUSPENDED }, 'not active'],
    ])('does not sign in a %s account', async (_caso, campos, mensagem) => {
      mockUsers.findByIdWithPassword.mockResolvedValue(usuario(campos as Partial<User>));
      const { flowId, options } = await service.authenticationOptions();

      await expect(service.verifyAuthentication(flowId, authenticator.assert(options.challenge), '10.0.0.1')).rejects.toThrow(
        mensagem,
      );
      expect(mockTokens.generateTokenPair).not.toHaveBeenCalled();
    });

    it('fails when the session changed between the check and the login', async () => {
      mockUsers.completeLogin.mockResolvedValue(false);
      const { flowId, options } = await service.authenticationOptions();

      await expect(service.verifyAuthentication(flowId, authenticator.assert(options.challenge), '10.0.0.1')).rejects.toThrow(
        'Credentials changed',
      );
    });
  });

  describe('gestão', () => {
    it('removes only a passkey the user owns', async () => {
      mockPasskeys.deleteOwned.mockResolvedValue(false);

      await expect(service.remove(USER_ID, 'pk-de-outra-pessoa')).rejects.toThrow(NotFoundError);
      expect(mockPasskeys.deleteOwned).toHaveBeenCalledWith('pk-de-outra-pessoa', USER_ID);
    });

    it('removes an owned passkey', async () => {
      mockPasskeys.deleteOwned.mockResolvedValue(true);

      await expect(service.remove(USER_ID, 'pk-1')).resolves.toBeUndefined();
    });

    it('lists passkeys without exposing the public key or the counter', async () => {
      mockPasskeys.listByUser.mockResolvedValue([
        Object.assign(new Passkey(), {
          id: 'pk-1', name: 'Celular', publicKey: Buffer.from('x'), counter: 7, createdAt: new Date(), lastUsedAt: null,
        }),
      ]);

      const lista = await service.list(USER_ID);

      expect(lista).toEqual([expect.objectContaining({ id: 'pk-1', name: 'Celular' })]);
      expect(lista[0]).not.toHaveProperty('publicKey');
      expect(lista[0]).not.toHaveProperty('counter');
    });
  });
});
