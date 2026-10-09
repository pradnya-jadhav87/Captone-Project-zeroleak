import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface ICompetitivePaperAuditLog {
  _id: string;
  id: string;
  paper_id: string;
  exam_id: string;
  org_id: string;
  action_type: string;
  user_id?: string;
  user_role?: string;
  details_json?: string;
  ip_address?: string;
  device_id?: string;
  server_timestamp: string;
  client_timestamp?: string;
  status?: string;
}

const CompetitivePaperAuditLogSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    paper_id: { type: String, required: true, index: true },
    exam_id: { type: String, required: true, index: true },
    org_id: { type: String, required: true, index: true },
    action_type: { type: String, required: true, index: true },
    user_id: { type: String, index: true },
    user_role: { type: String },
    details_json: { type: String },
    ip_address: { type: String },
    device_id: { type: String },
    server_timestamp: { type: String, required: true, index: true },
    client_timestamp: { type: String },
    status: { type: String, default: 'SUCCESS' },
  },
  baseSchemaOptions
);

// Prevent updates and deletes on the immutable paper audit log
CompetitivePaperAuditLogSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'] as any, function () {
  throw new Error('IMMUTABLE_AUDIT_LOG: Competitive paper audit logs cannot be updated or deleted.');
});

export const CompetitivePaperAuditLogModel = mongoose.models.CompetitivePaperAuditLog || mongoose.model<ICompetitivePaperAuditLog>('CompetitivePaperAuditLog', CompetitivePaperAuditLogSchema, 'competitive_paper_audit_logs');
export default CompetitivePaperAuditLogModel;
