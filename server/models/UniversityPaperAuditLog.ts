import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IUniversityPaperAuditLog {
  _id: string;
  id: string;
  exam_id: string;
  paper_id?: string;
  action_type: string;
  user_id?: string;
  user_role?: string;
  details_json?: string;
  ip_address?: string;
  timestamp: string;
}

const UniversityPaperAuditLogSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    exam_id: { type: String, required: true, index: true },
    paper_id: { type: String, index: true },
    action_type: { type: String, required: true, index: true },
    user_id: { type: String, index: true },
    user_role: { type: String },
    details_json: { type: String },
    ip_address: { type: String },
    timestamp: { type: String, required: true, index: true },
  },
  baseSchemaOptions
);

// Prevent updates and deletes on the immutable university paper audit log
UniversityPaperAuditLogSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'] as any, function () {
  throw new Error('IMMUTABLE_AUDIT_LOG: University paper audit logs cannot be updated or deleted.');
});

export const UniversityPaperAuditLogModel = mongoose.models.UniversityPaperAuditLog || mongoose.model<IUniversityPaperAuditLog>('UniversityPaperAuditLog', UniversityPaperAuditLogSchema, 'university_paper_audit_logs');
export default UniversityPaperAuditLogModel;
