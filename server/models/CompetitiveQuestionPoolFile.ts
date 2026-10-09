import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface ICompetitiveQuestionPoolFile {
  _id: string;
  id: string;
  org_id: string;
  exam_id: string;
  subject_id: string;
  subject_name: string;
  file_name: string;
  mime_type?: string;
  file_size?: number;
  file_data?: Buffer;
  file_hash?: string;
  status: string;
  question_count?: number;
  error_message?: string;
  uploaded_at: string;
  processed_at?: string;
}

const CompetitiveQuestionPoolFileSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    org_id: { type: String, required: true, index: true },
    exam_id: { type: String, required: true, index: true },
    subject_id: { type: String, required: true },
    subject_name: { type: String, required: true },
    file_name: { type: String, required: true },
    mime_type: { type: String, default: 'application/pdf' },
    file_size: { type: Number, default: 0 },
    file_data: { type: Buffer },
    file_hash: { type: String },
    status: { type: String, default: 'PENDING', index: true },
    question_count: { type: Number, default: 0 },
    error_message: { type: String },
    uploaded_at: { type: String, required: true },
    processed_at: { type: String },
  },
  baseSchemaOptions
);

export const CompetitiveQuestionPoolFileModel = mongoose.models.CompetitiveQuestionPoolFile || mongoose.model<ICompetitiveQuestionPoolFile>('CompetitiveQuestionPoolFile', CompetitiveQuestionPoolFileSchema, 'competitive_question_pool_files');
export default CompetitiveQuestionPoolFileModel;
