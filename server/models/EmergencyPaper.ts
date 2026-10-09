import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IEmergencyPaper {
  _id: string;
  id: string;
  incident_id: string;
  exam_id: string;
  exam_type: 'UNIVERSITY' | 'COMPETITIVE';
  version: string;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  paper_data_json: string;
  encrypted_payload_json?: string;
  is_emergency: number;
  approved_by?: string;
  approved_at?: string;
  approval_reason?: string;
  generated_by: string;
  generated_at: string;
}

const EmergencyPaperSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    incident_id: { type: String, required: true, index: true },
    exam_id: { type: String, required: true, index: true },
    exam_type: { type: String, required: true, index: true },
    version: { type: String, required: true },
    status: { type: String, default: 'PENDING_APPROVAL', index: true },
    paper_data_json: { type: String, required: true },
    encrypted_payload_json: { type: String },
    is_emergency: { type: Number, default: 1 },
    approved_by: { type: String },
    approved_at: { type: String },
    approval_reason: { type: String },
    generated_by: { type: String, required: true },
    generated_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const EmergencyPaperModel =
  mongoose.models.EmergencyPaper ||
  mongoose.model<IEmergencyPaper>('EmergencyPaper', EmergencyPaperSchema, 'emergency_papers');
export default EmergencyPaperModel;
