import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { AuditEventModel, IAuditEvent } from '../models/AuditEvent.ts';
import { SecurityEventModel, ISecurityEvent } from '../models/SecurityEvent.ts';
import { CompetitivePaperAuditLogModel, ICompetitivePaperAuditLog } from '../models/CompetitivePaperAuditLog.ts';
import { UniversityPaperAuditLogModel, IUniversityPaperAuditLog } from '../models/UniversityPaperAuditLog.ts';

export class AuditRepository {
  /**
   * Appends an immutable audit event to the cryptographically chained ledger.
   * Strictly append-only: updates and deletes are prohibited.
   */
  static async appendAuditEvent(data: {
    id?: string;
    event_type: string;
    user_id?: string;
    user_email?: string;
    role?: string;
    org_id?: string;
    exam_id?: string;
    device_id?: string;
    ip_address?: string;
    status?: string;
    tx_ref?: string;
    details_json?: string;
    created_at?: string;
  }): Promise<IAuditEvent> {
    const id = data.id || uuidv4();
    const created_at = data.created_at || new Date().toISOString();
    const tx_ref = data.tx_ref || `0x${crypto.createHash('sha256').update(id + created_at).digest('hex')}`;

    // Compute cryptographic block hash chain from previous ledger entry
    const lastEvent = await (AuditEventModel as any).findOne().sort({ created_at: -1, _id: -1 }).select('tx_hash').lean();
    const prev_hash = (lastEvent as any)?.tx_hash || '0x0000000000000000000000000000000000000000000000000000000000000000';
    const payloadToHash = `${prev_hash}:${data.event_type}:${data.user_id || ''}:${created_at}:${data.details_json || ''}`;
    const tx_hash = `0x${crypto.createHash('sha256').update(payloadToHash).digest('hex')}`;

    return (await (AuditEventModel as any).create({
      _id: id,
      id,
      event_type: data.event_type,
      user_id: data.user_id,
      user_email: data.user_email,
      role: data.role,
      org_id: data.org_id,
      exam_id: data.exam_id,
      device_id: data.device_id,
      ip_address: data.ip_address,
      status: data.status || 'SUCCESS',
      tx_ref,
      details_json: data.details_json,
      tx_hash,
      prev_hash,
      created_at,
    })) as IAuditEvent;
  }

  static async appendSecurityEvent(data: {
    id?: string;
    event_type: string;
    severity: string;
    risk_score: number;
    user_id?: string;
    org_id?: string;
    ip_address?: string;
    details_json?: string;
    resolved?: number;
    timestamp?: string;
  }): Promise<ISecurityEvent> {
    const id = data.id || uuidv4();
    const timestamp = data.timestamp || new Date().toISOString();

    return (await (SecurityEventModel as any).create({
      _id: id,
      id,
      event_type: data.event_type,
      severity: data.severity,
      risk_score: data.risk_score,
      user_id: data.user_id,
      org_id: data.org_id,
      ip_address: data.ip_address,
      details_json: data.details_json,
      resolved: data.resolved ?? 0,
      timestamp,
    })) as ISecurityEvent;
  }

  static async appendCompetitivePaperAudit(data: {
    id?: string;
    paper_id: string;
    exam_id: string;
    org_id: string;
    action_type: string;
    user_id?: string;
    user_role?: string;
    details_json?: string;
    ip_address?: string;
    device_id?: string;
    server_timestamp?: string;
    client_timestamp?: string;
    status?: string;
  }): Promise<ICompetitivePaperAuditLog> {
    const id = data.id || uuidv4();
    const server_timestamp = data.server_timestamp || new Date().toISOString();

    return (await (CompetitivePaperAuditLogModel as any).create({
      _id: id,
      id,
      paper_id: data.paper_id,
      exam_id: data.exam_id,
      org_id: data.org_id,
      action_type: data.action_type,
      user_id: data.user_id,
      user_role: data.user_role,
      details_json: data.details_json,
      ip_address: data.ip_address,
      device_id: data.device_id,
      server_timestamp,
      client_timestamp: data.client_timestamp || server_timestamp,
      status: data.status || 'SUCCESS',
    })) as ICompetitivePaperAuditLog;
  }

  static async appendUniversityPaperAudit(data: {
    id?: string;
    exam_id: string;
    paper_id?: string;
    action_type: string;
    user_id?: string;
    user_role?: string;
    details_json?: string;
    ip_address?: string;
    timestamp?: string;
  }): Promise<IUniversityPaperAuditLog> {
    const id = data.id || uuidv4();
    const timestamp = data.timestamp || new Date().toISOString();

    return (await (UniversityPaperAuditLogModel as any).create({
      _id: id,
      id,
      exam_id: data.exam_id,
      paper_id: data.paper_id,
      action_type: data.action_type,
      user_id: data.user_id,
      user_role: data.user_role,
      details_json: data.details_json,
      ip_address: data.ip_address,
      timestamp,
    })) as IUniversityPaperAuditLog;
  }

  static async queryAuditEvents(filter: any = {}, limit: number = 200): Promise<IAuditEvent[]> {
    return (await (AuditEventModel as any).find(filter).sort({ created_at: -1 }).limit(limit).lean()) as IAuditEvent[];
  }

  static async querySecurityEvents(filter: any = {}, limit: number = 200): Promise<ISecurityEvent[]> {
    return (await (SecurityEventModel as any).find(filter).sort({ timestamp: -1 }).limit(limit).lean()) as ISecurityEvent[];
  }
}

export default AuditRepository;

