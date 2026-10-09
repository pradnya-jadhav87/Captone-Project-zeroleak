import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface ITranslationTask {
  _id: string;
  id: string;
  subject: string;
  topic?: string;
  question_text: string;
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  correct_option?: string;
  marks?: number;
  target_language?: string;
  status: string;
  ai_translation_text?: string;
  translated_options?: string;
  created_at?: string;
}

const TranslationTaskSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    subject: { type: String, default: 'Biology', index: true },
    topic: { type: String },
    question_text: { type: String, required: true },
    option_a: { type: String },
    option_b: { type: String },
    option_c: { type: String },
    option_d: { type: String },
    correct_option: { type: String },
    marks: { type: Number, default: 4.0 },
    target_language: { type: String, default: 'Hindi', index: true },
    status: { type: String, default: 'PENDING', index: true },
    ai_translation_text: { type: String },
    translated_options: { type: String },
    created_at: { type: String },
  },
  baseSchemaOptions
);

export const TranslationTaskModel = mongoose.models.TranslationTask || mongoose.model<ITranslationTask>('TranslationTask', TranslationTaskSchema, 'translation_tasks');
export default TranslationTaskModel;
