import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IExamAttempt {
  _id: string;
  id: string;
  exam_id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  status: string;
  started_at: string;
  submitted_at?: string;
  total_questions: number;
  answered_questions: number;
  score: number;
  risk_score: number;
  risk_level: string;
  warning_count: number;
  verification_snapshot?: string;
  proctor_decision: string;
  proctor_remarks?: string;
  answers_json?: string;
  created_at: string;
  updated_at: string;
}

const ExamAttemptSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    exam_id: { type: String, required: true, index: true },
    student_id: { type: String, required: true, index: true },
    student_name: { type: String, required: true },
    student_email: { type: String, required: true },
    status: { type: String, default: 'IN_PROGRESS', index: true },
    started_at: { type: String, required: true },
    submitted_at: { type: String },
    total_questions: { type: Number, default: 0 },
    answered_questions: { type: Number, default: 0 },
    score: { type: Number, default: 0 },
    risk_score: { type: Number, default: 0 },
    risk_level: { type: String, default: 'NORMAL' },
    warning_count: { type: Number, default: 0 },
    verification_snapshot: { type: String },
    proctor_decision: { type: String, default: 'PENDING' },
    proctor_remarks: { type: String },
    answers_json: { type: String },
    created_at: { type: String, required: true },
    updated_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const ExamAttemptModel = mongoose.models.ExamAttempt || mongoose.model<IExamAttempt>('ExamAttempt', ExamAttemptSchema, 'exam_attempts');
export default ExamAttemptModel;
