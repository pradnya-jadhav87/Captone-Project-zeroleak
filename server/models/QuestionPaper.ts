import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IQuestionPaper {
  _id: string;
  id: string;
  org_id: string;
  exam_id?: string;
  original_filename: string;
  subject: string;
  examination_category: string;
  processing_status: string;
  page_count: number;
  question_count: number;
  auto_extracted_count: number;
  needs_review_count: number;
  manually_corrected_count: number;
  pages_dir?: string;
  extraction_error?: string;
  cloudinary_url?: string;
  cloudinary_public_id?: string;
  uploaded_at: string;
}

const QuestionPaperSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    org_id: { type: String, required: true, index: true },
    exam_id: { type: String, index: true },
    original_filename: { type: String, required: true },
    subject: { type: String, required: true, index: true },
    examination_category: { type: String, required: true, index: true },
    processing_status: { type: String, default: 'PENDING', index: true },
    page_count: { type: Number, default: 0 },
    question_count: { type: Number, default: 0 },
    auto_extracted_count: { type: Number, default: 0 },
    needs_review_count: { type: Number, default: 0 },
    manually_corrected_count: { type: Number, default: 0 },
    pages_dir: { type: String },
    extraction_error: { type: String },
    cloudinary_url: { type: String },
    cloudinary_public_id: { type: String },
    uploaded_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const QuestionPaperModel = mongoose.models.QuestionPaper || mongoose.model<IQuestionPaper>('QuestionPaper', QuestionPaperSchema, 'question_papers');
export default QuestionPaperModel;
