import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface ICandidatePaperAssignment {
  _id: string;
  id: string;
  org_id: string;
  generated_paper_id: string;
  candidate_id: string;
  candidate_name?: string;
  candidate_roll_number?: string;
  candidate_group?: string;
  exam_session_id?: string;
  paper_fingerprint: string;
  assigned_at: string;
}

const CandidatePaperAssignmentSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    org_id: { type: String, required: true, index: true },
    generated_paper_id: { type: String, required: true, index: true },
    candidate_id: { type: String, required: true, index: true },
    candidate_name: { type: String },
    candidate_roll_number: { type: String },
    candidate_group: { type: String },
    exam_session_id: { type: String },
    paper_fingerprint: { type: String, required: true },
    assigned_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const CandidatePaperAssignmentModel = mongoose.models.CandidatePaperAssignment || mongoose.model<ICandidatePaperAssignment>('CandidatePaperAssignment', CandidatePaperAssignmentSchema, 'candidate_paper_assignments');
export default CandidatePaperAssignmentModel;
