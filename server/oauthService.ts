import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

/**
 * ZeroLeak OAuth Service
 *
 * Implements standard OAuth 2.0 / OpenID Connect authorization code flow with PKCE (RFC 7636).
 * Ensures end-to-end security:
 *  - Cryptographically unpredictable state validation to eliminate CSRF / OAuth hijacking
 *  - PKCE with S256 code challenge
 *  - Fixed, verified targetOrigin for postMessage popup completion (never '*')
 *  - Open redirect prevention using strict destination allowlisting
 *  - Server-side token exchange & role preservation
 */

export interface OAuthTransaction {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
  returnUrl: string;
  createdAt: number;
  expiresAt: number;
}

export interface OAuthUserProfile {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  emailVerified?: boolean;
}

const oauthTransactions = new Map<string, OAuthTransaction>();
const TRANSACTION_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Generate a cryptographically secure random state parameter (32 bytes hex).
 */
export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate PKCE code verifier and code challenge using SHA-256 (RFC 7636).
 */
export function generatePkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

/**
 * Store an initiated OAuth transaction with expiration.
 */
export function storeOAuthTransaction(transaction: OAuthTransaction): void {
  const now = Date.now();
  for (const [state, tx] of oauthTransactions.entries()) {
    if (tx.expiresAt <= now) {
      oauthTransactions.delete(state);
    }
  }
  oauthTransactions.set(transaction.state, transaction);
}

/**
 * Retrieve and immediately consume an OAuth transaction (single-use to prevent replay).
 */
export function consumeOAuthTransaction(state: string): OAuthTransaction | null {
  if (!state || typeof state !== 'string') return null;
  const tx = oauthTransactions.get(state);
  if (!tx) return null;
  oauthTransactions.delete(state);
  if (Date.now() > tx.expiresAt) return null;
  return tx;
}

/**
 * Check whether a redirect destination is safe (relative path or allowlisted origin).
 */
export function isSafeRedirectUrl(url: string, allowedOrigins: string[]): boolean {
  if (!url || typeof url !== 'string') return false;
  // Relative internal paths (e.g. / or /#paper-generation)
  if (url.startsWith('/') && !url.startsWith('//') && !url.includes('\\')) {
    return true;
  }
  try {
    const parsed = new URL(url);
    return allowedOrigins.some((origin) => parsed.origin.toLowerCase() === origin.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Retrieve OAuth provider configuration from environment variables.
 */
export function getOAuthConfig() {
  const clientId = process.env.OPENAI_CLIENT_ID || process.env.OAUTH_CLIENT_ID || '';
  const clientSecret = process.env.OPENAI_CLIENT_SECRET || process.env.OAUTH_CLIENT_SECRET || '';
  const authUrl = process.env.OPENAI_AUTH_URL || 'https://auth.openai.com/authorize';
  const tokenUrl = process.env.OPENAI_TOKEN_URL || 'https://auth.openai.com/oauth/token';
  const userinfoUrl = process.env.OPENAI_USERINFO_URL || 'https://auth.openai.com/userinfo';
  return { clientId, clientSecret, authUrl, tokenUrl, userinfoUrl };
}

/**
 * Construct the provider authorization URL.
 */
export function buildAuthorizationUrl(params: {
  authUrl: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scope?: string;
}): string {
  const url = new URL(params.authUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('scope', params.scope || 'openid profile email');
  return url.toString();
}

/**
 * Render secure HTML to return authentication result to window.opener with strict targetOrigin.
 */
export function renderOAuthCallbackHtml(params: {
  ok: boolean;
  token?: string;
  user?: any;
  error?: string;
  targetOrigin: string;
  returnUrl?: string;
}): string {
  const safeOrigin = JSON.stringify(params.targetOrigin);
  const safePayload = JSON.stringify({
    type: params.ok ? 'ZEROLEAK_OAUTH_SUCCESS' : 'ZEROLEAK_OAUTH_ERROR',
    token: params.token || null,
    user: params.user || null,
    error: params.error || null,
  });
  const safeReturnUrl = JSON.stringify(params.returnUrl || '/');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ZeroLeak Authentication</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0b0f17; color: #f1f5f9; }
    .card { background: #131c2e; border: 1px solid #1e293b; border-radius: 16px; padding: 32px; max-width: 400px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .spinner { width: 36px; height: 36px; border: 3px solid #10b981; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    h2 { font-size: 18px; margin: 0 0 8px; color: #fff; }
    p { font-size: 13px; color: #94a3b8; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h2>${params.ok ? 'Authentication Complete' : 'Authentication Notice'}</h2>
    <p>${params.ok ? 'Returning to ZeroLeak enclave...' : (params.error || 'Unable to complete login.')}</p>
  </div>
  <script>
    (function() {
      var payload = ${safePayload};
      var targetOrigin = ${safeOrigin};
      var returnUrl = ${safeReturnUrl};
      if (window.opener && !window.opener.closed) {
        try {
          window.opener.postMessage(payload, targetOrigin);
          setTimeout(function() { window.close(); }, 500);
          return;
        } catch (e) {
          console.error('[ZeroLeak OAuth] postMessage dispatch failed:', e);
        }
      }
      if (payload.type === 'ZEROLEAK_OAUTH_SUCCESS') {
        window.location.href = returnUrl;
      }
    })();
  </script>
</body>
</html>`;
}

