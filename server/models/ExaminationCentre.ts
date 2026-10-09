import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IExaminationCentre {
  _id: string;
  id: string;
  exam_id: string;
  org_id?: string;
  centre_code: string;
  centre_name: string;
  city: string;
  state?: string;
  address: string;
  contact_person?: string;
  contact_number?: string;
  email?: string;
  operator_user_id?: string;
  max_copies: number;
  status: string;
  created_by?: string;
  created_at: string;
  updated_at?: string;
}

const ExaminationCentreSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    exam_id: { type: String, required: true, index: true },
    org_id: { type: String, index: true },
    centre_code: { type: String, required: true, index: true },
    centre_name: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String },
    address: { type: String, required: true },
    contact_person: { type: String },
    contact_number: { type: String },
    email: { type: String },
    operator_user_id: { type: String, index: true },
    max_copies: { type: Number, default: 100 },
    status: { type: String, default: 'ACTIVE', index: true },
    created_by: { type: String },
    created_at: { type: String, required: true },
    updated_at: { type: String },
  },
  baseSchemaOptions
);

export const ExaminationCentreModel = mongoose.models.ExaminationCentre || mongoose.model<IExaminationCentre>('ExaminationCentre', ExaminationCentreSchema, 'examination_centres');
export default ExaminationCentreModel;
