/**
 * Configuração das passkeys.
 *
 * A passkey fica presa ao RP ID. Se ele sair errado, o cadastro falha em todo
 * navegador; se a origem não pertencer ao RP, o navegador recusa a credencial.
 * Os dois erros têm de aparecer na subida, e não no primeiro usuário.
 */

function carregar(env: Record<string, string | undefined>) {
  const anterior = { ...process.env };
  Object.assign(process.env, env);
  for (const [chave, valor] of Object.entries(env)) if (valor === undefined) delete process.env[chave];
  try {
    let resultado: typeof import('../../src/config/app.config').config | undefined;
    jest.isolateModules(() => {
      resultado = (require('../../src/config/app.config') as typeof import('../../src/config/app.config')).config;
    });
    return resultado!.webauthn;
  } finally {
    process.env = anterior;
  }
}

describe('config.webauthn', () => {
  it('derives the RP ID from the origin when it is not set', () => {
    const webauthn = carregar({ WEBAUTHN_RP_ID: undefined, WEBAUTHN_ORIGIN: 'https://app.authcore.dev' });

    expect(webauthn).toMatchObject({ rpId: 'app.authcore.dev', origin: 'https://app.authcore.dev' });
  });

  it('accepts an origin on a subdomain of the RP ID', () => {
    const webauthn = carregar({ WEBAUTHN_RP_ID: 'authcore.dev', WEBAUTHN_ORIGIN: 'https://app.authcore.dev' });

    expect(webauthn.rpId).toBe('authcore.dev');
  });

  it.each([
    ['another domain', 'https://authcore.dev.evil.example'],
    ['a suffix that is not a subdomain', 'https://notauthcore.dev'],
  ])('refuses to start with an origin on %s', (_caso, origin) => {
    expect(() => carregar({ WEBAUTHN_RP_ID: 'authcore.dev', WEBAUTHN_ORIGIN: origin })).toThrow(
      'WEBAUTHN_ORIGIN must be on WEBAUTHN_RP_ID',
    );
  });
});
