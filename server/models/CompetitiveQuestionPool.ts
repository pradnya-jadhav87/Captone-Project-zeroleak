import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface ICompetitiveQuestionPool {
  _id: string;
  id: string;
  org_id: string;
  exam_id: string;
  subject: string;
  source_pdf_name: string;
  page_count: number;
  question_count: number;
  file_size: number;
  uploaded_at: string;
}

const CompetitiveQuestionPoolSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    org_id: { type: String, required: true, index: true },
    exam_id: { type: String, required: true, index: true },
    subject: { type: String, required: true, index: true },
    source_pdf_name: { type: String, required: true },
    page_count: { type: Number, default: 1 },
    question_count: { type: Number, default: 0 },
    file_size: { type: Number, default: 0 },
    uploaded_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const CompetitiveQuestionPoolModel = mongoose.models.CompetitiveQuestionPool || mongoose.model<ICompetitiveQuestionPool>('CompetitiveQuestionPool', CompetitiveQuestionPoolSchema, 'competitive_question_pools');
export default CompetitiveQuestionPoolModel;
