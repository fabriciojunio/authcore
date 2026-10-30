import { randomUUID } from 'crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { isoUint8Array, isoBase64URL } from '@simplewebauthn/server/helpers';
import { config } from '@config/app.config';
import { logger } from '@config/logger';
import { AuthenticationError, NotFoundError } from '@errors/AppError';
import { Passkey } from '@models/passkey.entity';
import { passkeyRepository } from '@repositories/passkey.repository';
import { userRepository } from '@repositories/user.repository';
import { cacheService } from './cache.service';
import { tokenService } from './token.service';
import type { AuthResult } from './auth.service';

// Cinco minutos para o usuário tocar no sensor; depois disso o desafio vale nada.
const VALIDADE_DO_DESAFIO = 300;

interface Desafio {
  challenge: string;
}

export interface PasskeyView {
  id: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

function paraView(passkey: Passkey): PasskeyView {
  return { id: passkey.id, name: passkey.name, createdAt: passkey.createdAt, lastUsedAt: passkey.lastUsedAt ?? null };
}

export class PasskeyService {
  async registrationOptions(userId: string): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const user = await userRepository.findById(userId);
    if (!user || !user.isActive()) throw new AuthenticationError('Account is not active');

    const existentes = await passkeyRepository.listByUser(userId);
    const options = await generateRegistrationOptions({
      rpName: config.webauthn.rpName,
      rpID: config.webauthn.rpId,
      userName: user.email,
      userDisplayName: user.name,
      userID: isoUint8Array.fromUTF8String(user.id),
      attestationType: 'none',
      // Não deixa cadastrar duas vezes o mesmo aparelho.
      excludeCredentials: existentes.map((p) => ({
        id: p.credentialId,
        transports: (p.transports ?? undefined) as AuthenticatorTransport[] | undefined,
      })),
      // Passkey descoberta pelo aparelho e com biometria ou PIN: substitui senha e
      // segundo fator de uma vez.
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });

    await cacheService.set<Desafio>(`webauthn:registro:${userId}`, { challenge: options.challenge }, VALIDADE_DO_DESAFIO);
    return options;
  }

  async verifyRegistration(userId: string, response: RegistrationResponseJSON, name: string): Promise<PasskeyView> {
    const desafio = await cacheService.consume<Desafio>(`webauthn:registro:${userId}`);
    if (!desafio) throw new AuthenticationError('Passkey registration expired. Start again');

    let verificacao;
    try {
      verificacao = await verifyRegistrationResponse({
        response,
        expectedChallenge: desafio.challenge,
        expectedOrigin: config.webauthn.origin,
        expectedRPID: config.webauthn.rpId,
        requireUserVerification: true,
      });
    } catch (error) {
      logger.warn('Passkey registration rejected', { userId, reason: (error as Error).message });
      throw new AuthenticationError('Passkey could not be verified');
    }
    if (!verificacao.verified || !verificacao.registrationInfo) {
      throw new AuthenticationError('Passkey could not be verified');
    }

    const { credential } = verificacao.registrationInfo;
    const salva = await passkeyRepository.create({
      userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? null,
      name,
    });
    logger.info('Passkey registered', { userId, passkeyId: salva.id });
    return paraView(salva);
  }

  async authenticationOptions(): Promise<{ flowId: string; options: PublicKeyCredentialRequestOptionsJSON }> {
    // Sem lista de credenciais: o aparelho oferece a passkey que tiver para este
    // site, e o usuário não precisa nem digitar o e-mail.
    const options = await generateAuthenticationOptions({
      rpID: config.webauthn.rpId,
      userVerification: 'required',
    });
    const flowId = randomUUID();
    await cacheService.set<Desafio>(`webauthn:login:${flowId}`, { challenge: options.challenge }, VALIDADE_DO_DESAFIO);
    return { flowId, options };
  }

  async verifyAuthentication(flowId: string, response: AuthenticationResponseJSON, ipAddress: string): Promise<AuthResult> {
    const desafio = await cacheService.consume<Desafio>(`webauthn:login:${flowId}`);
    if (!desafio) throw new AuthenticationError('Passkey sign-in expired. Start again');

    // Mesma mensagem para credencial desconhecida e para assinatura inválida: a
    // resposta não diz qual credenciais existem.
    const passkey = await passkeyRepository.findByCredentialId(response.id);
    if (!passkey) throw new AuthenticationError('Invalid passkey');

    // A passkey descoberta devolve o id do usuário; ele tem de ser o dono dela.
    const userHandle = response.response.userHandle;
    if (userHandle && isoUint8Array.toUTF8String(isoBase64URL.toBuffer(userHandle)) !== passkey.userId) {
      logger.warn('Passkey user handle mismatch', { passkeyId: passkey.id });
      throw new AuthenticationError('Invalid passkey');
    }

    const user = await userRepository.findByIdWithPassword(passkey.userId);
    if (!user) throw new AuthenticationError('Invalid passkey');
    if (user.isLocked()) {
      throw new AuthenticationError('Account temporarily locked due to too many failed attempts. Try again later.');
    }
    if (!user.isEmailVerified()) throw new AuthenticationError('Please verify your email before logging in');
    if (!user.isActive()) throw new AuthenticationError('Account is not active');

    let verificacao;
    try {
      verificacao = await verifyAuthenticationResponse({
        response,
        expectedChallenge: desafio.challenge,
        expectedOrigin: config.webauthn.origin,
        expectedRPID: config.webauthn.rpId,
        credential: {
          id: passkey.credentialId,
          publicKey: new Uint8Array(passkey.publicKey),
          counter: passkey.counter,
          transports: (passkey.transports ?? undefined) as AuthenticatorTransport[] | undefined,
        },
        requireUserVerification: true,
      });
    } catch (error) {
      logger.warn('Passkey authentication rejected', { passkeyId: passkey.id, reason: (error as Error).message });
      throw new AuthenticationError('Invalid passkey');
    }
    if (!verificacao.verified) throw new AuthenticationError('Invalid passkey');

    const { newCounter } = verificacao.authenticationInfo;
    // Contador que não anda para a frente indica autenticador clonado. Passkeys
    // sincronizadas usam sempre zero, e aí só o desafio de uso único protege.
    if (passkey.counter > 0 && newCounter <= passkey.counter) {
      logger.warn('Passkey counter regression', { passkeyId: passkey.id });
      throw new AuthenticationError('Invalid passkey');
    }
    if (!(await passkeyRepository.advanceCounter(passkey.id, passkey.counter, newCounter))) {
      throw new AuthenticationError('Invalid passkey');
    }

    const tokens = tokenService.generateTokenPair({
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionVersion: user.sessionVersion,
    });
    const completed = await userRepository.completeLogin(user, tokenService.hashToken(tokens.refreshToken));
    if (!completed) throw new AuthenticationError('Credentials changed. Please sign in again');

    logger.info('User logged in with passkey', { userId: user.id, passkeyId: passkey.id, ipAddress });
    return { user: user.toSafeObject(), tokens };
  }

  async list(userId: string): Promise<PasskeyView[]> {
    return (await passkeyRepository.listByUser(userId)).map(paraView);
  }

  async remove(userId: string, passkeyId: string): Promise<void> {
    if (!(await passkeyRepository.deleteOwned(passkeyId, userId))) throw new NotFoundError('Passkey');
    logger.info('Passkey removed', { userId, passkeyId });
  }
}

export const passkeyService = new PasskeyService();
