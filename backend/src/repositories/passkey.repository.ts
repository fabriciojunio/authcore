import { Passkey } from '@models/passkey.entity';
import { BaseRepository } from './base.repository';

export class PasskeyRepository extends BaseRepository<Passkey> {
  constructor() {
    super(Passkey);
  }

  async findByCredentialId(credentialId: string): Promise<Passkey | null> {
    return this.repository.findOne({ where: { credentialId } });
  }

  async listByUser(userId: string): Promise<Passkey[]> {
    return this.repository.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  // O contador só anda para a frente. A condição no próprio UPDATE impede que
  // duas autenticações concorrentes com o mesmo valor passem as duas.
  async advanceCounter(id: string, previous: number, next: number): Promise<boolean> {
    const result = await this.repository.createQueryBuilder()
      .update(Passkey)
      .set({ counter: next, lastUsedAt: new Date() })
      .where('id = :id AND counter = :previous', { id, previous })
      .execute();
    return result.affected === 1;
  }

  // Apaga só se a passkey for do usuário: o filtro por dono fica na consulta,
  // e passkey de outra pessoa responde igual a uma que não existe.
  async deleteOwned(id: string, userId: string): Promise<boolean> {
    const result = await this.repository.delete({ id, userId });
    return result.affected === 1;
  }
}

export const passkeyRepository = new PasskeyRepository();
