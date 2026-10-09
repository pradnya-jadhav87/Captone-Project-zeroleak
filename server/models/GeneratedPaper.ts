import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IGeneratedPaper {
  _id: string;
  id: string;
  org_id: string;
  blueprint_id?: string;
  title: string;
  exam_id?: string;
  version_code: string;
  total_questions: number;
  source_papers_json: string;
  difficulty_breakdown_json: string;
  subject_breakdown_json: string;
  source_contribution_json: string;
  paper_fingerprint: string;
  generation_seed: string;
  question_sequence_hash: string;
  option_permutation_hash: string;
  status: string;
  generated_by: string;
  generated_at: string;
}

const GeneratedPaperSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    org_id: { type: String, required: true, index: true },
    blueprint_id: { type: String, index: true },
    title: { type: String, required: true },
    exam_id: { type: String, index: true },
    version_code: { type: String, required: true },
    total_questions: { type: Number, required: true },
    source_papers_json: { type: String, required: true },
    difficulty_breakdown_json: { type: String, required: true },
    subject_breakdown_json: { type: String, required: true },
    source_contribution_json: { type: String, required: true },
    paper_fingerprint: { type: String, required: true, unique: true, index: true },
    generation_seed: { type: String, required: true },
    question_sequence_hash: { type: String, required: true },
    option_permutation_hash: { type: String, required: true },
    status: { type: String, default: 'GENERATED', index: true },
    generated_by: { type: String, required: true },
    generated_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const GeneratedPaperModel = mongoose.models.GeneratedPaper || mongoose.model<IGeneratedPaper>('GeneratedPaper', GeneratedPaperSchema, 'generated_papers');
export default GeneratedPaperModel;
