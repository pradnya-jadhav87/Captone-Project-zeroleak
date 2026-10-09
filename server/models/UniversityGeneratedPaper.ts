import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IUniversityGeneratedPaper {
  _id: string;
  id: string;
  exam_id: string;
  version_code: string;
  set_letter: string;
  total_questions: number;
  mcq_count: number;
  short_answer_count: number;
  descriptive_count: number;
  total_marks: number;
  duplicate_count: number;
  paper_distribution_json?: string;
  pdf_filename: string;
  pdf_url: string;
  pdf_hash: string;
  encrypted_pdf_path?: string;
  encryption_algorithm: string;
  status: string;
  created_by?: string;
  created_at: string;
  preview_status?: string;
}

const UniversityGeneratedPaperSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    exam_id: { type: String, required: true, index: true },
    version_code: { type: String, required: true },
    set_letter: { type: String, default: 'P' },
    total_questions: { type: Number, required: true },
    mcq_count: { type: Number, default: 0 },
    short_answer_count: { type: Number, default: 0 },
    descriptive_count: { type: Number, default: 0 },
    total_marks: { type: Number, default: 70 },
    duplicate_count: { type: Number, default: 0 },
    paper_distribution_json: { type: String },
    pdf_filename: { type: String, required: true },
    pdf_url: { type: String, required: true },
    pdf_hash: { type: String, required: true },
    encrypted_pdf_path: { type: String },
    encryption_algorithm: { type: String, default: 'PDF-LIB-AES256' },
    status: { type: String, default: 'GENERATED_ENCRYPTED', index: true },
    created_by: { type: String },
    created_at: { type: String, required: true },
    preview_status: { type: String, default: 'NOT_VIEWED' },
  },
  baseSchemaOptions
);

export const UniversityGeneratedPaperModel = mongoose.models.UniversityGeneratedPaper || mongoose.model<IUniversityGeneratedPaper>('UniversityGeneratedPaper', UniversityGeneratedPaperSchema, 'university_generated_papers');
export default UniversityGeneratedPaperModel;
