import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IProctorCameraEvidence {
  _id: string;
  id: string;
  session_id: string;
  exam_id?: string;
  user_id: string;
  user_name: string;
  user_role: string;
  image_data_url: string;
  storage_reference?: string;
  file_size_bytes: number;
  mime_type: string;
  event_type: string;
  presence_status: string;
  warning_number: number;
  submitted_by?: string;
  recipient: string;
  review_status: string;
  created_at: string;
}

const ProctorCameraEvidenceSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    session_id: { type: String, required: true, index: true },
    exam_id: { type: String, index: true },
    user_id: { type: String, required: true, index: true },
    user_name: { type: String, required: true },
    user_role: { type: String, required: true },
    image_data_url: { type: String, required: true },
    storage_reference: { type: String },
    file_size_bytes: { type: Number, default: 0 },
    mime_type: { type: String, default: 'image/jpeg' },
    event_type: { type: String, default: 'CAMERA_SNAPSHOT' },
    presence_status: { type: String, default: 'PRESENT' },
    warning_number: { type: Number, default: 0 },
    submitted_by: { type: String },
    recipient: { type: String, default: 'CBI Chief Vigilance & Security Auditor' },
    review_status: { type: String, default: 'PENDING_REVIEW' },
    created_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const ProctorCameraEvidenceModel = mongoose.models.ProctorCameraEvidence || mongoose.model<IProctorCameraEvidence>('ProctorCameraEvidence', ProctorCameraEvidenceSchema, 'proctor_camera_evidence');
export default ProctorCameraEvidenceModel;
