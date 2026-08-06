import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { config, googleConfigured } from '../config.js';
import { User } from '../models/user.model.js';
import { setSessionCookie, signToken } from '../middleware/auth.js';

/**
 * Login con Google usando las credenciales que inyecta acmsy (useAcmsyAuth).
 * Las rutas van en la RAÍZ (no bajo /api) porque la URL de retorno registrada
 * en Google es https://<sub>.acmsy.com/auth/google/callback.
 */
export const googleRouter = Router();

/** URL de retorno EXACTA registrada en Google (por acmsy). */
function redirectUri(): string {
  return `${config.origin}/auth/google/callback`;
}

/** Paso 1: manda al usuario al consentimiento de Google. */
googleRouter.get('/auth/google', (_req, res) => {
  if (!googleConfigured()) {
    res.redirect(`${config.appUrl}/login?google=unavailable`);
    return;
  }
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    include_granted_scopes: 'true',
    prompt: 'select_account'
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

/** Paso 2: Google vuelve con un código; lo canjeamos y creamos/entramos. */
googleRouter.get('/auth/google/callback', async (req, res) => {
  const code = String(req.query.code ?? '');
  if (!code || !googleConfigured()) {
    res.redirect(`${config.appUrl}/login?google=error`);
    return;
  }
  try {
    // Canjea el código por tokens.
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        redirect_uri: redirectUri(),
        grant_type: 'authorization_code'
      })
    });
    const tok = (await tokenRes.json()) as { access_token?: string };
    if (!tok.access_token) throw new Error('sin access_token');

    // Datos básicos del perfil.
    const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tok.access_token}` }
    });
    const profile = (await infoRes.json()) as { email?: string; name?: string };
    const email = String(profile.email ?? '').toLowerCase().trim();
    if (!email) throw new Error('sin email');

    // Crea la cuenta si no existe (contraseña aleatoria: solo entra por Google).
    let user = await User.findOne({ email });
    if (!user) {
      const passwordHash = await bcrypt.hash(crypto.randomUUID(), 10);
      user = await User.create({
        name: (profile.name ?? '').trim() || email.split('@')[0],
        email,
        passwordHash
      });
    }

    // Deja la sesión en una cookie httpOnly y entra directo a la app
    // (el token nunca viaja en la URL ni queda accesible desde JS).
    setSessionCookie(res, signToken(user.id));
    res.redirect(`${config.appUrl}/`);
  } catch (err) {
    console.error('[auth/google/callback]', err);
    res.redirect(`${config.appUrl}/login?google=error`);
  }
});
