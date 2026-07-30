import { jwtVerify } from 'jose';

export async function verifyAuth(token, jwtSecret) {
  if (!token) {
    return { authenticated: false, error: 'Token no proporcionado' };
  }

  try {
    const secret = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(token, secret);

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
