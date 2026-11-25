import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { Database } from 'sql.js';
import { executeQuery, executeRun, executeTransactionWithResult } from './db.ts';

export interface ProctorSettings {
  id: string;
  org_id?: string;
  tab_switch_points: number;
  fullscreen_exit_points: number;
  face_not_detected_points: number;
  multiple_faces_points: number;
  camera_disabled_points: number;
  mic_disabled_points: number;
  audio_activity_points: number;
  copy_paste_points: number;
  key_shortcut_points: number;
  repeated_activity_points: number;
  max_warnings: number;
}

export const DEFAULT_PROCTOR_SETTINGS: ProctorSettings = {
  id: 'default_settings',
  tab_switch_points: 10,
  fullscreen_exit_points: 10,
  face_not_detected_points: 15,
  multiple_faces_points: 30,
  camera_disabled_points: 30,
  mic_disabled_points: 15,
  audio_activity_points: 5,
  copy_paste_points: 5,
  key_shortcut_points: 5,
  repeated_activity_points: 10,
  max_warnings: 3,
};

export function getProctorSettings(db: Database): ProctorSettings {
  try {
    const rows = executeQuery(db, 'SELECT * FROM proctor_settings LIMIT 1', []);
    if (rows && rows.length > 0) {
      return {
        id: rows[0].id,
        org_id: rows[0].org_id,
        tab_switch_points: Number(rows[0].tab_switch_points) || 10,
        fullscreen_exit_points: Number(rows[0].fullscreen_exit_points) || 10,
        face_not_detected_points: Number(rows[0].face_not_detected_points) || 15,
        multiple_faces_points: Number(rows[0].multiple_faces_points) || 30,
        camera_disabled_points: Number(rows[0].camera_disabled_points) || 30,
        mic_disabled_points: Number(rows[0].mic_disabled_points) || 15,
        audio_activity_points: Number(rows[0].audio_activity_points) || 5,
        copy_paste_points: Number(rows[0].copy_paste_points) || 5,
        key_shortcut_points: Number(rows[0].key_shortcut_points) || 5,
        repeated_activity_points: Number(rows[0].repeated_activity_points) || 10,
        max_warnings: Number(rows[0].max_warnings) || 3,
      };
    }
  } catch (err) {
    console.error('Error fetching proctor settings:', err);
  }
  return DEFAULT_PROCTOR_SETTINGS;
}

export function updateProctorSettings(db: Database, settings: Partial<ProctorSettings>): ProctorSettings {
  const current = getProctorSettings(db);
  const updated: ProctorSettings = {
    ...current,
    ...settings,
    max_warnings: Math.max(1, Number(settings.max_warnings ?? current.max_warnings)),
  };

  executeRun(
    db,
    `UPDATE proctor_settings SET
      tab_switch_points = ?,
      fullscreen_exit_points = ?,
      face_not_detected_points = ?,
      multiple_faces_points = ?,
      camera_disabled_points = ?,
      mic_disabled_points = ?,
      audio_activity_points = ?,
      copy_paste_points = ?,
      key_shortcut_points = ?,
      repeated_activity_points = ?,
      max_warnings = ?,
      updated_at = datetime('now')
    WHERE id = ?`,
    [
      updated.tab_switch_points,
      updated.fullscreen_exit_points,
      updated.face_not_detected_points,
      updated.multiple_faces_points,
      updated.camera_disabled_points,
      updated.mic_disabled_points,
      updated.audio_activity_points,
      updated.copy_paste_points,
      updated.key_shortcut_points,
      updated.repeated_activity_points,
      updated.max_warnings,
      current.id,
    ]
  );

  return updated;
}

export type RiskLevel = 'NORMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export function determineRiskLevel(score: number): RiskLevel {
  if (score >= 81) return 'CRITICAL';
  if (score >= 61) return 'HIGH';
  if (score >= 41) return 'MEDIUM';
  if (score >= 21) return 'LOW';
  return 'NORMAL';
}

export function calculateProctorRisk(db: Database, attemptId: string): { risk_score: number; risk_level: RiskLevel; warning_count: number } {
  const settings = getProctorSettings(db);
  const events = executeQuery(
    db,
    'SELECT event_type, severity, risk_points FROM proctor_events WHERE attempt_id = ? ORDER BY timestamp ASC',
    [attemptId]
  );

  let rawScore = 0;
  let tabSwitchCount = 0;
  let fullscreenExitCount = 0;
  let faceNotDetectedCount = 0;
  let multipleFacesCount = 0;
  let warningCount = 0;

  for (const ev of events) {
    switch (ev.event_type) {
      case 'TAB_SWITCH':
        tabSwitchCount++;
        rawScore += settings.tab_switch_points;
        warningCount++;
        break;
      case 'FULLSCREEN_EXIT':
        fullscreenExitCount++;
        rawScore += settings.fullscreen_exit_points;
        warningCount++;
        break;
      case 'FACE_NOT_DETECTED':
        faceNotDetectedCount++;
        rawScore += settings.face_not_detected_points;
        break;
      case 'MULTIPLE_FACES':
        multipleFacesCount++;
        rawScore += settings.multiple_faces_points;
        warningCount++;
        break;
      case 'CAMERA_DISABLED':
        rawScore += settings.camera_disabled_points;
        warningCount++;
        break;
      case 'MICROPHONE_DISABLED':
        rawScore += settings.mic_disabled_points;
        break;
      case 'AUDIO_ACTIVITY':
        rawScore += settings.audio_activity_points;
        break;
      case 'COPY_ATTEMPT':
      case 'PASTE_ATTEMPT':
      case 'CUT_ATTEMPT':
      case 'CONTEXT_MENU_ATTEMPT':
        rawScore += settings.copy_paste_points;
        break;
      case 'SUSPICIOUS_KEY_ATTEMPT':
        rawScore += settings.key_shortcut_points;
        break;
      case 'WARNING_ISSUED':
        warningCount++;
        break;
      default:
        rawScore += Number(ev.risk_points) || 0;
        break;
    }
  }

  // Bonus penalties for repeated suspicious signals
  if (tabSwitchCount >= 3) rawScore += settings.repeated_activity_points;
  if (fullscreenExitCount >= 3) rawScore += settings.repeated_activity_points;
  if (faceNotDetectedCount >= 4) rawScore += settings.repeated_activity_points;
  if (multipleFacesCount >= 2) rawScore += settings.repeated_activity_points;

  const finalScore = Math.min(100, Math.max(0, rawScore));
  const riskLevel = determineRiskLevel(finalScore);

  // Update exam_attempts record
  const attempt = executeQuery(db, 'SELECT status FROM exam_attempts WHERE id = ?', [attemptId])[0];
  let newStatus = attempt?.status || 'IN_PROGRESS';
  if (newStatus === 'IN_PROGRESS' && finalScore >= 60) {
    newStatus = 'FLAGGED_FOR_REVIEW';
  }

  executeRun(
    db,
    `UPDATE exam_attempts SET
      risk_score = ?,
      risk_level = ?,
      warning_count = ?,
      status = ?,
      updated_at = datetime('now')
    WHERE id = ?`,
    [finalScore, riskLevel, warningCount, newStatus, attemptId]
  );

  return {
    risk_score: finalScore,
    risk_level: riskLevel,
    warning_count: warningCount,
  };
}

export interface RecordEventParams {
  attempt_id: string;
  exam_id: string;
  student_id: string;
  event_type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  metadata?: Record<string, any>;
  timestamp?: string;
  hardware_status?: {
    camera?: 'ACTIVE' | 'DISABLED' | 'ERROR';
    microphone?: 'ACTIVE' | 'DISABLED' | 'ERROR';
    fullscreen?: 'ACTIVE' | 'EXITED';
    face?: 'DETECTED' | 'NOT_DETECTED' | 'MULTIPLE';
    face_count?: number;
  };
}

export function recordProctorEvent(db: Database, params: RecordEventParams) {
  const eventId = `PEV-${uuidv4().substring(0, 8).toUpperCase()}`;
  const isoNow = params.timestamp || new Date().toISOString();
  const settings = getProctorSettings(db);

  let riskPoints = 0;
  switch (params.event_type) {
    case 'TAB_SWITCH': riskPoints = settings.tab_switch_points; break;
    case 'FULLSCREEN_EXIT': riskPoints = settings.fullscreen_exit_points; break;
    case 'FACE_NOT_DETECTED': riskPoints = settings.face_not_detected_points; break;
    case 'MULTIPLE_FACES': riskPoints = settings.multiple_faces_points; break;
    case 'CAMERA_DISABLED': riskPoints = settings.camera_disabled_points; break;
    case 'MICROPHONE_DISABLED': riskPoints = settings.mic_disabled_points; break;
    case 'AUDIO_ACTIVITY': riskPoints = settings.audio_activity_points; break;
    case 'COPY_ATTEMPT':
    case 'PASTE_ATTEMPT':
    case 'CUT_ATTEMPT':
    case 'CONTEXT_MENU_ATTEMPT': riskPoints = settings.copy_paste_points; break;
    case 'SUSPICIOUS_KEY_ATTEMPT': riskPoints = settings.key_shortcut_points; break;
    default: riskPoints = 0; break;
  }

  executeRun(
    db,
    `INSERT INTO proctor_events (
      id, attempt_id, exam_id, student_id, event_type, severity, risk_points, timestamp, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      eventId,
      params.attempt_id,
      params.exam_id,
      params.student_id,
      params.event_type,
      params.severity,
      riskPoints,
      isoNow,
      params.metadata ? JSON.stringify(params.metadata) : null,
      isoNow,
    ]
  );

  // Update session telemetry if provided
  if (params.hardware_status) {
    const hw = params.hardware_status;
    executeRun(
      db,
      `UPDATE proctor_sessions SET
        camera_status = COALESCE(?, camera_status),
        microphone_status = COALESCE(?, microphone_status),
        fullscreen_status = COALESCE(?, fullscreen_status),
        face_status = COALESCE(?, face_status),
        faces_detected_count = COALESCE(?, faces_detected_count),
        last_heartbeat_at = ?,
        updated_at = ?
      WHERE attempt_id = ?`,
      [
        hw.camera || null,
        hw.microphone || null,
        hw.fullscreen || null,
        hw.face || null,
        hw.face_count !== undefined ? hw.face_count : null,
        isoNow,
        isoNow,
        params.attempt_id,
      ]
    );
  }

  // Recalculate score server-side
  const riskResult = calculateProctorRisk(db, params.attempt_id);

  return {
    eventId,
    ...riskResult,
    max_warnings: settings.max_warnings,
    warnings_left: Math.max(0, settings.max_warnings - riskResult.warning_count),
  };
}

export function updateSessionHeartbeat(
  db: Database,
  attemptId: string,
  data: {
    camera_status?: string;
    microphone_status?: string;
    fullscreen_status?: string;
    face_status?: string;
    faces_detected_count?: number;
  }
) {
  const now = new Date().toISOString();
  executeRun(
    db,
    `UPDATE proctor_sessions SET
      camera_status = COALESCE(?, camera_status),
      microphone_status = COALESCE(?, microphone_status),
      fullscreen_status = COALESCE(?, fullscreen_status),
      face_status = COALESCE(?, face_status),
      faces_detected_count = COALESCE(?, faces_detected_count),
      last_heartbeat_at = ?,
      updated_at = ?
    WHERE attempt_id = ?`,
    [
      data.camera_status || null,
      data.microphone_status || null,
      data.fullscreen_status || null,
      data.face_status || null,
      data.faces_detected_count !== undefined ? data.faces_detected_count : null,
      now,
      now,
      attemptId,
    ]
  );
}

// =======================================================
// AUTHORITY PROCTOR ENCLAVE & LEAK AVOIDANCE ENGINE
// =======================================================

export interface AuthorityProctorSession {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_role: string;
  org_id: string;
  workspace_type: string;
  exam_id?: string;
  status: 'ACTIVE' | 'LOCKED' | 'TERMINATED' | 'COMPLETED' | 'FLAGGED_FOR_REVIEW';
  camera_status: 'ACTIVE' | 'DISABLED' | 'ERROR';
  microphone_status: 'ACTIVE' | 'DISABLED' | 'MUTED';
  fullscreen_status: 'ACTIVE' | 'EXITED';
  face_status: 'VERIFIED' | 'ABSENT' | 'SHOULDER_SURFING_DETECTED';
  faces_detected_count: number;
  audio_level_db: number;
  leak_risk_score: number;
  leak_risk_level: RiskLevel;
  verification_snapshot?: string;
  emergency_locked: number;
  emergency_lock_reason?: string;
  locked_by?: string;
  warning_count?: number;
  last_heartbeat_at: string;
  created_at: string;
  updated_at: string;
  review_status?: string;
  auditor_remarks?: string;
  reviewed_by?: string;
  reviewed_at?: string;
}

export function startAuthorityEnclaveSession(
  db: Database,
  user: { id: string; full_name: string; email: string; role: string; org_id: string },
  workspaceType: string,
  examId?: string,
  verificationSnapshot?: string
): AuthorityProctorSession {
  const translatorSession = workspaceType === 'TRANSLATOR_PORTAL';
  const retainedSnapshot = translatorSession ? undefined : verificationSnapshot;
  const sessionId = `AUTH-SESS-${uuidv4().substring(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();

  executeRun(
    db,
    `INSERT INTO authority_proctor_sessions (
      id, user_id, user_name, user_email, user_role, org_id, workspace_type,
      exam_id, status, camera_status, microphone_status, fullscreen_status,
      face_status, faces_detected_count, audio_level_db, leak_risk_score,
      leak_risk_level, verification_snapshot, emergency_locked, warning_count, last_heartbeat_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', ?, ?, -40.0, 0, 'NORMAL', ?, 0, 0, ?, ?, ?)`,
    [
      sessionId,
      user.id,
      user.full_name,
      user.email,
      user.role,
      user.org_id,
      workspaceType,
      examId || null,
      translatorSession ? 'UNVERIFIED' : 'VERIFIED',
      translatorSession ? 0 : 1,
      retainedSnapshot || null,
      now,
      now,
      now,
    ]
  );

  // Log session startup event
  recordAuthorityLeakEvent(db, {
    session_id: sessionId,
    user_id: user.id,
    user_role: user.role,
    exam_id: examId,
    event_type: 'ENCLAVE_STARTED',
    severity: 'LOW',
    metadata: {
      workspace: workspaceType,
      user_agent: 'ZeroLeak Secure Enclave Client',
    },
    snapshot_thumbnail: retainedSnapshot || null,
  });

  // If verification snapshot is provided, save it as official camera evidence
  if (retainedSnapshot) {
    try {
      saveCameraEvidence(db, {
        session_id: sessionId,
        exam_id: examId,
        user_id: user.id,
        user_name: user.full_name,
        user_role: user.role,
        image_data_url: retainedSnapshot,
        event_type: 'INITIAL_VERIFICATION_SNAPSHOT',
        presence_status: 'PRESENT',
        warning_number: 0,
        submitted_by: user.full_name,
        recipient: 'CBI Chief Vigilance & Security Auditor',
      });
    } catch (e) {
      console.warn('Could not auto-save initial verification camera snapshot:', e);
    }
  }

  const rows = executeQuery(db, 'SELECT * FROM authority_proctor_sessions WHERE id = ?', [sessionId]);
  return rows[0] as AuthorityProctorSession;
}

export function calculateAuthorityRisk(db: Database, sessionId: string): { leak_risk_score: number; leak_risk_level: RiskLevel } {
  const events = executeQuery(
    db,
    'SELECT event_type, risk_points FROM proctor_events WHERE session_id = ?',
    [sessionId]
  );

  let rawTotal = 0;
  const countByType: Record<string, number> = {};

  for (const ev of events) {
    rawTotal += (Number(ev.risk_points) || 0);
    countByType[ev.event_type] = (countByType[ev.event_type] || 0) + 1;
  }

  // Escalation penalty if repeated unauthorized actions
  for (const [type, count] of Object.entries(countByType)) {
    if (count > 1 && (type === 'SHOULDER_SURFING_DETECTED' || type === 'UNAUTHORIZED_WINDOW_SWITCH' || type === 'CLIPBOARD_EXTRACTION_BLOCKED')) {
      rawTotal += (count - 1) * 10;
    }
  }

  const leak_risk_score = Math.min(100, Math.max(0, rawTotal));
  const leak_risk_level = determineRiskLevel(leak_risk_score);

  executeRun(
    db,
    `UPDATE authority_proctor_sessions SET
      leak_risk_score = ?,
      leak_risk_level = ?,
      updated_at = ?
    WHERE id = ?`,
    [leak_risk_score, leak_risk_level, new Date().toISOString(), sessionId]
  );

  return { leak_risk_score, leak_risk_level };
}

export function recordAuthorityLeakEvent(
  db: Database,
  params: {
    session_id: string;
    user_id?: string;
    user_role?: string;
    exam_id?: string;
    event_type: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    metadata?: Record<string, any>;
    snapshot_thumbnail?: string | null;
  }
) {
  const eventId = `AUTH-EV-${uuidv4().substring(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();

  let riskPoints = 0;
  switch (params.event_type) {
    case 'SHOULDER_SURFING_DETECTED': riskPoints = 35; break;
    case 'CAMERA_DISCONNECTED': riskPoints = 30; break;
    case 'SCREENSHOT_ATTEMPT_BLOCKED': riskPoints = 25; break;
    case 'CLIPBOARD_EXTRACTION_BLOCKED': riskPoints = 20; break;
    case 'FACE_ABSENT_MASKED': riskPoints = 15; break;
    case 'UNAUTHORIZED_WINDOW_SWITCH': riskPoints = 15; break;
    case 'FULLSCREEN_EXITED': riskPoints = 10; break;
    case 'SUSPICIOUS_AUDIO_DETECTED': riskPoints = 5; break;
    default: riskPoints = 0; break;
  }

  executeRun(
    db,
    `INSERT INTO proctor_events (
      id, session_id, user_id, user_role, exam_id, event_type, severity, risk_points, timestamp, metadata_json, snapshot_thumbnail, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      eventId,
      params.session_id,
      params.user_id || null,
      params.user_role || null,
      params.exam_id || null,
      params.event_type,
      params.severity,
      riskPoints,
      now,
      params.metadata ? JSON.stringify(params.metadata) : null,
      params.snapshot_thumbnail || null,
      now,
    ]
  );

  const risk = calculateAuthorityRisk(db, params.session_id);
  const sessionWorkspace = executeQuery(
    db,
    'SELECT workspace_type FROM authority_proctor_sessions WHERE id = ?',
    [params.session_id]
  )[0]?.workspace_type;

  // If shoulder surfing or face absent, update session face_status immediately
  if (params.event_type === 'SHOULDER_SURFING_DETECTED') {
    executeRun(db, 'UPDATE authority_proctor_sessions SET face_status = "SHOULDER_SURFING_DETECTED", faces_detected_count = 2, updated_at = ? WHERE id = ?', [now, params.session_id]);
  } else if (params.event_type === 'FACE_ABSENT_MASKED') {
    executeRun(db, 'UPDATE authority_proctor_sessions SET face_status = "ABSENT", faces_detected_count = 0, updated_at = ? WHERE id = ?', [now, params.session_id]);
  } else if (params.event_type === 'SCREEN_UNMASKED' && sessionWorkspace !== 'TRANSLATOR_PORTAL') {
    executeRun(db, 'UPDATE authority_proctor_sessions SET face_status = "VERIFIED", faces_detected_count = 1, updated_at = ? WHERE id = ?', [now, params.session_id]);
  }

  return { eventId, ...risk };
}

export function updateAuthorityHeartbeat(
  db: Database,
  sessionId: string,
  data: {
    camera_status?: string;
    microphone_status?: string;
    fullscreen_status?: string;
    face_status?: string;
    faces_detected_count?: number;
    audio_level_db?: number;
  }
) {
  const now = new Date().toISOString();
  executeRun(
    db,
    `UPDATE authority_proctor_sessions SET
      camera_status = COALESCE(?, camera_status),
      microphone_status = COALESCE(?, microphone_status),
      fullscreen_status = COALESCE(?, fullscreen_status),
      face_status = COALESCE(?, face_status),
      faces_detected_count = COALESCE(?, faces_detected_count),
      audio_level_db = COALESCE(?, audio_level_db),
      last_heartbeat_at = ?,
      updated_at = ?
    WHERE id = ?`,
    [
      data.camera_status || null,
      data.microphone_status || null,
      data.fullscreen_status || null,
      data.face_status || null,
      data.faces_detected_count !== undefined ? data.faces_detected_count : null,
      data.audio_level_db !== undefined ? data.audio_level_db : null,
      now,
      now,
      sessionId,
    ]
  );
}

export function emergencyLockAuthoritySession(
  db: Database,
  sessionId: string,
  reason: string,
  lockedBy: string
) {
  const now = new Date().toISOString();
  executeRun(
    db,
    `UPDATE authority_proctor_sessions SET
      status = 'LOCKED',
      emergency_locked = 1,
      emergency_lock_reason = ?,
      locked_by = ?,
      updated_at = ?
    WHERE id = ?`,
    [reason, lockedBy, now, sessionId]
  );

  recordAuthorityLeakEvent(db, {
    session_id: sessionId,
    event_type: 'EMERGENCY_LOCKDOWN',
    severity: 'CRITICAL',
    metadata: { reason, locked_by: lockedBy, timestamp: now },
  });

  return { success: true, message: 'Authority session emergency-locked to prevent paper leakage.' };
}

export function endAuthorityEnclaveSession(db: Database, sessionId: string) {
  const now = new Date().toISOString();
  executeRun(
    db,
    `UPDATE authority_proctor_sessions SET
      status = 'COMPLETED',
      updated_at = ?
    WHERE id = ?`,
    [now, sessionId]
  );
  return { success: true };
}

const EVIDENCE_DIR = path.resolve(process.cwd(), 'storage', 'evidence');
const IMAGES_DIR = path.join(EVIDENCE_DIR, 'images');
const AUDIO_DIR = path.join(EVIDENCE_DIR, 'audio');

function ensureEvidenceDirs() {
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
  if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

export function saveEvidenceBufferToDisk(
  dataUrlOrBase64: string,
  kind: 'images' | 'audio',
  id: string,
  ext: string = 'jpg'
): string | null {
  try {
    ensureEvidenceDirs();
    const base64Data = dataUrlOrBase64.includes(',') ? dataUrlOrBase64.split(',')[1] : dataUrlOrBase64;
    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length === 0) return null;
    const targetPath = path.join(kind === 'images' ? IMAGES_DIR : AUDIO_DIR, `${id}.${ext}`);
    fs.writeFileSync(targetPath, buffer);
    return targetPath;
  } catch (err) {
    console.warn('[ZeroLeak Storage] Failed to persist evidence buffer to disk:', err);
    return null;
  }
}

export interface CameraEvidenceRecord {
  id: string;
  session_id: string;
  exam_id?: string;
  user_id: string;
  user_name: string;
  user_role: string;
  image_data_url: string;
  storage_reference?: string;
  file_size_bytes?: number;
  mime_type?: string;
  event_type: string;
  presence_status?: string;
  warning_number?: number;
  submitted_by?: string;
  recipient?: string;
  review_status?: string;
  created_at: string;
}

export function saveCameraEvidence(
  db: Database,
  params: {
    session_id: string;
    exam_id?: string;
    user_id: string;
    user_name: string;
    user_role: string;
    image_data_url: string;
    file_size_bytes?: number;
    mime_type?: string;
    event_type?: string;
    presence_status?: string;
    warning_number?: number;
    reason?: string;
    submitted_by?: string;
    recipient?: string;
  }
): CameraEvidenceRecord {
  const id = `CAM-EV-${uuidv4().substring(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  const ext = (params.mime_type || 'image/jpeg').includes('png') ? 'png' : 'jpg';
  const diskRef = saveEvidenceBufferToDisk(params.image_data_url, 'images', id, ext);

  executeRun(
    db,
    `INSERT INTO proctor_camera_evidence (
      id, session_id, exam_id, user_id, user_name, user_role,
      image_data_url, storage_reference, file_size_bytes, mime_type,
      event_type, presence_status, warning_number, submitted_by, recipient,
      review_status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_REVIEW', ?)`,
    [
      id,
      params.session_id,
      params.exam_id || null,
      params.user_id,
      params.user_name,
      params.user_role,
      params.image_data_url,
      diskRef || null,
      params.file_size_bytes || 0,
      params.mime_type || 'image/jpeg',
      params.event_type || 'CAMERA_SNAPSHOT',
      params.presence_status || 'PRESENT',
      params.warning_number || 0,
      params.submitted_by || params.user_name,
      params.recipient || 'CBI Chief Vigilance & Security Auditor',
      now,
    ]
  );

  // Update verification_snapshot on session if not set
  executeRun(
    db,
    `UPDATE authority_proctor_sessions SET verification_snapshot = COALESCE(verification_snapshot, ?), updated_at = ? WHERE id = ?`,
    [params.image_data_url, now, params.session_id]
  );

  // Log event in proctor_events timeline
  recordAuthorityLeakEvent(db, {
    session_id: params.session_id,
    user_id: params.user_id,
    user_role: params.user_role,
    exam_id: params.exam_id,
    event_type: 'CAMERA_SNAPSHOT_CREATED',
    severity: params.warning_number && params.warning_number > 0 ? 'HIGH' : 'LOW',
    metadata: {
      evidence_id: id,
      event_type: params.event_type || 'CAMERA_SNAPSHOT',
      presence_status: params.presence_status || 'PRESENT',
      warning_number: params.warning_number || 0,
      recipient: params.recipient || 'CBI Chief Vigilance & Security Auditor',
    },
    snapshot_thumbnail: params.image_data_url,
  });

  return {
    id,
    session_id: params.session_id,
    exam_id: params.exam_id,
    user_id: params.user_id,
    user_name: params.user_name,
    user_role: params.user_role,
    image_data_url: params.image_data_url,
    storage_reference: diskRef || undefined,
    file_size_bytes: params.file_size_bytes || 0,
    mime_type: params.mime_type || 'image/jpeg',
    event_type: params.event_type || 'CAMERA_SNAPSHOT',
    presence_status: params.presence_status || 'PRESENT',
    warning_number: params.warning_number || 0,
    submitted_by: params.submitted_by || params.user_name,
    recipient: params.recipient || 'CBI Chief Vigilance & Security Auditor',
    review_status: 'PENDING_REVIEW',
    created_at: now,
  };
}

export function getCameraEvidenceBySession(db: Database, sessionId: string): CameraEvidenceRecord[] {
  return executeQuery(
    db,
    'SELECT * FROM proctor_camera_evidence WHERE session_id = ? ORDER BY created_at DESC',
    [sessionId]
  ) as CameraEvidenceRecord[];
}

export interface VoiceEvidenceRecord {
  id: string;
  session_id: string;
  exam_id?: string;
  user_id: string;
  user_name: string;
  user_role: string;
  audio_data_url: string;
  storage_reference?: string;
  duration_seconds: number;
  file_size_bytes?: number;
  mime_type?: string;
  event_type?: string;
  warning_number?: number;
  submitted_by?: string;
  recipient?: string;
  review_status?: string;
  created_at: string;
}

export function saveVoiceEvidence(
  db: Database,
  params: {
    session_id: string;
    exam_id?: string;
    user_id: string;
    user_name: string;
    user_role: string;
    audio_data_url: string;
    duration_seconds: number;
    file_size_bytes?: number;
    mime_type?: string;
    warning_number?: number;
    submitted_by?: string;
  }
): VoiceEvidenceRecord {
  const id = `VOICE-EV-${uuidv4().substring(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  const diskRef = saveEvidenceBufferToDisk(params.audio_data_url, 'audio', id, 'webm');

  executeRun(
    db,
    `INSERT INTO proctor_voice_evidence (
      id, session_id, exam_id, user_id, user_name, user_role,
      audio_data_url, storage_reference, duration_seconds, file_size_bytes, mime_type,
      event_type, warning_number, submitted_by, recipient, review_status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VOICE_RECORDING_EVIDENCE', ?, ?, 'CBI Chief Vigilance & Security Auditor', 'PENDING_REVIEW', ?)`,
    [
      id,
      params.session_id,
      params.exam_id || null,
      params.user_id,
      params.user_name,
      params.user_role,
      params.audio_data_url,
      diskRef || null,
      Math.round(params.duration_seconds || 0),
      params.file_size_bytes || 0,
      params.mime_type || 'audio/webm',
      params.warning_number || 0,
      params.submitted_by || params.user_name,
      now,
    ]
  );

  // Also log an authority leak event in timeline for the auditor
  recordAuthorityLeakEvent(db, {
    session_id: params.session_id,
    user_id: params.user_id,
    user_role: params.user_role,
    exam_id: params.exam_id,
    event_type: 'VOICE_EVIDENCE_CREATED',
    severity: params.warning_number && params.warning_number > 0 ? 'HIGH' : 'MEDIUM',
    metadata: {
      evidence_id: id,
      duration_seconds: params.duration_seconds,
      warning_number: params.warning_number || 0,
      recipient: 'CBI Chief Vigilance & Security Auditor',
      audio_format: params.mime_type || 'audio/webm',
    },
  });

  return {
    id,
    session_id: params.session_id,
    exam_id: params.exam_id,
    user_id: params.user_id,
    user_name: params.user_name,
    user_role: params.user_role,
    audio_data_url: params.audio_data_url,
    storage_reference: diskRef || undefined,
    duration_seconds: params.duration_seconds || 0,
    file_size_bytes: params.file_size_bytes || 0,
    mime_type: params.mime_type || 'audio/webm',
    event_type: 'VOICE_RECORDING_EVIDENCE',
    warning_number: params.warning_number || 0,
    submitted_by: params.submitted_by || params.user_name,
    recipient: 'CBI Chief Vigilance & Security Auditor',
    review_status: 'PENDING_REVIEW',
    created_at: now,
  };
}

export function getVoiceEvidenceBySession(db: Database, sessionId: string): VoiceEvidenceRecord[] {
  return executeQuery(
    db,
    'SELECT * FROM proctor_voice_evidence WHERE session_id = ? ORDER BY created_at DESC',
    [sessionId]
  ) as VoiceEvidenceRecord[];
}

export function getUnifiedSessionEvidence(db: Database, sessionId: string) {
  const cameraEv = getCameraEvidenceBySession(db, sessionId);
  const voiceEv = getVoiceEvidenceBySession(db, sessionId);

  const unified = [
    ...cameraEv.map(c => ({
      id: c.id,
      session_id: c.session_id,
      exam_id: c.exam_id,
      user_id: c.user_id,
      user_name: c.user_name,
      user_role: c.user_role,
      type: 'CAMERA_SNAPSHOT' as const,
      file_url: c.image_data_url,
      storage_reference: c.storage_reference,
      mime_type: c.mime_type,
      file_size_bytes: c.file_size_bytes,
      event_type: c.event_type,
      warning_number: c.warning_number,
      presence_status: c.presence_status,
      submitted_to: c.recipient,
      review_status: c.review_status,
      created_at: c.created_at,
    })),
    ...voiceEv.map(v => ({
      id: v.id,
      session_id: v.session_id,
      exam_id: v.exam_id,
      user_id: v.user_id,
      user_name: v.user_name,
      user_role: v.user_role,
      type: 'VOICE_EVIDENCE' as const,
      file_url: v.audio_data_url,
      storage_reference: v.storage_reference,
      duration_seconds: v.duration_seconds,
      mime_type: v.mime_type,
      file_size_bytes: v.file_size_bytes,
      event_type: v.event_type,
      warning_number: v.warning_number,
      submitted_to: v.recipient,
      review_status: v.review_status,
      created_at: v.created_at,
    })),
  ];

  unified.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return unified;
}

export function getAuthoritySurveillanceDashboard(db: Database, orgId?: string) {
  let sql = `
    SELECT
      s.*,
      COALESCE(e.name, 'Question Bank / System Enclave') as exam_name,
      (SELECT COUNT(*) FROM proctor_camera_evidence c WHERE c.session_id = s.id) as camera_evidence_count,
      (SELECT COUNT(*) FROM proctor_voice_evidence v WHERE v.session_id = s.id) as voice_evidence_count
    FROM authority_proctor_sessions s
    LEFT JOIN examinations e ON s.exam_id = e.id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (orgId && orgId !== 'GLOBAL') {
    sql += ' AND s.org_id = ?';
    params.push(orgId);
  }
  sql += ' ORDER BY s.updated_at DESC';

  const rawSessions = executeQuery(db, sql, params);
  const sessions = rawSessions.map((s: any) => {
    const camCount = Number(s.camera_evidence_count) || 0;
    const voiceCount = Number(s.voice_evidence_count) || 0;
    return {
      ...s,
      camera_evidence_count: camCount,
      voice_evidence_count: voiceCount,
      has_camera_evidence: Boolean(s.verification_snapshot || camCount > 0),
      has_voice_evidence: Boolean(voiceCount > 0),
    };
  });

  const totalActive = sessions.filter((s: any) => s.status === 'ACTIVE').length;
  const highRisk = sessions.filter(
    (s: any) => s.leak_risk_level === 'HIGH' || s.leak_risk_level === 'CRITICAL' || s.status === 'FLAGGED_FOR_REVIEW'
  ).length;
  const shoulderSurfingAlerts = sessions.filter((s: any) => s.face_status === 'SHOULDER_SURFING_DETECTED').length;
  const lockedDown = sessions.filter(
    (s: any) => s.status === 'LOCKED' || s.status === 'FLAGGED_FOR_REVIEW' || s.emergency_locked === 1
  ).length;

  return {
    metrics: {
      total_active_sessions: totalActive,
      high_risk_sessions: highRisk,
      shoulder_surfing_alerts: shoulderSurfingAlerts,
      locked_sessions: lockedDown,
    },
    sessions,
  };
}

export function issueAuthorityWarning(
  db: Database,
  sessionId: string,
  reason: string,
  details?: Record<string, any> | string
): {
  warning_count: number;
  max_warnings: number;
  warnings_remaining: number;
  status: string;
  is_locked: boolean;
  message: string;
  evidence_id?: string;
} {
  const rows = executeQuery(
    db,
    'SELECT id, warning_count, status, user_id, user_name, user_role, exam_id FROM authority_proctor_sessions WHERE id = ?',
    [sessionId]
  );
  if (!rows || rows.length === 0) {
    throw new Error('Authority proctor session not found');
  }

  const session = rows[0];
  const currentCount = Number(session.warning_count) || 0;
  // Strictly capped at 3: Never increment past 3!
  const newCount = Math.min(3, currentCount + 1);
  const now = new Date().toISOString();

  let newStatus = session.status || 'ACTIVE';
  let isLocked = false;

  if (newCount >= 3) {
    newStatus = 'FLAGGED_FOR_REVIEW';
    isLocked = true;
  }

  executeRun(
    db,
    `UPDATE authority_proctor_sessions SET
      warning_count = ?,
      status = ?,
      emergency_locked = CASE WHEN ? = 1 THEN 1 ELSE emergency_locked END,
      emergency_lock_reason = CASE WHEN ? = 1 THEN ? ELSE emergency_lock_reason END,
      updated_at = ?
    WHERE id = ?`,
    [
      newCount,
      newStatus,
      isLocked ? 1 : 0,
      isLocked ? 1 : 0,
      isLocked ? `3/3 Warnings Exceeded: ${reason}` : null,
      now,
      sessionId,
    ]
  );

  let evidenceId: string | undefined = undefined;
  const detailsObj: Record<string, any> = typeof details === 'string' ? { violation: details } : (details || {});

  // If violation snapshot was captured, associate with this warning
  if (detailsObj.snapshot) {
    try {
      const snapEv = saveCameraEvidence(db, {
        session_id: sessionId,
        exam_id: session.exam_id,
        user_id: session.user_id,
        user_name: session.user_name,
        user_role: session.user_role,
        image_data_url: detailsObj.snapshot,
        event_type: `WARNING_${newCount}_SNAPSHOT`,
        presence_status: detailsObj.presence_status || 'UNCERTAIN',
        warning_number: newCount,
        recipient: 'CBI Chief Vigilance & Security Auditor',
      });
      evidenceId = snapEv.id;
    } catch (err) {
      console.warn('Failed to associate warning snapshot:', err);
    }
  }

  // Record warning event in proctor_events timeline
  recordAuthorityLeakEvent(db, {
    session_id: sessionId,
    user_id: session.user_id,
    user_role: session.user_role,
    exam_id: session.exam_id,
    event_type: `SECURITY_WARNING_${newCount}`,
    severity: newCount === 3 ? 'CRITICAL' : newCount === 2 ? 'HIGH' : 'MEDIUM',
    metadata: {
      warning_number: newCount,
      max_warnings: 3,
      reason,
      evidence_id: evidenceId || null,
      ...detailsObj,
    },
    snapshot_thumbnail: detailsObj.snapshot || null,
  });

  // If reached 3 warnings, generate audit escalation event
  if (newCount >= 3) {
    recordAuthorityLeakEvent(db, {
      session_id: sessionId,
      user_id: session.user_id,
      user_role: session.user_role,
      exam_id: session.exam_id,
      event_type: 'AUDIT_ESCALATION',
      severity: 'CRITICAL',
      metadata: {
        recipient: 'CBI Chief Vigilance & Security Auditor',
        priority: 'HIGH',
        status: 'PENDING_REVIEW',
        warning_count: 3,
        reason: `Threshold of 3 warnings reached: ${reason}`,
      },
      snapshot_thumbnail: detailsObj.snapshot || null,
    });
  }

  return {
    warning_count: newCount,
    max_warnings: 3,
    warnings_remaining: Math.max(0, 3 - newCount),
    status: newStatus,
    is_locked: isLocked,
    evidence_id: evidenceId,
    message:
      newCount === 1
        ? 'Warning 1 of 3: Suspicious activity logged. Please maintain continuous camera presence.'
        : newCount === 2
        ? 'Warning 2 of 3: FINAL WARNING. The next infraction will flag your session for immediate auditor review.'
        : 'Warning 3 of 3: Violation threshold reached. Session flagged for forensic review by CBI Chief Vigilance & Security Auditor.',
  };
}

export interface TranslatorSecurityState {
  user_id: string;
  current_session_id: string | null;
  warning_count: number;
  is_locked: boolean;
  lock_reason: string | null;
  locked_session_id: string | null;
  locked_at: string | null;
}

export function getTranslatorSecurityState(db: Database, userId: string): TranslatorSecurityState {
  const rows = executeQuery(
    db,
    `SELECT tss.user_id, tss.current_session_id, s.warning_count,
            tss.is_locked, tss.lock_reason, tss.locked_session_id, tss.locked_at
     FROM translator_security_state tss
     LEFT JOIN authority_proctor_sessions s ON s.id = tss.current_session_id
     WHERE tss.user_id = ?`,
    [userId]
  );
  const state = rows[0];
  return {
    user_id: userId,
    current_session_id: state?.current_session_id || null,
    warning_count: Math.min(3, Math.max(0, Number(state?.warning_count) || 0)),
    is_locked: Number(state?.is_locked) === 1,
    lock_reason: state?.lock_reason || null,
    locked_session_id: state?.locked_session_id || null,
    locked_at: state?.locked_at || null,
  };
}

export function initializeTranslatorSecuritySession(
  db: Database,
  userId: string,
  sessionId: string
): TranslatorSecurityState {
  return executeTransactionWithResult(db, (run, query) => {
    const current = query(
      'SELECT is_locked, current_session_id FROM translator_security_state WHERE user_id = ?',
      [userId]
    )[0];
    if (Number(current?.is_locked) === 1) {
      throw new Error('Translator security access is locked pending authorized review.');
    }
    const session = query(
      `SELECT status FROM authority_proctor_sessions
       WHERE id = ? AND user_id = ? AND workspace_type = 'TRANSLATOR_PORTAL'`,
      [sessionId, userId]
    )[0];
    if (!session) {
      throw new Error('Translator security session ownership could not be verified.');
    }
    const now = new Date().toISOString();
    run(
      `INSERT INTO translator_security_state (
         user_id, current_session_id, is_locked, updated_at
       ) VALUES (?, ?, 0, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         current_session_id = excluded.current_session_id,
         updated_at = excluded.updated_at`,
      [userId, sessionId, now]
    );
    return getTranslatorSecurityState(db, userId);
  });
}

export interface TranslatorIncidentInput {
  session_id: string;
  user_id: string;
  incident_id: string;
  event_type: string;
  status: 'ACTIVE' | 'CLEARED';
  confidence?: number;
  detection_result?: Record<string, unknown>;
  detected_at?: string;
}

export interface TranslatorIncidentResult extends TranslatorSecurityState {
  incident_id: string;
  incident_status: 'ACTIVE' | 'CLEARED';
  is_new_warning: boolean;
  warnings_remaining: number;
}

export function recordTranslatorSecurityIncident(
  db: Database,
  input: TranslatorIncidentInput
): TranslatorIncidentResult {
  return executeTransactionWithResult(db, (run, query) => {
    const session = query(
      `SELECT id, user_id, user_name, user_role, exam_id, status
       FROM authority_proctor_sessions
       WHERE id = ? AND user_id = ? AND workspace_type = 'TRANSLATOR_PORTAL'`,
      [input.session_id, input.user_id]
    )[0];
    if (!session) {
      throw new Error('The translator security session is not owned by this account.');
    }
    const stateRow = query(
      `SELECT tss.user_id, tss.current_session_id, tss.is_locked,
              tss.lock_reason, tss.locked_session_id, tss.locked_at, s.warning_count
       FROM translator_security_state tss
       LEFT JOIN authority_proctor_sessions s ON s.id = tss.current_session_id
       WHERE tss.user_id = ?`,
      [input.user_id]
    )[0];
    if (!stateRow || stateRow.current_session_id !== input.session_id) {
      throw new Error('The translator security session is no longer current.');
    }
    if (Number(stateRow.is_locked) === 1 && input.status === 'ACTIVE') {
      return {
        ...getTranslatorSecurityState(db, input.user_id),
        incident_id: input.incident_id,
        incident_status: input.status,
        is_new_warning: false,
        warnings_remaining: 0,
      };
    }

    const now = new Date().toISOString();
    const applyWarningState = (warningCount: number, locked: boolean, reason: string, incidentId: string, eventType: string) => {
      run(
        `UPDATE translator_security_state SET
           is_locked = ?,
           lock_reason = CASE WHEN ? = 1 THEN ? ELSE lock_reason END,
           locked_session_id = CASE WHEN ? = 1 THEN ? ELSE locked_session_id END,
           locked_at = CASE WHEN ? = 1 THEN ? ELSE locked_at END,
           updated_at = ?
         WHERE user_id = ? AND current_session_id = ? AND is_locked = 0`,
        [
          locked ? 1 : 0, locked ? 1 : 0, reason, locked ? 1 : 0, input.session_id,
          locked ? 1 : 0, locked ? now : null, now, input.user_id, input.session_id,
        ]
      );
      run(
        `UPDATE authority_proctor_sessions SET
           warning_count = ?,
           status = CASE WHEN ? = 1 THEN 'LOCKED' ELSE status END,
           emergency_locked = CASE WHEN ? = 1 THEN 1 ELSE emergency_locked END,
           emergency_lock_reason = CASE WHEN ? = 1 THEN ? ELSE emergency_lock_reason END,
           locked_by = CASE WHEN ? = 1 THEN 'SECURITY_POLICY' ELSE locked_by END,
           updated_at = ?
         WHERE id = ? AND user_id = ?`,
        [
          warningCount, locked ? 1 : 0, locked ? 1 : 0, locked ? 1 : 0, reason,
          locked ? 1 : 0, now, input.session_id, input.user_id,
        ]
      );
      if (!locked) return;

      const lockEventId = `TRANSLATOR-SECURITY-LOCK-${uuidv4()}`;
      const incidentReferences = query(
        `SELECT incident_id FROM translator_security_incidents
         WHERE session_id = ? AND user_id = ? AND warning_count > 0
         ORDER BY detected_at ASC`,
        [input.session_id, input.user_id]
      ).map((row: { incident_id: string }) => row.incident_id);
      run(
        `INSERT INTO proctor_events (
           id, session_id, attempt_id, user_id, user_role, exam_id, event_type,
           severity, risk_points, timestamp, metadata_json, snapshot_thumbnail, created_at
         ) VALUES (?, ?, NULL, ?, 'TRANSLATOR', ?, 'TRANSLATOR_SECURITY_LOCKED', 'CRITICAL', 0, ?, ?, NULL, ?)`,
        [
          lockEventId,
          input.session_id,
          input.user_id,
          session.exam_id,
          now,
          JSON.stringify({
            lock_reason: reason,
            warning_count: warningCount,
            translator_id: input.user_id,
            session_id: input.session_id,
            locked_at: now,
            incident_id: incidentId,
            incident_type: eventType,
            incident_references: incidentReferences,
          }),
          now,
        ]
      );
    };

    const existing = query(
      `SELECT status, warning_count, event_id FROM translator_security_incidents
       WHERE session_id = ? AND incident_id = ? AND user_id = ?`,
      [input.session_id, input.incident_id, input.user_id]
    )[0];
    if (input.status === 'CLEARED') {
      if (!existing) {
        throw new Error('No active event was found for this incident.');
      }
      let promotedWarning = false;
      if (existing.status === 'ACTIVE') {
        const eventId = existing.event_id;
        const eventRows = eventId
          ? query('SELECT metadata_json FROM proctor_events WHERE id = ?', [eventId])
          : [];
        let metadata: Record<string, unknown> = {};
        try {
          metadata = JSON.parse(eventRows[0]?.metadata_json || '{}');
        } catch {
          metadata = {};
        }
        run(
          `UPDATE translator_security_incidents
           SET status = 'CLEARED', cleared_at = ?
           WHERE session_id = ? AND incident_id = ? AND user_id = ? AND status = 'ACTIVE'`,
          [now, input.session_id, input.incident_id, input.user_id]
        );
        if (eventId) {
          run('UPDATE proctor_events SET metadata_json = ? WHERE id = ?', [
            JSON.stringify({ ...metadata, status: 'CLEARED', cleared_at: now }),
            eventId,
          ]);
        }

        if (Number(existing.warning_count) > 0 && Number(stateRow.is_locked) !== 1) {
          const pending = query(
            `SELECT incident_id, event_type, event_id, confidence, detection_result_json, detected_at
             FROM translator_security_incidents
             WHERE session_id = ? AND user_id = ? AND status = 'ACTIVE' AND warning_count = 0
               AND event_type != 'IDENTITY_TEMPLATE_NOT_PROVISIONED'
             ORDER BY detected_at ASC LIMIT 1`,
            [input.session_id, input.user_id]
          )[0];
          if (pending) {
            const currentWarningCount = Number(
              query('SELECT warning_count FROM authority_proctor_sessions WHERE id = ?', [input.session_id])[0]?.warning_count
            ) || 0;
            const warningCount = Math.min(3, currentWarningCount + 1);
            const locked = warningCount >= 3;
            const reason = `Three confirmed translator security incidents reached the warning limit. Last incident: ${pending.event_type}.`;
            let pendingMetadata: Record<string, unknown> = {};
            try {
              pendingMetadata = JSON.parse(
                query('SELECT metadata_json FROM proctor_events WHERE id = ?', [pending.event_id])[0]?.metadata_json || '{}'
              );
            } catch {
              pendingMetadata = {};
            }
            const warningEvent = `TRANSLATOR_SECURITY_WARNING_${warningCount}`;
            run(
              `UPDATE translator_security_incidents SET warning_count = ?
               WHERE session_id = ? AND incident_id = ? AND user_id = ? AND status = 'ACTIVE' AND warning_count = 0`,
              [warningCount, input.session_id, pending.incident_id, input.user_id]
            );
            run(
              `UPDATE proctor_events SET event_type = ?, severity = ?, metadata_json = ? WHERE id = ?`,
              [
                warningEvent,
                warningCount === 3 ? 'CRITICAL' : warningCount === 2 ? 'HIGH' : 'MEDIUM',
                JSON.stringify({
                  ...pendingMetadata,
                  warning_number: warningCount,
                  pending_warning: false,
                  promoted_at: now,
                  lock_reason: locked ? reason : null,
                }),
                pending.event_id,
              ]
            );
            applyWarningState(warningCount, locked, reason, pending.incident_id, pending.event_type);
            promotedWarning = true;
          }
        }
      }
      const currentState = getTranslatorSecurityState(db, input.user_id);
      return {
        ...currentState,
        incident_id: input.incident_id,
        incident_status: 'CLEARED',
        is_new_warning: promotedWarning,
        warnings_remaining: Math.max(0, 3 - currentState.warning_count),
      };
    }

    if (existing) {
      return {
        ...getTranslatorSecurityState(db, input.user_id),
        incident_id: input.incident_id,
        incident_status: existing.status === 'CLEARED' ? 'CLEARED' : 'ACTIVE',
        is_new_warning: false,
        warnings_remaining: Math.max(0, 3 - Number(stateRow.warning_count || 0)),
      };
    }

    const countsAsWarning = input.event_type !== 'IDENTITY_TEMPLATE_NOT_PROVISIONED';
    const activeWarning = countsAsWarning && query(
      `SELECT incident_id FROM translator_security_incidents
       WHERE session_id = ? AND user_id = ? AND status = 'ACTIVE' AND warning_count > 0
       LIMIT 1`,
      [input.session_id, input.user_id]
    ).length > 0;
    const isCountedWarning = countsAsWarning && !activeWarning;
    const warningCount = isCountedWarning
      ? Math.min(3, Number(stateRow.warning_count || 0) + 1)
      : Number(stateRow.warning_count || 0);
    const locked = isCountedWarning && warningCount >= 3;
    const reason = `Three confirmed translator security incidents reached the warning limit. Last incident: ${input.event_type}.`;
    const eventId = `TRANSLATOR-SECURITY-${uuidv4()}`;
    const warningEvent = isCountedWarning
      ? `TRANSLATOR_SECURITY_WARNING_${warningCount}`
      : countsAsWarning ? 'TRANSLATOR_SECURITY_INCIDENT_PENDING' : 'TRANSLATOR_IDENTITY_TEMPLATE_UNAVAILABLE';
    const detectionResult = JSON.stringify(input.detection_result || {});
    const metadata = JSON.stringify({
      incident_id: input.incident_id,
      incident_type: input.event_type,
      status: 'ACTIVE',
      confidence: input.confidence ?? null,
      detection_result: input.detection_result || {},
      detected_at: input.detected_at || now,
      warning_number: isCountedWarning ? warningCount : 0,
      pending_warning: countsAsWarning && !isCountedWarning,
      max_warnings: 3,
      translator_id: input.user_id,
      session_id: input.session_id,
      review_label: 'Potential security violation; automated detection is not a finding of misconduct.',
      lock_reason: locked ? reason : null,
    });

    run(
      `INSERT INTO translator_security_incidents (
         session_id, incident_id, user_id, event_type, status, confidence,
         warning_count, detection_result_json, detected_at, event_id
       ) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?)`,
      [
        input.session_id,
        input.incident_id,
        input.user_id,
        input.event_type,
        input.confidence ?? null,
        isCountedWarning ? warningCount : 0,
        detectionResult,
        now,
        eventId,
      ]
    );
    if (isCountedWarning) {
      run(
        `UPDATE authority_proctor_sessions SET warning_count = ?, updated_at = ?
         WHERE id = ? AND user_id = ? AND status = 'ACTIVE'`,
        [warningCount, now, input.session_id, input.user_id]
      );
    }
    run(
      `INSERT INTO proctor_events (
         id, session_id, attempt_id, user_id, user_role, exam_id, event_type,
         severity, risk_points, timestamp, metadata_json, snapshot_thumbnail, created_at
       ) VALUES (?, ?, NULL, ?, 'TRANSLATOR', ?, ?, ?, 0, ?, ?, NULL, ?)`,
      [
        eventId,
        input.session_id,
        input.user_id,
        session.exam_id,
        warningEvent,
        !isCountedWarning ? 'LOW' : warningCount === 3 ? 'CRITICAL' : warningCount === 2 ? 'HIGH' : 'MEDIUM',
        now,
        metadata,
        now,
      ]
    );
    if (isCountedWarning) applyWarningState(warningCount, locked, reason, input.incident_id, input.event_type);

    return {
      ...getTranslatorSecurityState(db, input.user_id),
      incident_id: input.incident_id,
      incident_status: 'ACTIVE',
      is_new_warning: isCountedWarning,
      warnings_remaining: Math.max(0, 3 - warningCount),
    };
  });
}

export function recoverTranslatorSecurityLock(
  db: Database,
  sessionId: string,
  actor: { id: string; full_name: string; role: string; org_id?: string },
  reason: string
): TranslatorSecurityState {
  return executeTransactionWithResult(db, (run, query) => {
    const session = query(
      `SELECT user_id, org_id, status FROM authority_proctor_sessions
       WHERE id = ? AND workspace_type = 'TRANSLATOR_PORTAL'`,
      [sessionId]
    )[0];
    if (!session) throw new Error('Translator security session not found.');
    if (actor.role === 'ORG_OWNER' && actor.org_id !== session.org_id) {
      throw new Error('Organization owners may recover translator locks only within their organization.');
    }
    const state = query(
      `SELECT tss.user_id, tss.is_locked, tss.locked_session_id, s.warning_count
       FROM translator_security_state tss
       LEFT JOIN authority_proctor_sessions s ON s.id = tss.locked_session_id
       WHERE tss.user_id = ?`,
      [session.user_id]
    )[0];
    if (!state || Number(state.is_locked) !== 1 || state.locked_session_id !== sessionId) {
      throw new Error('No active warning lock exists for this translator session.');
    }

    const now = new Date().toISOString();
    const eventId = `TRANSLATOR-SECURITY-RECOVERY-${uuidv4()}`;
    run(
      `UPDATE translator_security_state SET
         current_session_id = NULL, is_locked = 0,
         lock_reason = NULL, locked_session_id = NULL, locked_at = NULL,
         recovered_at = ?, recovered_by = ?, updated_at = ?
       WHERE user_id = ? AND is_locked = 1 AND locked_session_id = ?`,
      [now, actor.id, now, session.user_id, sessionId]
    );
    run(
      `UPDATE authority_proctor_sessions SET
         status = 'COMPLETED', emergency_locked = 0,
         emergency_lock_reason = COALESCE(emergency_lock_reason, 'Warning lock recovered; a new verified session is required.'),
         updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [now, sessionId, session.user_id]
    );
    run(
      `INSERT INTO proctor_events (
         id, session_id, attempt_id, user_id, user_role, exam_id, event_type,
         severity, risk_points, timestamp, metadata_json, snapshot_thumbnail, created_at
       ) VALUES (?, ?, NULL, ?, ?, NULL, 'TRANSLATOR_SECURITY_LOCK_RECOVERED', 'HIGH', 0, ?, ?, NULL, ?)`,
      [
        eventId,
        sessionId,
        actor.id,
        actor.role,
        now,
        JSON.stringify({
          translator_id: session.user_id,
          session_id: sessionId,
          prior_warning_count: Number(state.warning_count) || 3,
          reason,
          recovered_by: actor.id,
          recovered_by_name: actor.full_name,
          recovered_at: now,
        }),
        now,
      ]
    );
    return getTranslatorSecurityState(db, session.user_id);
  });
}

export function handleAuditorReviewAction(
  db: Database,
  sessionId: string,
  action: 'MARK_REVIEWED' | 'ESCALATE' | 'CLOSE_CASE',
  remarks: string,
  auditorUser: { id?: string; full_name?: string; role?: string } | string
): { success: boolean; message: string; session: AuthorityProctorSession } {
  const rows = executeQuery(db, 'SELECT * FROM authority_proctor_sessions WHERE id = ?', [sessionId]);
  if (!rows || rows.length === 0) {
    throw new Error('Authority proctor session not found');
  }
  const session = rows[0];
  const now = new Date().toISOString();

  const auditor = typeof auditorUser === 'object' && auditorUser !== null
    ? {
        id: auditorUser.id || 'usr-auditor',
        full_name: auditorUser.full_name || 'CBI Chief Vigilance & Security Auditor',
        role: auditorUser.role || 'AUDITOR',
      }
    : {
        id: 'usr-auditor',
        full_name: typeof auditorUser === 'string' && auditorUser.trim() ? auditorUser : 'CBI Chief Vigilance & Security Auditor',
        role: 'AUDITOR',
      };

  let newStatus = session.status;
  let newReviewStatus = 'REVIEWED';
  let message = '';

  if (action === 'MARK_REVIEWED') {
    newReviewStatus = 'REVIEWED';
    message = `Session verified and marked reviewed by ${auditor.full_name}.`;
    executeRun(db, `UPDATE proctor_camera_evidence SET review_status = 'REVIEWED' WHERE session_id = ?`, [sessionId]);
    executeRun(db, `UPDATE proctor_voice_evidence SET review_status = 'REVIEWED' WHERE session_id = ?`, [sessionId]);
  } else if (action === 'ESCALATE') {
    newStatus = 'FLAGGED_FOR_REVIEW';
    newReviewStatus = 'ESCALATED';
    message = `Session escalated to CBI Chief Vigilance & Security Auditor for formal inquiry.`;
    executeRun(
      db,
      `UPDATE authority_proctor_sessions SET emergency_locked = 1, emergency_lock_reason = ? WHERE id = ?`,
      [`Auditor Escalation: ${remarks || 'Suspicious behavior flagged for formal investigation.'}`, sessionId]
    );
  } else if (action === 'CLOSE_CASE') {
    newStatus = 'COMPLETED';
    newReviewStatus = 'RESOLVED';
    message = `Forensic audit case closed and archived.`;
  }

  executeRun(
    db,
    `UPDATE authority_proctor_sessions SET
      status = ?,
      review_status = ?,
      auditor_remarks = ?,
      reviewed_by = ?,
      reviewed_at = ?,
      updated_at = ?
    WHERE id = ?`,
    [newStatus, newReviewStatus, remarks || '', auditor.full_name, now, now, sessionId]
  );

  recordAuthorityLeakEvent(db, {
    session_id: sessionId,
    user_id: auditor.id,
    user_role: auditor.role,
    exam_id: session.exam_id,
    event_type: `AUDITOR_ACTION_${action}`,
    severity: action === 'ESCALATE' ? 'CRITICAL' : 'LOW',
    metadata: {
      action,
      auditor_name: auditor.full_name,
      remarks,
      previous_status: session.status,
      new_status: newStatus,
    },
  });

  const updatedRows = executeQuery(db, 'SELECT * FROM authority_proctor_sessions WHERE id = ?', [sessionId]);
  return {
    success: true,
    message,
    session: updatedRows[0] as AuthorityProctorSession,
  };
}
