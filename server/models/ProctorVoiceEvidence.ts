import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IProctorVoiceEvidence {
  _id: string;
  id: string;
  session_id: string;
  exam_id?: string;
  user_id: string;
  user_name: string;
  user_role: string;
  audio_data_url: string;
  storage_reference?: string;
  duration_seconds: number;
  file_size_bytes: number;
  mime_type: string;
  event_type: string;
  warning_number: number;
  submitted_by?: string;
  recipient: string;
  review_status: string;
  created_at: string;
}

const ProctorVoiceEvidenceSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    session_id: { type: String, required: true, index: true },
    exam_id: { type: String, index: true },
    user_id: { type: String, required: true, index: true },
    user_name: { type: String, required: true },
    user_role: { type: String, required: true },
    audio_data_url: { type: String, required: true },
    storage_reference: { type: String },
    duration_seconds: { type: Number, default: 0 },
    file_size_bytes: { type: Number, default: 0 },
    mime_type: { type: String, default: 'audio/webm' },
    event_type: { type: String, default: 'VOICE_RECORDING_EVIDENCE' },
    warning_number: { type: Number, default: 0 },
    submitted_by: { type: String },
    recipient: { type: String, default: 'CBI Chief Vigilance & Security Auditor' },
    review_status: { type: String, default: 'PENDING_REVIEW' },
    created_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const ProctorVoiceEvidenceModel = mongoose.models.ProctorVoiceEvidence || mongoose.model<IProctorVoiceEvidence>('ProctorVoiceEvidence', ProctorVoiceEvidenceSchema, 'proctor_voice_evidence');
export default ProctorVoiceEvidenceModel;
