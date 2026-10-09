import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IQuestionVerification {
  _id: string;
  id: string;
  question_id: string;
  verifier_user_id: string;
  status: string;
  feedback?: string;
  syllabus_accurate: number;
  answer_verified: number;
  verified_at: string;
}

const QuestionVerificationSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    question_id: { type: String, required: true, index: true },
    verifier_user_id: { type: String, required: true, index: true },
    status: { type: String, required: true, index: true },
    feedback: { type: String },
    syllabus_accurate: { type: Number, default: 1 },
    answer_verified: { type: Number, default: 1 },
    verified_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const QuestionVerificationModel = mongoose.models.QuestionVerification || mongoose.model<IQuestionVerification>('QuestionVerification', QuestionVerificationSchema, 'question_verifications');
export default QuestionVerificationModel;
