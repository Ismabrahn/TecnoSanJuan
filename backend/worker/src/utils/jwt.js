import { createRemoteJWKSet, jwtVerify } from 'jose';

let JWKS = null;

function getJWKS(supabaseUrl) {
  if (!JWKS) {
    const jwksUrl = new URL('/auth/v1/.well-known/jwks.json', supabaseUrl);
    JWKS = createRemoteJWKSet(jwksUrl);
  }
  return JWKS;
}

export async function verifyAuth(token, supabaseUrl) {
  if (!token) {
    return { authenticated: false, error: 'Token no proporcionado' };
  }

  try {
    const JWKS = getJWKS(supabaseUrl);
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: supabaseUrl.replace(/\/$/, '') + '/auth/v1',
      audience: 'authenticated',
    });

    return {
      authenticated: true,
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  } catch (err) {
    return { authenticated: false, error: 'Token inválido o expirado' };
  }
}
