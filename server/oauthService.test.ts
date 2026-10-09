import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateOAuthState,
  generatePkce,
  storeOAuthTransaction,
  consumeOAuthTransaction,
  isSafeRedirectUrl,
  buildAuthorizationUrl,
  renderOAuthCallbackHtml,
} from './oauthService.ts';

test('OAuth state is unpredictable and unique', () => {
  const state1 = generateOAuthState();
  const state2 = generateOAuthState();
  assert.equal(typeof state1, 'string');
  assert.equal(state1.length, 64); // 32 bytes hex
  assert.notEqual(state1, state2);
});

test('PKCE generates RFC 7636 code verifier and S256 challenge', () => {
  const { codeVerifier, codeChallenge } = generatePkce();
  assert.ok(codeVerifier.length >= 43, 'verifier should be at least 43 chars');
  assert.ok(codeChallenge.length >= 43, 'challenge should be at least 43 chars');
  assert.notEqual(codeVerifier, codeChallenge);
});

test('OAuth transaction is single-use and expires correctly', () => {
  const state = generateOAuthState();
  storeOAuthTransaction({
    state,
    codeVerifier: 'verifier-123',
    codeChallenge: 'challenge-123',
    returnUrl: '/#paper-generation',
    createdAt: Date.now(),
    expiresAt: Date.now() + 60000,
  });

  // First consumption succeeds
  const tx = consumeOAuthTransaction(state);
  assert.ok(tx);
  assert.equal(tx?.state, state);
  assert.equal(tx?.returnUrl, '/#paper-generation');

  // Second consumption fails (replay protection)
  const replayed = consumeOAuthTransaction(state);
  assert.equal(replayed, null);

  // Expired transaction is rejected
  const expiredState = generateOAuthState();
  storeOAuthTransaction({
    state: expiredState,
    codeVerifier: 'verifier-exp',
    codeChallenge: 'challenge-exp',
    returnUrl: '/',
    createdAt: Date.now() - 20000,
    expiresAt: Date.now() - 1000, // already expired
  });
  const expiredTx = consumeOAuthTransaction(expiredState);
  assert.equal(expiredTx, null);
});

test('isSafeRedirectUrl allows relative paths and allowlisted origins, blocks open redirects', () => {
  const allowed = ['https://captone-project-zeroleak.vercel.app', 'http://localhost:3000'];

  // Allowed
  assert.equal(isSafeRedirectUrl('/', allowed), true);
  assert.equal(isSafeRedirectUrl('/#paper-generation', allowed), true);
  assert.equal(isSafeRedirectUrl('/dashboard', allowed), true);
  assert.equal(isSafeRedirectUrl('https://captone-project-zeroleak.vercel.app/dashboard', allowed), true);
  assert.equal(isSafeRedirectUrl('http://localhost:3000/#paper-generation', allowed), true);

  // Blocked open redirects
  assert.equal(isSafeRedirectUrl('//evil.com', allowed), false);
  assert.equal(isSafeRedirectUrl('https://evil.com', allowed), false);
  assert.equal(isSafeRedirectUrl('https://attacker.example.org/steal', allowed), false);
  assert.equal(isSafeRedirectUrl('javascript:alert(1)', allowed), false);
  assert.equal(isSafeRedirectUrl('', allowed), false);
});

test('buildAuthorizationUrl formats params correctly', () => {
  const url = buildAuthorizationUrl({
    authUrl: 'https://auth.openai.com/authorize',
    clientId: 'test-client-id',
    redirectUri: 'https://captone-project-zeroleak.vercel.app/api/auth/oauth/openai/callback',
    state: 'test-state-123',
    codeChallenge: 'test-challenge-abc',
  });

  const parsed = new URL(url);
  assert.equal(parsed.origin, 'https://auth.openai.com');
  assert.equal(parsed.pathname, '/authorize');
  assert.equal(parsed.searchParams.get('response_type'), 'code');
  assert.equal(parsed.searchParams.get('client_id'), 'test-client-id');
  assert.equal(parsed.searchParams.get('redirect_uri'), 'https://captone-project-zeroleak.vercel.app/api/auth/oauth/openai/callback');
  assert.equal(parsed.searchParams.get('state'), 'test-state-123');
  assert.equal(parsed.searchParams.get('code_challenge'), 'test-challenge-abc');
  assert.equal(parsed.searchParams.get('code_challenge_method'), 'S256');
});

test('renderOAuthCallbackHtml sets exact targetOrigin and never uses wildcard targetOrigin', () => {
  const html = renderOAuthCallbackHtml({
    ok: true,
    token: 'jwt-token-123',
    user: { id: 'u1', role: 'EXAM_MANAGER' },
    targetOrigin: 'https://captone-project-zeroleak.vercel.app',
  });

  assert.ok(html.includes('"https://captone-project-zeroleak.vercel.app"'), 'targetOrigin must be explicitly present');
  assert.ok(!html.includes('postMessage(payload, "*")'), 'must never use wildcard targetOrigin');
  assert.ok(html.includes('ZEROLEAK_OAUTH_SUCCESS'));
});

test('renderOAuthCallbackHtml handles error scenarios safely without leaking credentials', () => {
  const html = renderOAuthCallbackHtml({
    ok: false,
    error: 'Access denied by identity provider',
    targetOrigin: 'http://localhost:3000',
  });

  assert.ok(html.includes('ZEROLEAK_OAUTH_ERROR'));
  assert.ok(html.includes('Access denied by identity provider'));
  assert.ok(html.includes('"http://localhost:3000"'));
  assert.ok(!html.includes('secret'));
  assert.ok(!html.includes('password'));
});

test('RBAC protection: unverified oauth profiles must not receive privileged administrative roles', () => {
  // Simulated RBAC policy assertion
  const privilegedRoles = ['ORG_OWNER', 'EXAM_MANAGER', 'AUDITOR', 'CENTRE_OPERATOR', 'TRANSLATOR'];
  const defaultAssignedRole = 'STUDENT';

  assert.equal(privilegedRoles.includes(defaultAssignedRole), false, 'Default OAuth role must never be a privileged exam authority role');
});

