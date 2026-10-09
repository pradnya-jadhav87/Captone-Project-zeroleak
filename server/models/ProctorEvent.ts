import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IProctorEvent {
  _id: string;
  id: string;
  session_id?: string;
  attempt_id?: string;
  user_id?: string;
  user_role?: string;
  exam_id?: string;
  student_id?: string;
  event_type: string;
  severity: string;
  risk_points: number;
  timestamp: string;
  metadata_json?: string;
  snapshot_thumbnail?: string;
  created_at: string;
}

const ProctorEventSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    session_id: { type: String, index: true },
    attempt_id: { type: String, index: true },
    user_id: { type: String, index: true },
    user_role: { type: String },
    exam_id: { type: String, index: true },
    student_id: { type: String, index: true },
    event_type: { type: String, required: true, index: true },
    severity: { type: String, required: true },
    risk_points: { type: Number, default: 0 },
    timestamp: { type: String, required: true, index: true },
    metadata_json: { type: String },
    snapshot_thumbnail: { type: String },
    created_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const ProctorEventModel = mongoose.models.ProctorEvent || mongoose.model<IProctorEvent>('ProctorEvent', ProctorEventSchema, 'proctor_events');
export default ProctorEventModel;
