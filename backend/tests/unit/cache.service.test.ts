import { CacheService } from '../../src/services/cache.service';
import { getRedisClient } from '../../src/config/redis';

jest.mock('../../src/config/redis');

/**
 * O cache não pode derrubar a requisição.
 *
 * Redis é dependência opcional aqui: se ele cair, a aplicação fica mais lenta,
 * e não fora do ar. Cada método abaixo tem que engolir a falha e devolver o
 * valor neutro, porque quem chama não sabe (nem deveria saber) que existe um
 * Redis do outro lado.
 */
describe('CacheService (degradação graciosa)', () => {
  const cliente = {
    get: jest.fn(),
    setEx: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
    exists: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
  };

  const cache = new CacheService('teste');

  beforeEach(() => {
    jest.mocked(getRedisClient).mockReturnValue(cliente as never);
  });

  describe('prefixo das chaves', () => {
    it('should namespace every key with the configured prefix', async () => {
      cliente.get.mockResolvedValue(null);

      await cache.get('perfil');

      expect(cliente.get).toHaveBeenCalledWith('teste:perfil');
    });

    it('should keep instances isolated from one another', async () => {
      cliente.get.mockResolvedValue(null);

      await new CacheService('outro').get('perfil');

      expect(cliente.get).toHaveBeenCalledWith('outro:perfil');
    });
  });

  describe('leitura', () => {
    it('should deserialize the stored JSON payload', async () => {
      cliente.get.mockResolvedValue(JSON.stringify({ id: 'u-1', papel: 'admin' }));

      await expect(cache.get('perfil')).resolves.toEqual({ id: 'u-1', papel: 'admin' });
    });

    it('should return null for a key that was never written', async () => {
      cliente.get.mockResolvedValue(null);

      await expect(cache.get('ausente')).resolves.toBeNull();
    });

    /**
     * Valor corrompido no Redis não pode virar erro 500. JSON.parse lança, e o
     * catch precisa cobrir isso tanto quanto cobre a queda de conexão.
     */
    it('should survive a corrupted value instead of throwing', async () => {
      cliente.get.mockResolvedValue('{isso nao e json');

      await expect(cache.get('corrompido')).resolves.toBeNull();
    });

    it('should return null when Redis is unreachable', async () => {
      cliente.get.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(cache.get('perfil')).resolves.toBeNull();
    });
  });

  describe('escrita', () => {
    it('should store the value serialized and with the given TTL', async () => {
      cliente.setEx.mockResolvedValue('OK');

      await cache.set('perfil', { id: 'u-1' }, 300);

      expect(cliente.setEx).toHaveBeenCalledWith('teste:perfil', 300, '{"id":"u-1"}');
    });

    it('should swallow a write failure so the request still completes', async () => {
      cliente.setEx.mockRejectedValue(new Error('OOM'));

      await expect(cache.set('perfil', { id: 'u-1' }, 60)).resolves.toBeUndefined();
    });

    it('should swallow a delete failure', async () => {
      cliente.del.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(cache.delete('perfil')).resolves.toBeUndefined();
    });
  });

  describe('remoção por padrão', () => {
    it('should delete every key that matches the pattern', async () => {
      cliente.keys.mockResolvedValue(['teste:user:1', 'teste:user:2']);
      cliente.del.mockResolvedValue(2);

      await cache.deletePattern('user:*');

      expect(cliente.keys).toHaveBeenCalledWith('teste:user:*');
      expect(cliente.del).toHaveBeenCalledWith(['teste:user:1', 'teste:user:2']);
    });

    /**
     * Chamar del com lista vazia é erro no Redis. O guarda existe por isso, e
     * some com facilidade numa refatoração.
     */
    it('should not call del when the pattern matches nothing', async () => {
      cliente.keys.mockResolvedValue([]);

      await cache.deletePattern('user:*');

      expect(cliente.del).not.toHaveBeenCalled();
    });
  });

  describe('existência', () => {
    it('should report true only when Redis answers exactly 1', async () => {
      cliente.exists.mockResolvedValue(1);
      await expect(cache.exists('perfil')).resolves.toBe(true);

      cliente.exists.mockResolvedValue(0);
      await expect(cache.exists('perfil')).resolves.toBe(false);
    });

    it('should report false when Redis is unreachable', async () => {
      cliente.exists.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(cache.exists('perfil')).resolves.toBe(false);
    });
  });

  describe('contador', () => {
    /**
     * Este contador é o que sustenta o limite de tentativas de login. O TTL só
     * pode ser aplicado na primeira ocorrência: aplicar a cada incremento
     * empurraria a janela para frente e o limite nunca fecharia.
     */
    it('should set the expiry only on the first increment', async () => {
      cliente.incr.mockResolvedValue(1);

      await cache.increment('tentativas:u-1', 900);

      expect(cliente.expire).toHaveBeenCalledWith('teste:tentativas:u-1', 900);
    });

    it('should not push the window forward on later increments', async () => {
      cliente.incr.mockResolvedValue(4);

      await cache.increment('tentativas:u-1', 900);

      expect(cliente.expire).not.toHaveBeenCalled();
    });

    it('should not set an expiry when none was asked for', async () => {
      cliente.incr.mockResolvedValue(1);

      await cache.increment('visitas');

      expect(cliente.expire).not.toHaveBeenCalled();
    });

    it('should return zero when Redis is unreachable', async () => {
      cliente.incr.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(cache.increment('tentativas:u-1')).resolves.toBe(0);
    });
  });

  describe('lista de tokens revogados', () => {
    it('should store the revoked token under its own namespace', async () => {
      cliente.setEx.mockResolvedValue('OK');

      await cache.blacklistToken('abc123', 900);

      expect(cliente.setEx).toHaveBeenCalledWith('teste:blacklist:abc123', 900, 'true');
    });

    it('should recognise a revoked token', async () => {
      cliente.get.mockResolvedValue('true');

      await expect(cache.isTokenBlacklisted('abc123')).resolves.toBe(true);
    });

    it('should treat an unknown token as not revoked', async () => {
      cliente.get.mockResolvedValue(null);

      await expect(cache.isTokenBlacklisted('abc123')).resolves.toBe(false);
    });

    /**
     * Este é o caso perigoso: com o Redis fora do ar, a lista de revogados some
     * e todo token volta a ser aceito. O comportamento hoje é esse, e está
     * cravado aqui para ninguém descobrir por acidente. Fechar em falha exigiria
     * tornar o Redis dependência obrigatória, o que é decisão de produto.
     */
    it('should fail open when Redis is down (documented trade-off)', async () => {
      cliente.get.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(cache.isTokenBlacklisted('abc123')).resolves.toBe(false);
    });
  });
});
