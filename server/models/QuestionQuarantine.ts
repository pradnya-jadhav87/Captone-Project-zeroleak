import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IQuestionQuarantine {
  _id: string;
  id: string;
  question_id: string;
  reason: string;
  reported_by: string;
  status: string;
  quarantined_at: string;
  resolved_at?: string;
  resolved_by?: string;
  notes?: string;
}

const QuestionQuarantineSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    question_id: { type: String, required: true, index: true },
    reason: { type: String, required: true },
    reported_by: { type: String, required: true, index: true },
    status: { type: String, default: 'QUARANTINED', index: true },
    quarantined_at: { type: String, required: true },
    resolved_at: { type: String },
    resolved_by: { type: String },
    notes: { type: String },
  },
  baseSchemaOptions
);

export const QuestionQuarantineModel = mongoose.models.QuestionQuarantine || mongoose.model<IQuestionQuarantine>('QuestionQuarantine', QuestionQuarantineSchema, 'question_quarantine');
export default QuestionQuarantineModel;
