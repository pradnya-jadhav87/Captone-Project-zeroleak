import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IDraftQuestion {
  _id: string;
  id: string;
  draft_paper_id: string;
  exam_id: string;
  paper_index: number;
  source_paper: string;
  section: string;
  question_number: string;
  question_text: string;
  question_type: string;
  options_json?: string;
  correct_answer?: string;
  marks: number;
  sub_question_pattern?: string;
  diagram_url?: string;
  created_at: string;
}

const DraftQuestionSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    draft_paper_id: { type: String, required: true, index: true },
    exam_id: { type: String, required: true, index: true },
    paper_index: { type: Number, required: true },
    source_paper: { type: String, required: true },
    section: { type: String, required: true },
    question_number: { type: String, required: true },
    question_text: { type: String, required: true },
    question_type: { type: String, required: true },
    options_json: { type: String },
    correct_answer: { type: String },
    marks: { type: Number, default: 1 },
    sub_question_pattern: { type: String },
    diagram_url: { type: String },
    created_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const DraftQuestionModel = mongoose.models.DraftQuestion || mongoose.model<IDraftQuestion>('DraftQuestion', DraftQuestionSchema, 'draft_questions');
export default DraftQuestionModel;
