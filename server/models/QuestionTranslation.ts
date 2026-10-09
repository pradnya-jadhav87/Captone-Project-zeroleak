import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IQuestionTranslation {
  _id: string;
  id: string;
  org_id?: string;
  question_id: string;
  assignment_id?: string;
  source_language: string;
  language: string;
  translated_content: string;
  translated_options_json?: string;
  translated_by_user_id?: string;
  status: string;
  translator_notes?: string;
  created_at: string;
  updated_at: string;
}

const QuestionTranslationSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    org_id: { type: String, index: true },
    question_id: { type: String, required: true, index: true },
    assignment_id: { type: String, index: true },
    source_language: { type: String, default: 'English' },
    language: { type: String, required: true, index: true },
    translated_content: { type: String, required: true },
    translated_options_json: { type: String },
    translated_by_user_id: { type: String, index: true },
    status: { type: String, default: 'DRAFT', index: true },
    translator_notes: { type: String },
    created_at: { type: String, required: true },
    updated_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const QuestionTranslationModel = mongoose.models.QuestionTranslation || mongoose.model<IQuestionTranslation>('QuestionTranslation', QuestionTranslationSchema, 'question_translations');
export default QuestionTranslationModel;
