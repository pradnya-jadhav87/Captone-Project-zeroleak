import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface ICompetitiveExam {
  _id: string;
  id: string;
  org_id: string;
  name: string;
  exam_type: string;
  duration_minutes: number;
  exam_date?: string;
  exam_time?: string;
  instructions?: string;
  blueprint_json?: string;
  status: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

const CompetitiveExamSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    org_id: { type: String, required: true, index: true },
    name: { type: String, required: true },
    exam_type: { type: String, required: true, index: true },
    duration_minutes: { type: Number, default: 180 },
    exam_date: { type: String },
    exam_time: { type: String },
    instructions: { type: String },
    blueprint_json: { type: String },
    status: { type: String, default: 'DRAFT', index: true },
    created_by: { type: String },
    created_at: { type: String, required: true },
    updated_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const CompetitiveExamModel = mongoose.models.CompetitiveExam || mongoose.model<ICompetitiveExam>('CompetitiveExam', CompetitiveExamSchema, 'competitive_exams');
export default CompetitiveExamModel;
