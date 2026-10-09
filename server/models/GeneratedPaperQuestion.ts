import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IGeneratedPaperQuestion {
  _id: string;
  id: string;
  generated_paper_id: string;
  question_id: string;
  source_paper_id?: string;
  display_order: number;
  shuffled_options_json: string;
  correct_option_id: string;
  displayed_correct_answer: string;
  marks: number;
  negative_marks: number;
}

const GeneratedPaperQuestionSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    generated_paper_id: { type: String, required: true, index: true },
    question_id: { type: String, required: true, index: true },
    source_paper_id: { type: String },
    display_order: { type: Number, required: true },
    shuffled_options_json: { type: String, required: true },
    correct_option_id: { type: String, required: true },
    displayed_correct_answer: { type: String, required: true },
    marks: { type: Number, default: 4 },
    negative_marks: { type: Number, default: 1.0 },
  },
  baseSchemaOptions
);

export const GeneratedPaperQuestionModel = mongoose.models.GeneratedPaperQuestion || mongoose.model<IGeneratedPaperQuestion>('GeneratedPaperQuestion', GeneratedPaperQuestionSchema, 'generated_paper_questions');
export default GeneratedPaperQuestionModel;
