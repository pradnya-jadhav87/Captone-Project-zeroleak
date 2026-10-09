import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IQuestionPaperPage {
  _id: string;
  id: string;
  paper_id: string;
  page_number: number;
  image_url: string;
  width: number;
  height: number;
  dpi: number;
  disk_path?: string;
  created_at: string;
}

const QuestionPaperPageSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    paper_id: { type: String, required: true, index: true },
    page_number: { type: Number, required: true },
    image_url: { type: String, required: true },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    dpi: { type: Number, default: 300 },
    disk_path: { type: String },
    created_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const QuestionPaperPageModel = mongoose.models.QuestionPaperPage || mongoose.model<IQuestionPaperPage>('QuestionPaperPage', QuestionPaperPageSchema, 'question_paper_pages');
export default QuestionPaperPageModel;
