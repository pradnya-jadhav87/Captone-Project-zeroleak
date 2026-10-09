import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface ICompetitiveGeneratedPaper {
  _id: string;
  id: string;
  org_id: string;
  exam_id: string;
  title: string;
  exam_type: string;
  total_questions: number;
  total_marks: number;
  total_positive_marks: number;
  total_negative_marks: number;
  sections_json: string;
  questions_json: string;
  blueprint_snapshot_json: string;
  source_provenance_json?: string;
  paper_fingerprint: string;
  generated_by?: string;
  generated_at: string;
  enable_translation?: number;
  translation_language?: string;
  translation_status?: string;
  assigned_translator_id?: string;
  assigned_translator_name?: string;
  created_by_name?: string;
  original_sections_json?: string;
  original_questions_json?: string;
  bilingual_sections_json?: string;
  bilingual_questions_json?: string;
  returned_at?: string;
  final_generated_at?: string;
  is_finalized?: number;
  finalized_at?: string;
  finalized_by?: string;
  finalized_by_name?: string;
  encryption_time_iso?: string;
  decryption_time_iso?: string;
  encryption_time_display?: string;
  decryption_time_display?: string;
  schedule_exam_date?: string;
  schedule_timezone?: string;
  encryption_status?: string;
  encrypted_payload_json?: string;
  assigned_operator_id?: string;
  assigned_operator_name?: string;
  assigned_centre_id?: string;
  assigned_centre_name?: string;
  preview_status?: string;
  preview_consumed_at?: string;
  preview_consumed_by?: string;
  preview_session_token?: string;
}

const CompetitiveGeneratedPaperSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    org_id: { type: String, required: true, index: true },
    exam_id: { type: String, required: true, index: true },
    title: { type: String, required: true },
    exam_type: { type: String, required: true },
    total_questions: { type: Number, required: true },
    total_marks: { type: Number, required: true },
    total_positive_marks: { type: Number, required: true },
    total_negative_marks: { type: Number, required: true },
    sections_json: { type: String, required: true },
    questions_json: { type: String, required: true },
    blueprint_snapshot_json: { type: String, required: true },
    source_provenance_json: { type: String },
    paper_fingerprint: { type: String, required: true, unique: true, index: true },
    generated_by: { type: String },
    generated_at: { type: String, required: true, index: true },
    enable_translation: { type: Number, default: 0 },
    translation_language: { type: String },
    translation_status: { type: String, default: 'NONE', index: true },
    assigned_translator_id: { type: String },
    assigned_translator_name: { type: String },
    created_by_name: { type: String },
    original_sections_json: { type: String },
    original_questions_json: { type: String },
    bilingual_sections_json: { type: String },
    bilingual_questions_json: { type: String },
    returned_at: { type: String },
    final_generated_at: { type: String },
    is_finalized: { type: Number, default: 0, index: true },
    finalized_at: { type: String },
    finalized_by: { type: String },
    finalized_by_name: { type: String },
    encryption_time_iso: { type: String },
    decryption_time_iso: { type: String },
    encryption_time_display: { type: String },
    decryption_time_display: { type: String },
    schedule_exam_date: { type: String },
    schedule_timezone: { type: String },
    encryption_status: { type: String, default: 'UNFINALIZED', index: true },
    encrypted_payload_json: { type: String },
    assigned_operator_id: { type: String },
    assigned_operator_name: { type: String },
    assigned_centre_id: { type: String },
    assigned_centre_name: { type: String },
    preview_status: { type: String, default: 'NOT_VIEWED' },
    preview_consumed_at: { type: String },
    preview_consumed_by: { type: String },
    preview_session_token: { type: String },
  },
  baseSchemaOptions
);

export const CompetitiveGeneratedPaperModel = mongoose.models.CompetitiveGeneratedPaper || mongoose.model<ICompetitiveGeneratedPaper>('CompetitiveGeneratedPaper', CompetitiveGeneratedPaperSchema, 'competitive_generated_papers');
export default CompetitiveGeneratedPaperModel;
