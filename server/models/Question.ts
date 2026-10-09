import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IQuestion {
  _id: string;
  id: string;
  org_id: string;
  exam_id?: string;
  question_paper_id?: string;
  source_file?: string;
  source_page?: number;
  question_number?: string;
  subject: string;
  topic: string;
  difficulty: string;
  marks: number;
  negative_marks: number;
  correct_answer: string;
  language: string;
  syllabus: string;
  question_type: string;
  content_text: string;
  options_json?: string;
  diagram_url?: string;
  image_url?: string;
  high_res_page_url?: string;
  crop_coordinates?: string;
  extraction_status?: string;
  options_status?: string;
  validation_flags?: string;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  assigned_sme_user_id?: string;
  assigned_by_user_id?: string;
  assigned_at?: string;
  verified_by_user_id?: string;
  verified_at?: string;
  verification_feedback?: string;
}

const QuestionSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    org_id: { type: String, required: true, index: true },
    exam_id: { type: String, index: true },
    question_paper_id: { type: String, index: true },
    source_file: { type: String },
    source_page: { type: Number },
    question_number: { type: String },
    subject: { type: String, required: true, index: true },
    topic: { type: String, required: true, index: true },
    difficulty: { type: String, default: 'MEDIUM', index: true },
    marks: { type: Number, default: 4 },
    negative_marks: { type: Number, default: 1.0 },
    correct_answer: { type: String, required: true },
    language: { type: String, default: 'English' },
    syllabus: { type: String, default: 'UNIVERSAL' },
    question_type: { type: String, default: 'MCQ', index: true },
    content_text: { type: String, required: true },
    options_json: { type: String },
    diagram_url: { type: String },
    image_url: { type: String },
    high_res_page_url: { type: String },
    crop_coordinates: { type: String },
    extraction_status: { type: String },
    options_status: { type: String },
    validation_flags: { type: String },
    status: { type: String, default: 'DRAFT', index: true },
    created_by: { type: String, required: true },
    created_at: { type: String, required: true },
    updated_at: { type: String, required: true },
    assigned_sme_user_id: { type: String, index: true },
    assigned_by_user_id: { type: String },
    assigned_at: { type: String },
    verified_by_user_id: { type: String },
    verified_at: { type: String },
    verification_feedback: { type: String },
  },
  baseSchemaOptions
);

export const QuestionModel = mongoose.models.Question || mongoose.model<IQuestion>('Question', QuestionSchema, 'questions');
export default QuestionModel;
