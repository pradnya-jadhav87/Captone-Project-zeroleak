import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IAuditEvent {
  _id: string;
  id: string;
  event_type: string;
  user_id?: string;
  user_email?: string;
  role?: string;
  org_id?: string;
  exam_id?: string;
  device_id?: string;
  ip_address?: string;
  status: string;
  tx_ref: string;
  details_json?: string;
  tx_hash?: string;
  prev_hash?: string;
  created_at: string;
}

const AuditEventSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    event_type: { type: String, required: true, index: true },
    user_id: { type: String, index: true },
    user_email: { type: String },
    role: { type: String },
    org_id: { type: String, index: true },
    exam_id: { type: String, index: true },
    device_id: { type: String },
    ip_address: { type: String },
    status: { type: String, default: 'SUCCESS' },
    tx_ref: { type: String, required: true, index: true },
    details_json: { type: String },
    tx_hash: { type: String },
    prev_hash: { type: String },
    created_at: { type: String, required: true, index: true },
  },
  baseSchemaOptions
);

// Prevent updates and deletes on the immutable append-only audit ledger
AuditEventSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'] as any, function () {
  throw new Error('IMMUTABLE_AUDIT_LEDGER: Modifications and deletions are strictly prohibited on AuditEvent.');
});

export const AuditEventModel = mongoose.models.AuditEvent || mongoose.model<IAuditEvent>('AuditEvent', AuditEventSchema, 'audit_events');
export default AuditEventModel;
