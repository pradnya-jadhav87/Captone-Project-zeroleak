import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IQuestionAssignment {
  _id: string;
  id: string;
  org_id?: string;
  question_id: string;
  assigned_sme_user_id: string;
  assigned_by_user_id?: string;
  assignment_type: string;
  target_language?: string;
  status: string;
  notes?: string;
  assigned_at: string;
  completed_at?: string;
}

const QuestionAssignmentSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    org_id: { type: String, index: true },
    question_id: { type: String, required: true, index: true },
    assigned_sme_user_id: { type: String, required: true, index: true },
    assigned_by_user_id: { type: String },
    assignment_type: { type: String, default: 'SME_REVIEW', index: true },
    target_language: { type: String },
    status: { type: String, default: 'ASSIGNED', index: true },
    notes: { type: String },
    assigned_at: { type: String, required: true },
    completed_at: { type: String },
  },
  baseSchemaOptions
);

export const QuestionAssignmentModel = mongoose.models.QuestionAssignment || mongoose.model<IQuestionAssignment>('QuestionAssignment', QuestionAssignmentSchema, 'question_assignments');
export default QuestionAssignmentModel;
