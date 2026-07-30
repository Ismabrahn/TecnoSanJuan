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
    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL no está configurado');
    }

    const JWKS = getJWKS(supabaseUrl);
    
    // Validamos usando las claves públicas (JWKS). Al provenir del JWKS de nuestra instancia,
    // la firma criptográfica garantiza que fue emitido por nuestro Supabase.
    const { payload } = await jwtVerify(token, JWKS, {
      audience: 'authenticated'
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
