import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IDraftPaper {
  _id: string;
  id: string;
  exam_id: string;
  paper_index: number;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path?: string;
  extracted_text?: string;
  extraction_method: string;
  question_count: number;
  mcq_count: number;
  theory_count: number;
  uploaded_at: string;
}

const DraftPaperSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    exam_id: { type: String, required: true, index: true },
    paper_index: { type: Number, required: true },
    file_name: { type: String, required: true },
    file_size: { type: Number, required: true },
    mime_type: { type: String, required: true },
    storage_path: { type: String },
    extracted_text: { type: String },
    extraction_method: { type: String, default: 'PDF_PARSE' },
    question_count: { type: Number, default: 0 },
    mcq_count: { type: Number, default: 0 },
    theory_count: { type: Number, default: 0 },
    uploaded_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const DraftPaperModel = mongoose.models.DraftPaper || mongoose.model<IDraftPaper>('DraftPaper', DraftPaperSchema, 'draft_papers');
export default DraftPaperModel;
