import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { executeQuery, executeRun, saveDb } from './db.ts';

export type UserRole =
  | 'ORG_OWNER'
  | 'EXAM_MANAGER'
  | 'TRANSLATOR'
  | 'CENTRE_OPERATOR'
  | 'AUDITOR';

export type UserAccountStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'REVOKED'
  | 'PASSWORD_RESET_PENDING';

export type PasswordResetStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'RESET_LINK_ISSUED'
  | 'COMPLETED'
  | 'EXPIRED'
  | 'CANCELLED';

export interface ManagedUserRecord {
  id: string;
  orgId: string;
  email: string;
  username: string;
  fullName: string;
  role: UserRole;
  status: UserAccountStatus;
  authorizationStatus: string;
  authorizedBy?: string;
  authorizedByName?: string;
  authorizedAt?: string;
  centreId?: string;
  scope?: string;
  createdAt: string;
  lastLoginAt?: string;
}

export interface PasswordResetRequestRecord {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: UserRole;
  authorizingManagerId: string;
  authorizingManagerRole: UserRole;
  status: PasswordResetStatus;
  requestReason: string;
  decisionReason?: string;
  reviewedById?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  tokenHash?: string;
  tokenIssuedAt?: string;
  tokenExpiresAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ==============================================================================
// 1. HIERARCHY RULES & PERMISSION GRAPH
// ==============================================================================

/**
 * Evaluates whether an actor role is permitted to grant/revoke a target role.
 *
 * Strict Hierarchy:
 * - ORG_OWNER: can manage EXAM_MANAGER and AUDITOR.
 * - EXAM_MANAGER: can manage TRANSLATOR and CENTRE_OPERATOR.
 * - AUDITOR, TRANSLATOR, CENTRE_OPERATOR: cannot manage any users.
 */
export function canActorManageRole(actorRole: UserRole, targetRole: UserRole): boolean {
  if (actorRole === 'ORG_OWNER') {
    return targetRole === 'EXAM_MANAGER' || targetRole === 'AUDITOR';
  }
  if (actorRole === 'EXAM_MANAGER') {
    return targetRole === 'TRANSLATOR' || targetRole === 'CENTRE_OPERATOR';
  }
  return false;
}

/**
 * Returns the higher authorizing manager role required to approve a password reset.
 */
export function getAuthorizingManagerRole(targetRole: UserRole): UserRole {
  switch (targetRole) {
    case 'TRANSLATOR':
    case 'CENTRE_OPERATOR':
      return 'EXAM_MANAGER';
    case 'EXAM_MANAGER':
    case 'AUDITOR':
      return 'ORG_OWNER';
    case 'ORG_OWNER':
      throw new Error('Organization Owner is the apex authority and cannot request reset from a higher manager.');
  }
}

// ==============================================================================
// 2. SCHEMA INITIALIZATION
// ==============================================================================

export function initHierarchicalAccessSchema(db: any): void {
  executeRun(
    db,
    `CREATE TABLE IF NOT EXISTS password_reset_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_email TEXT NOT NULL,
      user_role TEXT NOT NULL,
      authorizing_manager_id TEXT NOT NULL,
      authorizing_manager_role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      request_reason TEXT NOT NULL,
      decision_reason TEXT,
      reviewed_by_id TEXT,
      reviewed_by_name TEXT,
      reviewed_at TEXT,
      token_hash TEXT,
      token_issued_at TEXT,
      token_expires_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`
  );

  executeRun(
    db,
    `CREATE TABLE IF NOT EXISTS user_manager_assignments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      manager_id TEXT NOT NULL,
      assigned_by TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      assigned_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`
  );

  executeRun(
    db,
    `CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_id TEXT,
      token_hash TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      logout_time TEXT,
      created_at TEXT NOT NULL,
      last_active_at TEXT
    );`
  );

  executeRun(
    db,
    `CREATE INDEX IF NOT EXISTS idx_pwd_reset_user ON password_reset_requests(user_id);`
  );
  executeRun(
    db,
    `CREATE INDEX IF NOT EXISTS idx_pwd_reset_mgr ON password_reset_requests(authorizing_manager_id);`
  );
  executeRun(
    db,
    `CREATE INDEX IF NOT EXISTS idx_pwd_reset_status ON password_reset_requests(status);`
  );
}

// ==============================================================================
// 3. SUBORDINATE ACCESS GRANTS & USER MANAGEMENT
// ==============================================================================

export async function grantSubordinateAccess(
  db: any,
  params: {
    actorId: string;
    actorName: string;
    actorRole: UserRole;
    actorOrgId: string;
    targetEmail: string;
    targetUsername: string;
    targetFullName: string;
    targetRole: UserRole;
    initialPassword?: string;
    centreId?: string;
    scope?: string;
  }
): Promise<{ success: boolean; user?: ManagedUserRecord; error?: string }> {
  initHierarchicalAccessSchema(db);

  // 1. Hierarchy Check
  if (!canActorManageRole(params.actorRole, params.targetRole)) {
    // Record unauthorized privilege escalation attempt in audit log
    executeRun(
      db,
      `INSERT INTO audit_events (
        id, event_type, user_id, org_id, status, tx_ref, details_json, created_at
      ) VALUES (?, 'UNAUTHORIZED_ROLE_ASSIGNMENT', ?, ?, 'FAILED', ?, ?, ?)`,
      [
        uuidv4(),
        params.actorId,
        params.actorOrgId,
        `TX-${uuidv4().slice(0, 12)}`,
        JSON.stringify({
          actorRole: params.actorRole,
          attemptedRole: params.targetRole,
          reason: 'Role hierarchy violation. Cannot grant equal or higher role.',
        }),
        new Date().toISOString(),
      ]
    );

    return {
      success: false,
      error: `ACCESS DENIED: Role ${params.actorRole} is not authorized to grant role ${params.targetRole} under the ZeroLeak authority hierarchy.`,
    };
  }

  // 2. Prevent duplicate email or username
  const existingRows = executeQuery(
    db,
    'SELECT id FROM users WHERE email = ? OR username = ?',
    [params.targetEmail.toLowerCase(), params.targetUsername.toLowerCase()]
  );
  if (existingRows && existingRows.length > 0) {
    return { success: false, error: 'A user with this email or username already exists.' };
  }

  const userId = `usr-${uuidv4().slice(0, 8)}`;
  const now = new Date().toISOString();
  const passwordToHash = params.initialPassword || `ZeroLeak@${crypto.randomBytes(4).toString('hex')}!`;
  const passwordHash = await bcrypt.hash(passwordToHash, 10);

  // 3. Create User record
  executeRun(
    db,
    `INSERT INTO users (
      id, org_id, email, username, password_hash, full_name, role, status,
      authorization_status, account_type, environment, authorized_by, authorized_at,
      centre_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 'AUTHORIZED', 'STANDARD', 'production', ?, ?, ?, ?)`,
    [
      userId,
      params.actorOrgId,
      params.targetEmail.toLowerCase(),
      params.targetUsername.toLowerCase(),
      passwordHash,
      params.targetFullName,
      params.targetRole,
      params.actorId,
      now,
      params.centreId || null,
      now,
    ]
  );

  // 4. Create manager assignment binding
  executeRun(
    db,
    `INSERT OR REPLACE INTO user_manager_assignments (
      id, user_id, manager_id, assigned_by, status, assigned_at, updated_at
    ) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`,
    [uuidv4(), userId, params.actorId, params.actorId, now, now]
  );

  // 5. Audit Log Events
  executeRun(
    db,
    `INSERT INTO audit_events (
      id, event_type, user_id, org_id, status, tx_ref, details_json, created_at
    ) VALUES (?, 'AUTHORITY_GRANTED', ?, ?, 'SUCCESS', ?, ?, ?)`,
    [
      uuidv4(),
      params.actorId,
      params.actorOrgId,
      `TX-${uuidv4().slice(0, 12)}`,
      JSON.stringify({
        grantingManager: params.actorName,
        grantingRole: params.actorRole,
        targetUserId: userId,
        targetRole: params.targetRole,
        targetEmail: params.targetEmail,
      }),
      now,
    ]
  );

  // 6. Notify user
  executeRun(
    db,
    `INSERT INTO notifications (id, user_id, role, org_id, title, message, category, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'SECURITY_ACCESS', 0, ?)`,
    [
      uuidv4(),
      userId,
      params.targetRole,
      params.actorOrgId,
      `ZeroLeak Access Granted: ${params.targetRole}`,
      `Your account has been authorized by ${params.actorName} (${params.actorRole}).`,
      now,
    ]
  );

  saveDb();

  const user = getManagedUser(db, userId);
  return { success: true, user: user || undefined };
}

/**
 * Revokes or suspends user access with cascading subordinate protection.
 */
export function revokeOrSuspendUserAccess(
  db: any,
  params: {
    actorId: string;
    actorName: string;
    actorRole: UserRole;
    targetUserId: string;
    action: 'REVOKE' | 'SUSPEND';
    reason: string;
  }
): { success: boolean; message?: string; affectedSubordinatesCount?: number; error?: string } {
  initHierarchicalAccessSchema(db);

  const target = getManagedUser(db, params.targetUserId);
  if (!target) {
    return { success: false, error: 'Target user account not found.' };
  }

  // 1. Hierarchy Check
  let isAuthorizedManager = canActorManageRole(params.actorRole, target.role);

  // If actor is EXAM_MANAGER, they must also be the DIRECT assigned manager for that subordinate!
  if (params.actorRole === 'EXAM_MANAGER') {
    const assignmentRows = executeQuery(
      db,
      'SELECT manager_id FROM user_manager_assignments WHERE user_id = ? AND status = "ACTIVE"',
      [target.id]
    );
    if (!assignmentRows || assignmentRows.length === 0 || assignmentRows[0].manager_id !== params.actorId) {
      isAuthorizedManager = false;
    }
  }

  // ORG_OWNER can also manage orphaned subordinates if needed
  if (params.actorRole === 'ORG_OWNER' && ['TRANSLATOR', 'CENTRE_OPERATOR'].includes(target.role)) {
    isAuthorizedManager = true;
  }

  if (!isAuthorizedManager) {
    return {
      success: false,
      error: `ACCESS DENIED: ${params.actorRole} cannot ${params.action.toLowerCase()} user ${target.username} (${target.role}).`,
    };
  }

  const now = new Date().toISOString();
  const newStatus: UserAccountStatus = params.action === 'REVOKE' ? 'REVOKED' : 'SUSPENDED';

  // 2. Update user status and authorization status in DB
  executeRun(
    db,
    `UPDATE users
     SET status = ?,
         authorization_status = ?
     WHERE id = ?`,
    [newStatus, newStatus, target.id]
  );

  // 3. Invalidate active sessions immediately
  executeRun(
    db,
    `UPDATE user_sessions
     SET status = 'REVOKED',
         logout_time = ?
     WHERE user_id = ? AND status = 'ACTIVE'`,
    [now, target.id]
  );

  // 4. Cascade check: If revoking an EXAM_MANAGER, suspend their subordinate accounts!
  let affectedSubordinatesCount = 0;
  if (target.role === 'EXAM_MANAGER') {
    const subRows = executeQuery(
      db,
      `SELECT u.id, u.username, u.role FROM users u
       JOIN user_manager_assignments a ON u.id = a.user_id
       WHERE a.manager_id = ? AND u.status = 'ACTIVE'`,
      [target.id]
    );

    if (subRows && subRows.length > 0) {
      affectedSubordinatesCount = subRows.length;
      for (const sub of subRows) {
        // Suspend subordinate and invalidate their sessions
        executeRun(
          db,
          `UPDATE users SET status = 'SUSPENDED', authorization_status = 'SUSPENDED_MANAGER_REVOKED' WHERE id = ?`,
          [sub.id]
        );
        executeRun(
          db,
          `UPDATE user_sessions SET status = 'REVOKED', logout_time = ? WHERE user_id = ? AND status = 'ACTIVE'`,
          [now, sub.id]
        );
      }
    }
  }

  // 5. Audit Log
  executeRun(
    db,
    `INSERT INTO audit_events (
      id, event_type, user_id, org_id, status, tx_ref, details_json, created_at
    ) VALUES (?, 'AUTHORITY_REVOKED', ?, ?, 'SUCCESS', ?, ?, ?)`,
    [
      uuidv4(),
      params.actorId,
      target.orgId,
      `TX-${uuidv4().slice(0, 12)}`,
      JSON.stringify({
        actorRole: params.actorRole,
        action: params.action,
        targetUserId: target.id,
        targetRole: target.role,
        reason: params.reason,
        affectedSubordinatesCount,
      }),
      now,
    ]
  );

  saveDb();

  return {
    success: true,
    message: `Account ${target.username} (${target.role}) has been ${params.action.toLowerCase()}ed.`,
    affectedSubordinatesCount,
  };
}

/**
 * Reassigns subordinate users of a revoked Examination Manager to a new Examination Manager.
 */
export function reassignSubordinatesToNewManager(
  db: any,
  params: {
    ownerId: string;
    ownerRole: UserRole;
    newManagerId: string;
    subordinateUserIds?: string[];
    previousManagerId?: string;
  }
): { success: boolean; reassignedCount?: number; error?: string } {
  if (params.ownerRole !== 'ORG_OWNER') {
    return { success: false, error: 'ACCESS DENIED: Only Organization Owner may reassign subordinates.' };
  }

  const newMgr = getManagedUser(db, params.newManagerId);
  if (!newMgr || newMgr.role !== 'EXAM_MANAGER' || newMgr.status !== 'ACTIVE') {
    return { success: false, error: 'Target manager must be an ACTIVE Examination Manager.' };
  }

  let targetSubordinateIds = params.subordinateUserIds || [];
  if (targetSubordinateIds.length === 0 && params.previousManagerId) {
    const assignedRows = executeQuery(
      db,
      'SELECT user_id FROM user_manager_assignments WHERE manager_id = ?',
      [params.previousManagerId]
    );
    targetSubordinateIds = (assignedRows || []).map((r: any) => r.user_id);
  }

  const now = new Date().toISOString();
  let count = 0;

  for (const sId of targetSubordinateIds) {
    executeRun(
      db,
      `INSERT OR REPLACE INTO user_manager_assignments (id, user_id, manager_id, assigned_by, status, assigned_at, updated_at)
       VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`,
      [uuidv4(), sId, params.newManagerId, params.ownerId, now, now]
    );

    // Reactivate user if suspended due to previous manager revocation
    executeRun(
      db,
      `UPDATE users SET status = 'ACTIVE', authorization_status = 'AUTHORIZED', authorized_by = ? WHERE id = ?`,
      [params.newManagerId, sId]
    );
    count++;
  }

  saveDb();
  return { success: true, reassignedCount: count };
}

/**
 * Lists users visible to the authenticated manager based on the authority hierarchy.
 */
export function listManagedUsers(
  db: any,
  params: {
    actorId: string;
    actorRole: UserRole;
    actorOrgId?: string;
  }
): ManagedUserRecord[] {
  initHierarchicalAccessSchema(db);

  if (params.actorRole === 'ORG_OWNER') {
    // Owner sees Examination Managers, Auditors, and any unassigned/orphaned Translators & Operators
    const rows = executeQuery(
      db,
      `SELECT id, org_id, email, username, full_name, role, status, authorization_status,
              authorized_by, authorized_at, centre_id, created_at, last_login_at
       FROM users
       WHERE role IN ('EXAM_MANAGER', 'AUDITOR', 'TRANSLATOR', 'CENTRE_OPERATOR')
       ORDER BY created_at DESC`
    );
    return (rows || []).map(mapManagedUserRow);
  }

  if (params.actorRole === 'EXAM_MANAGER') {
    // Manager sees only the Translators and Centre Operators assigned under them
    const rows = executeQuery(
      db,
      `SELECT u.id, u.org_id, u.email, u.username, u.full_name, u.role, u.status,
              u.authorization_status, u.authorized_by, u.authorized_at, u.centre_id,
              u.created_at, u.last_login_at
       FROM users u
       JOIN user_manager_assignments a ON u.id = a.user_id
       WHERE a.manager_id = ? AND u.role IN ('TRANSLATOR', 'CENTRE_OPERATOR')
       ORDER BY u.created_at DESC`,
      [params.actorId]
    );
    return (rows || []).map(mapManagedUserRow);
  }

  // Other roles (Auditor, Translator, Operator) cannot manage other users
  return [];
}

// ==============================================================================
// 4. LOWER-ROLE PASSWORD RESET REQUEST WORKFLOW
// ==============================================================================

/**
 * Submits a password reset request routed to the user's authorizing manager.
 */
export function requestPasswordReset(
  db: any,
  params: {
    userId: string;
    reason: string;
  }
): { success: boolean; request?: PasswordResetRequestRecord; error?: string } {
  initHierarchicalAccessSchema(db);

  const user = getManagedUser(db, params.userId);
  if (!user) {
    return { success: false, error: 'User account not found.' };
  }

  // 1. Determine authorizing manager per hierarchy
  let authorizingManagerId = '';
  let authorizingManagerRole: UserRole;

  try {
    authorizingManagerRole = getAuthorizingManagerRole(user.role);
  } catch (err: any) {
    return { success: false, error: err.message };
  }

  if (user.role === 'TRANSLATOR' || user.role === 'CENTRE_OPERATOR') {
    // Find assigned Examination Manager
    const assignRows = executeQuery(
      db,
      'SELECT manager_id FROM user_manager_assignments WHERE user_id = ? AND status = "ACTIVE"',
      [user.id]
    );
    if (assignRows && assignRows.length > 0) {
      authorizingManagerId = assignRows[0].manager_id;
    } else {
      // Fallback: authorized_by column in users
      authorizingManagerId = user.authorizedBy || '';
    }

    if (!authorizingManagerId) {
      // If manager unassigned, route to Owner
      authorizingManagerId = 'org-owner-default';
      authorizingManagerRole = 'ORG_OWNER';
    }
  } else {
    // EXAM_MANAGER or AUDITOR -> Routes to ORG_OWNER
    const ownerRows = executeQuery(
      db,
      'SELECT id FROM users WHERE role = "ORG_OWNER" AND status = "ACTIVE" LIMIT 1'
    );
    authorizingManagerId = ownerRows && ownerRows.length > 0 ? ownerRows[0].id : (user.authorizedBy || 'org-owner');
  }

  // 2. Prevent duplicate pending requests
  const existingPending = executeQuery(
    db,
    'SELECT id FROM password_reset_requests WHERE user_id = ? AND status = "PENDING"',
    [user.id]
  );
  if (existingPending && existingPending.length > 0) {
    return {
      success: false,
      error: 'You already have a pending password reset request awaiting manager review.',
    };
  }

  const reqId = `PWR-REQ-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const now = new Date().toISOString();

  // 3. Insert record
  executeRun(
    db,
    `INSERT INTO password_reset_requests (
      id, user_id, user_name, user_email, user_role, authorizing_manager_id,
      authorizing_manager_role, status, request_reason, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
    [
      reqId,
      user.id,
      user.fullName,
      user.email,
      user.role,
      authorizingManagerId,
      authorizingManagerRole,
      params.reason,
      now,
      now,
    ]
  );

  // 4. Update user status to indicate reset pending
  executeRun(
    db,
    'UPDATE users SET status = "PASSWORD_RESET_PENDING" WHERE id = ? AND status = "ACTIVE"',
    [user.id]
  );

  // 5. Notify authorizing manager
  executeRun(
    db,
    `INSERT INTO notifications (id, user_id, role, org_id, title, message, category, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'SECURITY_ACCESS', 0, ?)`,
    [
      uuidv4(),
      authorizingManagerId,
      authorizingManagerRole,
      user.orgId,
      `🔑 Password Reset Request from ${user.fullName} (${user.role})`,
      `User ${user.fullName} requested a password reset. Reason: "${params.reason}". Please review and approve in Access Management.`,
      now,
    ]
  );

  // 6. Audit Log
  executeRun(
    db,
    `INSERT INTO audit_events (
      id, event_type, user_id, org_id, status, tx_ref, details_json, created_at
    ) VALUES (?, 'PASSWORD_RESET_REQUESTED', ?, ?, 'SUCCESS', ?, ?, ?)`,
    [
      uuidv4(),
      user.id,
      user.orgId,
      `TX-${uuidv4().slice(0, 12)}`,
      JSON.stringify({
        requestId: reqId,
        userRole: user.role,
        routedToManagerId: authorizingManagerId,
        routedToRole: authorizingManagerRole,
      }),
      now,
    ]
  );

  saveDb();

  const req = getPasswordResetRequest(db, reqId);
  return { success: true, request: req || undefined };
}

/**
 * Lists pending password reset requests for the authenticated manager.
 */
export function listPendingPasswordResetRequests(
  db: any,
  params: {
    actorId: string;
    actorRole: UserRole;
  }
): PasswordResetRequestRecord[] {
  initHierarchicalAccessSchema(db);

  if (params.actorRole === 'ORG_OWNER') {
    // Owner reviews requests from Examination Managers and Auditors
    const rows = executeQuery(
      db,
      `SELECT * FROM password_reset_requests
       WHERE authorizing_manager_role = 'ORG_OWNER' AND status = 'PENDING'
       ORDER BY created_at DESC`
    );
    return (rows || []).map(mapResetRequestRow);
  }

  if (params.actorRole === 'EXAM_MANAGER') {
    // Manager reviews requests from Translators and Operators assigned to them
    const rows = executeQuery(
      db,
      `SELECT * FROM password_reset_requests
       WHERE authorizing_manager_id = ? AND status = 'PENDING'
       ORDER BY created_at DESC`,
      [params.actorId]
    );
    return (rows || []).map(mapResetRequestRow);
  }

  return [];
}

/**
 * Reviews (Approves or Rejects) a password reset request.
 * On approval, generates a secure, time-limited, single-use token.
 * NEVER generates or exposes plaintext passwords!
 */
export function reviewPasswordResetRequest(
  db: any,
  params: {
    requestId: string;
    actorId: string;
    actorName: string;
    actorRole: UserRole;
    decision: 'APPROVE' | 'REJECT';
    reason?: string;
  }
): {
  success: boolean;
  request?: PasswordResetRequestRecord;
  resetToken?: string; // One-time token returned only on approval
  error?: string;
} {
  initHierarchicalAccessSchema(db);

  const resetReq = getPasswordResetRequest(db, params.requestId);
  if (!resetReq) {
    return { success: false, error: 'Password reset request not found.' };
  }

  if (resetReq.status !== 'PENDING') {
    return { success: false, error: `Request has already been processed (${resetReq.status}).` };
  }

  // Prevent self-approval!
  if (resetReq.userId === params.actorId) {
    return { success: false, error: 'ACCESS DENIED: Users cannot approve their own password reset requests.' };
  }

  // Hierarchy validation: Only authorized manager can review!
  let canReview = false;
  if (params.actorRole === 'ORG_OWNER') {
    canReview = resetReq.authorizingManagerRole === 'ORG_OWNER';
  } else if (params.actorRole === 'EXAM_MANAGER') {
    canReview = resetReq.authorizingManagerId === params.actorId;
  }

  if (!canReview) {
    return {
      success: false,
      error: `ACCESS DENIED: ${params.actorRole} is not authorized to review this reset request under the authority hierarchy.`,
    };
  }

  const now = new Date().toISOString();

  if (params.decision === 'REJECT') {
    executeRun(
      db,
      `UPDATE password_reset_requests
       SET status = 'REJECTED',
           decision_reason = ?,
           reviewed_by_id = ?,
           reviewed_by_name = ?,
           reviewed_at = ?,
           updated_at = ?
       WHERE id = ?`,
      [params.reason || 'Rejected by manager', params.actorId, params.actorName, now, now, resetReq.id]
    );

    // Restore user status to ACTIVE if was PASSWORD_RESET_PENDING
    executeRun(
      db,
      'UPDATE users SET status = "ACTIVE" WHERE id = ? AND status = "PASSWORD_RESET_PENDING"',
      [resetReq.userId]
    );

    saveDb();
    const updated = getPasswordResetRequest(db, resetReq.id);
    return { success: true, request: updated || undefined };
  }

  // DECISION === 'APPROVE'
  // Generate random single-use reset token (32 bytes hex)
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins expiry

  executeRun(
    db,
    `UPDATE password_reset_requests
     SET status = 'RESET_LINK_ISSUED',
         decision_reason = ?,
         reviewed_by_id = ?,
         reviewed_by_name = ?,
         reviewed_at = ?,
         token_hash = ?,
         token_issued_at = ?,
         token_expires_at = ?,
         updated_at = ?
     WHERE id = ?`,
    [
      params.reason || 'Approved by authorizing manager',
      params.actorId,
      params.actorName,
      now,
      tokenHash,
      now,
      expiresAt,
      now,
      resetReq.id,
    ]
  );

  // Notify user that reset is approved
  executeRun(
    db,
    `INSERT INTO notifications (id, user_id, role, org_id, title, message, category, is_read, created_at)
     VALUES (?, ?, ?, NULL, ?, ?, 'SECURITY_ACCESS', 0, ?)`,
    [
      uuidv4(),
      resetReq.userId,
      resetReq.userRole,
      'Password Reset Approved',
      `Your password reset request has been approved by ${params.actorName}. Please set your new password within 15 minutes.`,
      now,
    ]
  );

  // Audit Log (Token hash only, NEVER plaintext)
  executeRun(
    db,
    `INSERT INTO audit_events (
      id, event_type, user_id, org_id, status, tx_ref, details_json, created_at
    ) VALUES (?, 'PASSWORD_RESET_APPROVED', ?, NULL, 'SUCCESS', ?, ?, ?)`,
    [
      uuidv4(),
      params.actorId,
      `TX-${uuidv4().slice(0, 12)}`,
      JSON.stringify({
        requestId: resetReq.id,
        targetUserId: resetReq.userId,
        approverRole: params.actorRole,
        tokenHash,
        expiresAt,
      }),
      now,
    ]
  );

  saveDb();

  const updated = getPasswordResetRequest(db, resetReq.id);
  return {
    success: true,
    request: updated || undefined,
    resetToken: rawToken, // Returned for one-time secure delivery to user
  };
}

/**
 * Completes the password reset when the user provides the valid token and new password.
 * Password reset DOES NOT reactivate a revoked or suspended account!
 */
export async function executePasswordResetWithToken(
  db: any,
  params: {
    token: string;
    newPassword: string;
  }
): Promise<{ success: boolean; message?: string; error?: string }> {
  initHierarchicalAccessSchema(db);

  if (!params.token || !params.newPassword || params.newPassword.length < 8) {
    return { success: false, error: 'Valid reset token and new password (min 8 characters) are required.' };
  }

  const tokenHash = crypto.createHash('sha256').update(params.token).digest('hex');
  const now = new Date().toISOString();

  // 1. Find matching reset request
  const rows = executeQuery(
    db,
    'SELECT * FROM password_reset_requests WHERE token_hash = ? AND status = "RESET_LINK_ISSUED"',
    [tokenHash]
  );

  if (!rows || rows.length === 0) {
    return { success: false, error: 'Invalid or already consumed reset token.' };
  }

  const req = rows[0];

  // 2. Check token expiration
  if (req.token_expires_at && new Date(req.token_expires_at).getTime() < Date.now()) {
    executeRun(db, 'UPDATE password_reset_requests SET status = "EXPIRED" WHERE id = ?', [req.id]);
    saveDb();
    return { success: false, error: 'Reset token has expired. Please request a new password reset.' };
  }

  // 3. Check user account status!
  // CRITICAL RULE: Password reset must NOT reactivate a revoked or suspended account!
  const userRows = executeQuery(
    db,
    'SELECT id, status, authorization_status FROM users WHERE id = ?',
    [req.user_id]
  );
  if (!userRows || userRows.length === 0) {
    return { success: false, error: 'User account not found.' };
  }
  const user = userRows[0];

  if (['REVOKED', 'SUSPENDED'].includes(user.status) || ['REVOKED', 'SUSPENDED'].includes(user.authorization_status)) {
    return {
      success: false,
      error: `CANNOT RESET: Account is currently ${user.status}. Password reset cannot reactivate revoked authorization.`,
    };
  }

  // 4. Hash new password securely with bcrypt
  const newPasswordHash = await bcrypt.hash(params.newPassword, 10);

  // 5. Update user password hash
  executeRun(
    db,
    `UPDATE users
     SET password_hash = ?,
         status = 'ACTIVE'
     WHERE id = ?`,
    [newPasswordHash, req.user_id]
  );

  // 6. Invalidate all active sessions for this user
  executeRun(
    db,
    `UPDATE user_sessions
     SET status = 'REVOKED',
         logout_time = ?
     WHERE user_id = ? AND status = 'ACTIVE'`,
    [now, req.user_id]
  );

  // 7. Mark reset request as COMPLETED (single-use token consumed)
  executeRun(
    db,
    `UPDATE password_reset_requests
     SET status = 'COMPLETED',
         completed_at = ?,
         updated_at = ?
     WHERE id = ?`,
    [now, now, req.id]
  );

  // 8. Audit Log
  executeRun(
    db,
    `INSERT INTO audit_events (
      id, event_type, user_id, org_id, status, tx_ref, details_json, created_at
    ) VALUES (?, 'PASSWORD_RESET_COMPLETED', ?, NULL, 'SUCCESS', ?, ?, ?)`,
    [
      uuidv4(),
      req.user_id,
      `TX-${uuidv4().slice(0, 12)}`,
      JSON.stringify({ requestId: req.id, userId: req.user_id }),
      now,
    ]
  );

  saveDb();

  return { success: true, message: 'Password has been updated successfully. Please log in with your new password.' };
}

// ==============================================================================
// GETTERS & MAPPING HELPERS
// ==============================================================================

export function getManagedUser(db: any, userId: string): ManagedUserRecord | null {
  const rows = executeQuery(
    db,
    `SELECT u.id, u.org_id, u.email, u.username, u.full_name, u.role, u.status,
            u.authorization_status, u.authorized_by, u.authorized_at, u.centre_id,
            u.created_at, u.last_login_at
     FROM users u
     WHERE u.id = ?`,
    [userId]
  );
  if (!rows || rows.length === 0) return null;
  return mapManagedUserRow(rows[0]);
}

export function getPasswordResetRequest(db: any, requestId: string): PasswordResetRequestRecord | null {
  const rows = executeQuery(
    db,
    'SELECT * FROM password_reset_requests WHERE id = ?',
    [requestId]
  );
  if (!rows || rows.length === 0) return null;
  return mapResetRequestRow(rows[0]);
}

function mapManagedUserRow(row: any): ManagedUserRecord {
  return {
    id: row.id,
    orgId: row.org_id,
    email: row.email,
    username: row.username,
    fullName: row.full_name,
    role: row.role,
    status: row.status,
    authorizationStatus: row.authorization_status,
    authorizedBy: row.authorized_by || undefined,
    authorizedAt: row.authorized_at || undefined,
    centreId: row.centre_id || undefined,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at || undefined,
  };
}

function mapResetRequestRow(row: any): PasswordResetRequestRecord {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    userRole: row.user_role,
    authorizingManagerId: row.authorizing_manager_id,
    authorizingManagerRole: row.authorizing_manager_role,
    status: row.status,
    requestReason: row.request_reason,
    decisionReason: row.decision_reason || undefined,
    reviewedById: row.reviewed_by_id || undefined,
    reviewedByName: row.reviewed_by_name || undefined,
    reviewedAt: row.reviewed_at || undefined,
    tokenHash: row.token_hash || undefined,
    tokenIssuedAt: row.token_issued_at || undefined,
    tokenExpiresAt: row.token_expires_at || undefined,
    completedAt: row.completed_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
