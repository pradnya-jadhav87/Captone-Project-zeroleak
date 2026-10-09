import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface ISecurityEvent {
  _id: string;
  id: string;
  event_type: string;
  severity: string;
  risk_score: number;
  user_id?: string;
  org_id?: string;
  ip_address?: string;
  details_json?: string;
  resolved: number;
  timestamp: string;
}

const SecurityEventSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    event_type: { type: String, required: true, index: true },
    severity: { type: String, required: true, index: true },
    risk_score: { type: Number, required: true },
    user_id: { type: String, index: true },
    org_id: { type: String, index: true },
    ip_address: { type: String },
    details_json: { type: String },
    resolved: { type: Number, default: 0 },
    timestamp: { type: String, required: true, index: true },
  },
  baseSchemaOptions
);

export const SecurityEventModel = mongoose.models.SecurityEvent || mongoose.model<ISecurityEvent>('SecurityEvent', SecurityEventSchema, 'security_events');
export default SecurityEventModel;
