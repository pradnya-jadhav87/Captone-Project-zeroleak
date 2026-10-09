import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IAuthorityProctorSession {
  _id: string;
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_role: string;
  org_id: string;
  workspace_type: string;
  exam_id?: string;
  status: string;
  camera_status?: string;
  microphone_status?: string;
  fullscreen_status?: string;
  face_status?: string;
  faces_detected_count?: number;
  audio_level_db?: number;
  leak_risk_score?: number;
  leak_risk_level?: string;
  verification_snapshot?: string;
  emergency_locked?: number;
  emergency_lock_reason?: string;
  locked_by?: string;
  warning_count?: number;
  last_heartbeat_at: string;
  created_at: string;
  updated_at: string;
}

const AuthorityProctorSessionSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    user_id: { type: String, required: true, index: true },
    user_name: { type: String, required: true },
    user_email: { type: String, required: true },
    user_role: { type: String, required: true, index: true },
    org_id: { type: String, required: true, index: true },
    workspace_type: { type: String, required: true, index: true },
    exam_id: { type: String, index: true },
    status: { type: String, default: 'ACTIVE', index: true },
    camera_status: { type: String, default: 'ACTIVE' },
    microphone_status: { type: String, default: 'ACTIVE' },
    fullscreen_status: { type: String, default: 'ACTIVE' },
    face_status: { type: String, default: 'VERIFIED' },
    faces_detected_count: { type: Number, default: 1 },
    audio_level_db: { type: Number, default: -40.0 },
    leak_risk_score: { type: Number, default: 0 },
    leak_risk_level: { type: String, default: 'NORMAL' },
    verification_snapshot: { type: String },
    emergency_locked: { type: Number, default: 0 },
    emergency_lock_reason: { type: String },
    locked_by: { type: String },
    warning_count: { type: Number, default: 0 },
    last_heartbeat_at: { type: String, required: true },
    created_at: { type: String, required: true },
    updated_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const AuthorityProctorSessionModel = mongoose.models.AuthorityProctorSession || mongoose.model<IAuthorityProctorSession>('AuthorityProctorSession', AuthorityProctorSessionSchema, 'authority_proctor_sessions');
export default AuthorityProctorSessionModel;
