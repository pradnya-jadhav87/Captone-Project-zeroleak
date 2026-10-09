import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface ISecurityKeyAttempt {
  _id: string;
  id: string;
  user_id: string;
  exam_id: string;
  paper_id?: string;
  operation: 'PRINT' | 'TRANSLATE';
  attempt_count: number;
  is_locked: number;
  locked_at?: string;
  last_attempt_at: string;
  incident_id?: string;
}

const SecurityKeyAttemptSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    user_id: { type: String, required: true, index: true },
    exam_id: { type: String, required: true, index: true },
    paper_id: { type: String, index: true },
    operation: { type: String, required: true, index: true },
    attempt_count: { type: Number, default: 0 },
    is_locked: { type: Number, default: 0, index: true },
    locked_at: { type: String },
    last_attempt_at: { type: String, required: true },
    incident_id: { type: String },
  },
  baseSchemaOptions
);

export const SecurityKeyAttemptModel =
  mongoose.models.SecurityKeyAttempt ||
  mongoose.model<ISecurityKeyAttempt>('SecurityKeyAttempt', SecurityKeyAttemptSchema, 'security_key_attempts');
export default SecurityKeyAttemptModel;
