import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IExamination {
  _id: string;
  id: string;
  org_id: string;
  university_name?: string;
  blueprint_pattern?: string;
  name: string;
  subject: string;
  category: string;
  exam_type: string;
  exam_date: string;
  exam_time: string;
  unlock_time: string;
  total_marks: number;
  total_questions: number;
  duration_minutes: number;
  mcq_count?: number;
  theory_count?: number;
  mcq_marks?: number;
  theory_marks?: number;
  negative_marks?: number;
  marking_scheme?: string;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const ExaminationSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    org_id: { type: String, required: true, index: true },
    university_name: { type: String },
    blueprint_pattern: { type: String },
    name: { type: String, required: true },
    subject: { type: String, required: true, index: true },
    category: { type: String, required: true, index: true },
    exam_type: { type: String, required: true },
    exam_date: { type: String, required: true },
    exam_time: { type: String, required: true },
    unlock_time: { type: String, required: true },
    total_marks: { type: Number, default: 100 },
    total_questions: { type: Number, default: 0 },
    duration_minutes: { type: Number, default: 180 },
    mcq_count: { type: Number, default: 0 },
    theory_count: { type: Number, default: 0 },
    mcq_marks: { type: Number, default: 1.0 },
    theory_marks: { type: Number, default: 10.0 },
    negative_marks: { type: Number, default: 0.0 },
    marking_scheme: { type: String },
    status: { type: String, default: 'CONFIGURING', index: true },
    created_by: { type: String, required: true },
    created_at: { type: String, required: true },
    updated_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const ExaminationModel = mongoose.models.Examination || mongoose.model<IExamination>('Examination', ExaminationSchema, 'examinations');
export default ExaminationModel;
