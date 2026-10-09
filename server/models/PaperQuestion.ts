import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IPaperQuestion {
  _id: string;
  id: string;
  paper_version_id: string;
  question_id: string;
  section_name: string;
  order_index: number;
  marks: number;
}

const PaperQuestionSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    paper_version_id: { type: String, required: true, index: true },
    question_id: { type: String, required: true, index: true },
    section_name: { type: String, required: true },
    order_index: { type: Number, required: true },
    marks: { type: Number, required: true },
  },
  baseSchemaOptions
);

export const PaperQuestionModel = mongoose.models.PaperQuestion || mongoose.model<IPaperQuestion>('PaperQuestion', PaperQuestionSchema, 'paper_questions');
export default PaperQuestionModel;
