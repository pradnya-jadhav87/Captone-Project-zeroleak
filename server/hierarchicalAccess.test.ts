import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getDb, executeRun, executeQuery } from './db.ts';
import {
  initHierarchicalAccessSchema,
  canActorManageRole,
  getAuthorizingManagerRole,
  grantSubordinateAccess,
  revokeOrSuspendUserAccess,
  reassignSubordinatesToNewManager,
  listManagedUsers,
  requestPasswordReset,
  listPendingPasswordResetRequests,
  reviewPasswordResetRequest,
  executePasswordResetWithToken,
  type UserRole,
} from './hierarchicalAccessService.ts';
import { isAuthorizationActive } from './authority.ts';

describe('ZeroLeak Hierarchical Role Authorization, Access Revocation & Password-Reset Workflow Tests', () => {
  let db: any;
  const runId = Math.random().toString(36).substring(2, 8);
  const testOrgId = `ORG_TEST_${runId}`;

  const uniqueEmail = (prefix: string) => `${prefix}_${runId}@nbte.edu.in`;
  const uniqueUser = (prefix: string) => `${prefix}_${runId}`;

  const ownerUser = {
    id: `user-owner-${runId}`,
    name: 'Registrar & Institution Owner',
    role: 'ORG_OWNER' as UserRole,
    orgId: testOrgId,
  };

  const managerA = {
    id: `user-mgr-a-${runId}`,
    name: 'Exam Manager Alpha',
    role: 'EXAM_MANAGER' as UserRole,
    orgId: testOrgId,
  };

  const managerB = {
    id: `user-mgr-b-${runId}`,
    name: 'Exam Manager Beta',
    role: 'EXAM_MANAGER' as UserRole,
    orgId: testOrgId,
  };

  const auditorUser = {
    id: `user-auditor-${runId}`,
    name: 'Chief Vigilance Auditor',
    role: 'AUDITOR' as UserRole,
    orgId: testOrgId,
  };

  before(async () => {
    db = await getDb();
    initHierarchicalAccessSchema(db);

    const now = new Date().toISOString();
    // Seed initial users into users table
    executeRun(
      db,
      `INSERT OR REPLACE INTO users (id, org_id, email, username, password_hash, full_name, role, status, authorization_status, created_at)
       VALUES (?, ?, ?, ?, 'hash_owner', ?, 'ORG_OWNER', 'ACTIVE', 'AUTHORIZED', ?)`,
      [ownerUser.id, testOrgId, uniqueEmail('owner'), uniqueUser('owner'), ownerUser.name, now]
    );

    executeRun(
      db,
      `INSERT OR REPLACE INTO users (id, org_id, email, username, password_hash, full_name, role, status, authorization_status, authorized_by, created_at)
       VALUES (?, ?, ?, ?, 'hash_mgra', ?, 'EXAM_MANAGER', 'ACTIVE', 'AUTHORIZED', ?, ?)`,
      [managerA.id, testOrgId, uniqueEmail('mgr_a'), uniqueUser('mgr_a'), managerA.name, ownerUser.id, now]
    );

    executeRun(
      db,
      `INSERT OR REPLACE INTO users (id, org_id, email, username, password_hash, full_name, role, status, authorization_status, authorized_by, created_at)
       VALUES (?, ?, ?, ?, 'hash_mgrb', ?, 'EXAM_MANAGER', 'ACTIVE', 'AUTHORIZED', ?, ?)`,
      [managerB.id, testOrgId, uniqueEmail('mgr_b'), uniqueUser('mgr_b'), managerB.name, ownerUser.id, now]
    );

    executeRun(
      db,
      `INSERT OR REPLACE INTO users (id, org_id, email, username, password_hash, full_name, role, status, authorization_status, authorized_by, created_at)
       VALUES (?, ?, ?, ?, 'hash_auditor', ?, 'AUDITOR', 'ACTIVE', 'AUTHORIZED', ?, ?)`,
      [auditorUser.id, testOrgId, uniqueEmail('auditor'), uniqueUser('auditor'), auditorUser.name, ownerUser.id, now]
    );
  });

  // =========================================================================
  // 1. EXACT FIVE-ROLE HIERARCHY ENFORCEMENT & PRIVILEGE ESCALATION PREVENTION
  // =========================================================================
  describe('1. Exact Five-Role Hierarchy & Privilege Escalation Checks', () => {
    it('Hierarchy rules should permit Organization Owner to manage only Managers and Auditors', () => {
      assert.strictEqual(canActorManageRole('ORG_OWNER', 'EXAM_MANAGER'), true);
      assert.strictEqual(canActorManageRole('ORG_OWNER', 'AUDITOR'), true);
      assert.strictEqual(canActorManageRole('ORG_OWNER', 'ORG_OWNER'), false);
    });

    it('Hierarchy rules should permit Examination Manager to manage only Translators and Operators', () => {
      assert.strictEqual(canActorManageRole('EXAM_MANAGER', 'TRANSLATOR'), true);
      assert.strictEqual(canActorManageRole('EXAM_MANAGER', 'CENTRE_OPERATOR'), true);
      // Examination Manager cannot manage another Manager, Auditor, or Owner!
      assert.strictEqual(canActorManageRole('EXAM_MANAGER', 'EXAM_MANAGER'), false);
      assert.strictEqual(canActorManageRole('EXAM_MANAGER', 'AUDITOR'), false);
      assert.strictEqual(canActorManageRole('EXAM_MANAGER', 'ORG_OWNER'), false);
    });

    it('Auditor, Translator, and Centre Operator cannot manage any roles', () => {
      const lowerRoles: UserRole[] = ['AUDITOR', 'TRANSLATOR', 'CENTRE_OPERATOR'];
      const allRoles: UserRole[] = ['ORG_OWNER', 'EXAM_MANAGER', 'AUDITOR', 'TRANSLATOR', 'CENTRE_OPERATOR'];

      for (const actor of lowerRoles) {
        for (const target of allRoles) {
          assert.strictEqual(canActorManageRole(actor, target), false);
        }
      }
    });

    it('Should block Examination Manager attempting privilege escalation to grant another Manager or Auditor', async () => {
      const result = await grantSubordinateAccess(db, {
        actorId: managerA.id,
        actorName: managerA.name,
        actorRole: managerA.role,
        actorOrgId: testOrgId,
        targetEmail: uniqueEmail('rogue_mgr'),
        targetUsername: uniqueUser('rogue_mgr'),
        targetFullName: 'Rogue Manager Attempt',
        targetRole: 'EXAM_MANAGER', // Privilege escalation!
      });

      assert.strictEqual(result.success, false);
      assert.match(result.error || '', /ACCESS DENIED/);

      // Verify audit log captured the unauthorized attempt
      const auditRows = executeQuery(
        db,
        `SELECT * FROM audit_events WHERE event_type = 'UNAUTHORIZED_ROLE_ASSIGNMENT' AND user_id = ?`,
        [managerA.id]
      );
      assert.ok(auditRows && auditRows.length > 0, 'Must record unauthorized role assignment attempt in audit logs');
    });

    it('Should successfully allow Organization Owner to grant Examination Manager and Auditor', async () => {
      const resMgr = await grantSubordinateAccess(db, {
        actorId: ownerUser.id,
        actorName: ownerUser.name,
        actorRole: ownerUser.role,
        actorOrgId: testOrgId,
        targetEmail: uniqueEmail('new_mgr'),
        targetUsername: uniqueUser('new_mgr'),
        targetFullName: 'New Authorized Exam Manager',
        targetRole: 'EXAM_MANAGER',
      });
      assert.strictEqual(resMgr.success, true);
      assert.ok(resMgr.user);
      assert.strictEqual(resMgr.user.role, 'EXAM_MANAGER');
      assert.strictEqual(resMgr.user.authorizedBy, ownerUser.id);
    });

    it('Should successfully allow Examination Manager to grant Translator and Centre Operator with manager binding', async () => {
      const resTranslator = await grantSubordinateAccess(db, {
        actorId: managerA.id,
        actorName: managerA.name,
        actorRole: managerA.role,
        actorOrgId: testOrgId,
        targetEmail: uniqueEmail('trans_1'),
        targetUsername: uniqueUser('trans_1'),
        targetFullName: 'Linguistic Translator One',
        targetRole: 'TRANSLATOR',
        scope: 'Hindi, Tamil',
      });
      assert.strictEqual(resTranslator.success, true);
      assert.ok(resTranslator.user);
      assert.strictEqual(resTranslator.user.role, 'TRANSLATOR');

      // Verify active user_manager_assignments entry
      const assignments = executeQuery(
        db,
        'SELECT * FROM user_manager_assignments WHERE user_id = ? AND manager_id = ?',
        [resTranslator.user.id, managerA.id]
      );
      assert.strictEqual(assignments.length, 1, 'Subordinate must be bound to authorizing manager');
    });
  });

  // =========================================================================
  // 2. DIRECT SUBORDINATE MANAGEMENT & MANAGER ISOLATION
  // =========================================================================
  describe('2. Direct Subordinate Management & Scope Isolation', () => {
    let subUnderA: string;
    let subUnderB: string;

    before(async () => {
      // Create operator under Manager A
      const resA = await grantSubordinateAccess(db, {
        actorId: managerA.id,
        actorName: managerA.name,
        actorRole: managerA.role,
        actorOrgId: testOrgId,
        targetEmail: uniqueEmail('op_a'),
        targetUsername: uniqueUser('op_a'),
        targetFullName: 'Operator Under Alpha',
        targetRole: 'CENTRE_OPERATOR',
        centreId: 'CENTRE-101',
      });
      subUnderA = resA.user!.id;

      // Create operator under Manager B
      const resB = await grantSubordinateAccess(db, {
        actorId: managerB.id,
        actorName: managerB.name,
        actorRole: managerB.role,
        actorOrgId: testOrgId,
        targetEmail: uniqueEmail('op_b'),
        targetUsername: uniqueUser('op_b'),
        targetFullName: 'Operator Under Beta',
        targetRole: 'CENTRE_OPERATOR',
        centreId: 'CENTRE-102',
      });
      subUnderB = resB.user!.id;
    });

    it('Examination Manager A cannot revoke subordinates assigned to Manager B', () => {
      const res = revokeOrSuspendUserAccess(db, {
        actorId: managerA.id,
        actorName: managerA.name,
        actorRole: managerA.role,
        targetUserId: subUnderB, // Under Manager B!
        action: 'REVOKE',
        reason: 'Unauthorized attempt across manager boundaries',
      });

      assert.strictEqual(res.success, false);
      assert.match(res.error || '', /ACCESS DENIED/);
    });

    it('Examination Manager can successfully suspend their own subordinate', () => {
      const res = revokeOrSuspendUserAccess(db, {
        actorId: managerA.id,
        actorName: managerA.name,
        actorRole: managerA.role,
        targetUserId: subUnderA,
        action: 'SUSPEND',
        reason: 'Temporary audit investigation',
      });

      assert.strictEqual(res.success, true);
      const userRows = executeQuery(db, 'SELECT status, authorization_status FROM users WHERE id = ?', [subUnderA]);
      assert.strictEqual(userRows[0].status, 'SUSPENDED');
      assert.strictEqual(userRows[0].authorization_status, 'SUSPENDED');
    });

    it('listManagedUsers filters users strictly to the manager hierarchy', () => {
      const managedByA = listManagedUsers(db, {
        actorId: managerA.id,
        actorRole: managerA.role,
      });

      // Manager A should only see their subordinates, not Manager B's
      const hasSubUnderB = managedByA.some((u) => u.id === subUnderB);
      assert.strictEqual(hasSubUnderB, false, 'Manager A must not see Manager B subordinates');

      // Owner sees all organization staff
      const managedByOwner = listManagedUsers(db, {
        actorId: ownerUser.id,
        actorRole: ownerUser.role,
      });
      assert.ok(managedByOwner.length >= managedByA.length);
    });
  });

  // =========================================================================
  // 3. ACCESS REVOCATION, SESSION TERMINATION & CASCADING PROTECTION
  // =========================================================================
  describe('3. Access Revocation & Cascading Protection', () => {
    let testManagerId: string;
    let subordinateOpId: string;

    before(async () => {
      // Create a manager and a subordinate
      const resM = await grantSubordinateAccess(db, {
        actorId: ownerUser.id,
        actorName: ownerUser.name,
        actorRole: ownerUser.role,
        actorOrgId: testOrgId,
        targetEmail: uniqueEmail('dept_mgr'),
        targetUsername: uniqueUser('dept_mgr'),
        targetFullName: 'Departing Manager',
        targetRole: 'EXAM_MANAGER',
      });
      testManagerId = resM.user!.id;

      const resSub = await grantSubordinateAccess(db, {
        actorId: testManagerId,
        actorName: 'Departing Manager',
        actorRole: 'EXAM_MANAGER',
        actorOrgId: testOrgId,
        targetEmail: uniqueEmail('dept_sub'),
        targetUsername: uniqueUser('dept_sub'),
        targetFullName: 'Subordinate of Departing Manager',
        targetRole: 'CENTRE_OPERATOR',
      });
      subordinateOpId = resSub.user!.id;

      // Seed an active session for the manager and subordinate
      const now = new Date().toISOString();
      executeRun(
        db,
        `INSERT OR REPLACE INTO user_sessions (id, user_id, device_id, token_hash, status, created_at, last_active_at)
         VALUES (?, ?, 'dev-1', 'hash1', 'ACTIVE', ?, ?)`,
        [`sess-dept-mgr-${runId}`, testManagerId, now, now]
      );
      executeRun(
        db,
        `INSERT OR REPLACE INTO user_sessions (id, user_id, device_id, token_hash, status, created_at, last_active_at)
         VALUES (?, ?, 'dev-2', 'hash2', 'ACTIVE', ?, ?)`,
        [`sess-dept-sub-${runId}`, subordinateOpId, now, now]
      );
    });

    it('Revoking a manager invalidates their active sessions immediately', () => {
      const res = revokeOrSuspendUserAccess(db, {
        actorId: ownerUser.id,
        actorName: ownerUser.name,
        actorRole: ownerUser.role,
        targetUserId: testManagerId,
        action: 'REVOKE',
        reason: 'Departure from institution',
      });

      assert.strictEqual(res.success, true);

      // Verify sessions revoked
      const sess = executeQuery(db, 'SELECT status FROM user_sessions WHERE id = ?', [`sess-dept-mgr-${runId}`]);
      assert.strictEqual(sess[0].status, 'REVOKED');

      // Verify live RBAC check immediately rejects this user
      const user = executeQuery(db, 'SELECT * FROM users WHERE id = ?', [testManagerId])[0];
      assert.strictEqual(isAuthorizationActive(user), false);
    });

    it('Revoking an Examination Manager automatically suspends all assigned subordinates (cascading protection)', () => {
      // Subordinate of departing manager should now be suspended!
      const sub = executeQuery(db, 'SELECT status, authorization_status FROM users WHERE id = ?', [subordinateOpId])[0];
      assert.strictEqual(sub.status, 'SUSPENDED');
      assert.ok(sub.authorization_status.startsWith('SUSPENDED'));
      assert.strictEqual(isAuthorizationActive(sub), false);

      // Subordinate sessions revoked
      const subSess = executeQuery(db, 'SELECT status FROM user_sessions WHERE id = ?', [`sess-dept-sub-${runId}`]);
      assert.strictEqual(subSess[0].status, 'REVOKED');
    });

    it('Organization Owner can reassign orphaned subordinates to a new active manager, restoring access', () => {
      const res = reassignSubordinatesToNewManager(db, {
        ownerId: ownerUser.id,
        ownerRole: ownerUser.role,
        previousManagerId: testManagerId,
        newManagerId: managerA.id,
      });

      assert.strictEqual(res.success, true);
      assert.ok((res.reassignedCount || 0) >= 1);

      // Subordinate should now be ACTIVE and bound to managerA
      const sub = executeQuery(db, 'SELECT status, authorization_status, authorized_by FROM users WHERE id = ?', [subordinateOpId])[0];
      assert.strictEqual(sub.status, 'ACTIVE');
      assert.strictEqual(sub.authorization_status, 'AUTHORIZED');
      assert.strictEqual(sub.authorized_by, managerA.id);
      assert.strictEqual(isAuthorizationActive(sub), true);
    });
  });

  // =========================================================================
  // 4. LOWER-ROLE PASSWORD RESET REQUEST ROUTING
  // =========================================================================
  describe('4. Password Reset Request Routing According to Strict Hierarchy', () => {
    let testTranslatorId: string;

    before(async () => {
      const res = await grantSubordinateAccess(db, {
        actorId: managerA.id,
        actorName: managerA.name,
        actorRole: managerA.role,
        actorOrgId: testOrgId,
        targetEmail: uniqueEmail('trans_reset'),
        targetUsername: uniqueUser('trans_reset'),
        targetFullName: 'Translator Reset Test',
        targetRole: 'TRANSLATOR',
      });
      testTranslatorId = res.user!.id;
    });

    it('Determining authorizing manager routes Translator & Operator to Examination Manager', () => {
      assert.strictEqual(getAuthorizingManagerRole('TRANSLATOR'), 'EXAM_MANAGER');
      assert.strictEqual(getAuthorizingManagerRole('CENTRE_OPERATOR'), 'EXAM_MANAGER');
    });

    it('Determining authorizing manager routes Examination Manager & Auditor to Organization Owner', () => {
      assert.strictEqual(getAuthorizingManagerRole('EXAM_MANAGER'), 'ORG_OWNER');
      assert.strictEqual(getAuthorizingManagerRole('AUDITOR'), 'ORG_OWNER');
    });

    it('Organization Owner cannot request reset from a higher manager (is apex authority)', () => {
      assert.throws(() => {
        getAuthorizingManagerRole('ORG_OWNER');
      }, /Organization Owner is the apex authority/);
    });

    it('Subordinate Translator submitting reset request routes strictly to assigned Examination Manager', () => {
      const res = requestPasswordReset(db, {
        userId: testTranslatorId,
        reason: 'Credentials suspected disclosed on shared terminal',
      });

      assert.strictEqual(res.success, true);
      assert.ok(res.request);
      assert.strictEqual(res.request.authorizingManagerId, managerA.id);
      assert.strictEqual(res.request.authorizingManagerRole, 'EXAM_MANAGER');
      assert.strictEqual(res.request.status, 'PENDING');

      // User status updated to indicate reset pending
      const user = executeQuery(db, 'SELECT status FROM users WHERE id = ?', [testTranslatorId])[0];
      assert.strictEqual(user.status, 'PASSWORD_RESET_PENDING');
    });

    it('Duplicate pending reset requests for the same user are rejected', () => {
      const res = requestPasswordReset(db, {
        userId: testTranslatorId,
        reason: 'Second redundant attempt',
      });

      assert.strictEqual(res.success, false);
      assert.match(res.error || '', /already have a pending/);
    });

    it('Examination Manager submitting reset request routes strictly to Organization Owner', () => {
      const res = requestPasswordReset(db, {
        userId: managerB.id,
        reason: 'Forgot workstation key',
      });

      assert.strictEqual(res.success, true);
      assert.ok(res.request);
      assert.strictEqual(res.request.authorizingManagerRole, 'ORG_OWNER');
    });
  });

  // =========================================================================
  // 5. MANAGER REVIEW & CRYPTOGRAPHIC TOKEN GENERATION
  // =========================================================================
  describe('5. Manager Review, Decision & Cryptographic Token Generation', () => {
    let pendingReqId: string;
    let requesterId: string;

    before(async () => {
      // Create user under manager A and request reset
      const uRes = await grantSubordinateAccess(db, {
        actorId: managerA.id,
        actorName: managerA.name,
        actorRole: managerA.role,
        actorOrgId: testOrgId,
        targetEmail: uniqueEmail('op_review'),
        targetUsername: uniqueUser('op_review'),
        targetFullName: 'Operator Review Test',
        targetRole: 'CENTRE_OPERATOR',
      });
      requesterId = uRes.user!.id;

      const pRes = requestPasswordReset(db, {
        userId: requesterId,
        reason: 'Key rotation requested',
      });
      pendingReqId = pRes.request!.id;
    });

    it('Prevents self-approval of password reset requests', () => {
      const res = reviewPasswordResetRequest(db, {
        requestId: pendingReqId,
        actorId: requesterId, // Self!
        actorName: 'Operator Review Test',
        actorRole: 'CENTRE_OPERATOR',
        decision: 'APPROVE',
      });

      assert.strictEqual(res.success, false);
      assert.match(res.error || '', /cannot approve their own/);
    });

    it('Prevents an unauthorized manager from reviewing a reset request outside their hierarchy', () => {
      const res = reviewPasswordResetRequest(db, {
        requestId: pendingReqId,
        actorId: managerB.id, // Manager B is not the assigned manager!
        actorName: managerB.name,
        actorRole: managerB.role,
        decision: 'APPROVE',
      });

      assert.strictEqual(res.success, false);
      assert.match(res.error || '', /ACCESS DENIED/);
    });

    it('Authorizing manager approval generates a secure single-use 15-minute token, never exposing plaintext password', () => {
      const res = reviewPasswordResetRequest(db, {
        requestId: pendingReqId,
        actorId: managerA.id,
        actorName: managerA.name,
        actorRole: managerA.role,
        decision: 'APPROVE',
        reason: 'Identity verified via official intercom',
      });

      assert.strictEqual(res.success, true);
      assert.ok(res.resetToken, 'Must generate one-time reset token');
      assert.strictEqual(res.resetToken.length, 64, 'Token must be 32-byte hex (64 chars)');

      // Verify token in database is hashed (SHA-256), NOT plaintext
      const reqRow = executeQuery(db, 'SELECT * FROM password_reset_requests WHERE id = ?', [pendingReqId])[0];
      assert.strictEqual(reqRow.status, 'RESET_LINK_ISSUED');
      assert.notStrictEqual(reqRow.token_hash, res.resetToken, 'Database must store token hash, not raw token');
      const expectedHash = crypto.createHash('sha256').update(res.resetToken).digest('hex');
      assert.strictEqual(reqRow.token_hash, expectedHash);

      // Verify expiration is within 15 minutes
      const expiresAt = new Date(reqRow.token_expires_at).getTime();
      const issuedAt = new Date(reqRow.token_issued_at).getTime();
      assert.ok(expiresAt - issuedAt <= 15 * 60 * 1000 + 1000);
    });
  });

  // =========================================================================
  // 6. TOKEN CONSUMPTION, PASSWORD UPDATE & REVOCATION IMMUNITY
  // =========================================================================
  describe('6. Token Consumption, Credential Update & Revocation Immunity', () => {
    let rawToken: string;
    let userId: string;

    before(async () => {
      const uRes = await grantSubordinateAccess(db, {
        actorId: managerA.id,
        actorName: managerA.name,
        actorRole: managerA.role,
        actorOrgId: testOrgId,
        targetEmail: uniqueEmail('trans_token'),
        targetUsername: uniqueUser('trans_token'),
        targetFullName: 'Translator Token Execution',
        targetRole: 'TRANSLATOR',
      });
      userId = uRes.user!.id;

      const pRes = requestPasswordReset(db, {
        userId,
        reason: 'Routine quarterly password rotation',
      });

      const revRes = reviewPasswordResetRequest(db, {
        requestId: pRes.request!.id,
        actorId: managerA.id,
        actorName: managerA.name,
        actorRole: managerA.role,
        decision: 'APPROVE',
      });
      rawToken = revRes.resetToken!;
    });

    it('Executing password reset with valid token updates password hash and restores user status', async () => {
      const newPassword = 'SecureNewPassword2026!';
      const res = await executePasswordResetWithToken(db, {
        token: rawToken,
        newPassword,
      });

      assert.strictEqual(res.success, true);

      // Verify user password hash was updated
      const user = executeQuery(db, 'SELECT password_hash, status FROM users WHERE id = ?', [userId])[0];
      assert.strictEqual(user.status, 'ACTIVE');
      const isMatch = await bcrypt.compare(newPassword, user.password_hash);
      assert.strictEqual(isMatch, true, 'bcrypt must match the new password');
    });

    it('Reusing an already-consumed single-use token is rejected', async () => {
      const res = await executePasswordResetWithToken(db, {
        token: rawToken,
        newPassword: 'AnotherPassword123!',
      });

      assert.strictEqual(res.success, false);
      assert.match(res.error || '', /Invalid or already consumed/);
    });

    it('CRITICAL RULE: Password reset cannot reactivate a REVOKED or SUSPENDED account', async () => {
      // 1. Create a user
      const uRes = await grantSubordinateAccess(db, {
        actorId: managerA.id,
        actorName: managerA.name,
        actorRole: managerA.role,
        actorOrgId: testOrgId,
        targetEmail: uniqueEmail('revoked_target'),
        targetUsername: uniqueUser('revoked_target'),
        targetFullName: 'Revoked User Security Test',
        targetRole: 'TRANSLATOR',
      });
      const targetId = uRes.user!.id;

      // 2. Request and approve reset token
      const pRes = requestPasswordReset(db, {
        userId: targetId,
        reason: 'Token generated prior to revocation',
      });
      const revRes = reviewPasswordResetRequest(db, {
        requestId: pRes.request!.id,
        actorId: managerA.id,
        actorName: managerA.name,
        actorRole: managerA.role,
        decision: 'APPROVE',
      });
      const token = revRes.resetToken!;

      // 3. User access is REVOKED by manager!
      revokeOrSuspendUserAccess(db, {
        actorId: managerA.id,
        actorName: managerA.name,
        actorRole: managerA.role,
        targetUserId: targetId,
        action: 'REVOKE',
        reason: 'Security violation',
      });

      // 4. Attempt to execute password reset with the token
      const res = await executePasswordResetWithToken(db, {
        token,
        newPassword: 'AttemptedBypassPassword123!',
      });

      assert.strictEqual(res.success, false);
      assert.match(res.error || '', /Password reset cannot reactivate revoked authorization/);

      // Verify user remains REVOKED
      const user = executeQuery(db, 'SELECT status, authorization_status FROM users WHERE id = ?', [targetId])[0];
      assert.strictEqual(user.status, 'REVOKED');
      assert.strictEqual(user.authorization_status, 'REVOKED');
    });
  });

  // =========================================================================
  // 7. COMPREHENSIVE SECURITY AUDIT LOGGING
  // =========================================================================
  describe('7. Comprehensive Security Audit Trail', () => {
    it('Audit trail captures role grants, revocations, and password reset approvals', () => {
      const grantAudits = executeQuery(
        db,
        `SELECT * FROM audit_events WHERE event_type IN ('AUTHORITY_GRANTED', 'ROLE_GRANTED') AND org_id = ?`,
        [testOrgId]
      );
      assert.ok(grantAudits.length > 0, 'Must record AUTHORITY_GRANTED audit events');

      const revokeAudits = executeQuery(
        db,
        `SELECT * FROM audit_events WHERE event_type = 'AUTHORITY_REVOKED' AND org_id = ?`,
        [testOrgId]
      );
      assert.ok(revokeAudits.length > 0, 'Must record AUTHORITY_REVOKED audit events');

      const resetAudits = executeQuery(
        db,
        `SELECT * FROM audit_events WHERE event_type = 'PASSWORD_RESET_APPROVED'`
      );
      assert.ok(resetAudits.length > 0, 'Must record PASSWORD_RESET_APPROVED audit events');

      // Verify audit logs NEVER contain plaintext reset tokens or passwords
      for (const a of resetAudits) {
        const details = a.details_json || '';
        assert.doesNotMatch(details, /"resetToken":/);
        assert.doesNotMatch(details, /"newPassword":/);
      }
    });
  });
});
