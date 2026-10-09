import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface ICompetitiveQuestion {
  _id: string;
  id: string;
  pool_id?: string;
  org_id: string;
  exam_id: string;
  subject: string;
  topic?: string;
  question_number?: string;
  question_type: string;
  content_text: string;
  options_json?: string;
  correct_answer?: string;
  marks?: number;
  negative_marks?: number;
  diagram_url?: string;
  image_url?: string;
  difficulty?: string;
  status: string;
  source_file_id?: string;
  source_page_number?: number;
  extraction_confidence?: number;
  validation_warnings_json?: string;
  visual_elements_json?: string;
  table_data_json?: string;
  equations_json?: string;
  captions_json?: string;
  shared_visual_group_id?: string;
  shared_with_question_numbers_json?: string;
  visual_validation_status?: string;
  created_at: string;
  updated_at?: string;
}

const CompetitiveQuestionSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    pool_id: { type: String, index: true },
    org_id: { type: String, required: true, index: true },
    exam_id: { type: String, required: true, index: true },
    subject: { type: String, required: true, index: true },
    topic: { type: String },
    question_number: { type: String },
    question_type: { type: String, default: 'MCQ' },
    content_text: { type: String, required: true },
    options_json: { type: String },
    correct_answer: { type: String },
    marks: { type: Number, default: 4 },
    negative_marks: { type: Number, default: 1 },
    diagram_url: { type: String },
    image_url: { type: String },
    difficulty: { type: String, default: 'MEDIUM' },
    status: { type: String, default: 'VERIFIED', index: true },
    source_file_id: { type: String },
    source_page_number: { type: Number },
    extraction_confidence: { type: Number },
    validation_warnings_json: { type: String },
    visual_elements_json: { type: String },
    table_data_json: { type: String },
    equations_json: { type: String },
    captions_json: { type: String },
    shared_visual_group_id: { type: String },
    shared_with_question_numbers_json: { type: String },
    visual_validation_status: { type: String },
    created_at: { type: String, required: true },
    updated_at: { type: String },
  },
  baseSchemaOptions
);

export const CompetitiveQuestionModel = mongoose.models.CompetitiveQuestion || mongoose.model<ICompetitiveQuestion>('CompetitiveQuestion', CompetitiveQuestionSchema, 'competitive_questions');
export default CompetitiveQuestionModel;
