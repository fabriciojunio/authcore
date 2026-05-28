declare module 'speakeasy' {
  interface TOTPVerifyOptions {
    secret: string;
    encoding: 'base32' | 'ascii' | 'hex';
    token: string;
    window?: number;
  }

  interface TOTPGenerateOptions {
    secret: string;
    encoding: 'base32' | 'ascii' | 'hex';
    digits?: number;
    step?: number;
  }

  interface SecretOptions {
    length?: number;
    name?: string;
    issuer?: string;
  }

  interface SecretResult {
    ascii: string;
    hex: string;
    base32: string;
    otpauth_url?: string;
  }

  interface Speakeasy {
    totp: {
      verify(options: TOTPVerifyOptions): boolean;
      generate(options: TOTPGenerateOptions): string;
    };
    generateSecret(options?: SecretOptions): SecretResult;
  }

  const speakeasy: Speakeasy;
  export = speakeasy;
}
