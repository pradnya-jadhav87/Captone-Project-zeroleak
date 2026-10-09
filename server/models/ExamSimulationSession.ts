import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IExamSimulationSession {
  _id: string;
  id: string;
  exam_id: string;
  user_id: string;
  session_token: string;
  status: string;
  paper_snapshot_json?: string;
  events_json?: string;
  duration_seconds: number;
  started_at: string;
  expires_at: string;
  completed_at?: string;
  created_at: string;
}

const ExamSimulationSessionSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    exam_id: { type: String, required: true, index: true },
    user_id: { type: String, required: true, index: true },
    session_token: { type: String, required: true, unique: true, index: true },
    status: { type: String, default: 'ACTIVE' },
    paper_snapshot_json: { type: String },
    events_json: { type: String },
    duration_seconds: { type: Number, default: 900 },
    started_at: { type: String, required: true },
    expires_at: { type: String, required: true },
    completed_at: { type: String },
    created_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const ExamSimulationSessionModel = mongoose.models.ExamSimulationSession || mongoose.model<IExamSimulationSession>('ExamSimulationSession', ExamSimulationSessionSchema, 'exam_simulation_sessions');
export default ExamSimulationSessionModel;
