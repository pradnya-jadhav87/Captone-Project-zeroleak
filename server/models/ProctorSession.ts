import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IProctorSession {
  _id: string;
  id: string;
  attempt_id: string;
  exam_id: string;
  student_id: string;
  camera_status?: string;
  microphone_status?: string;
  fullscreen_status?: string;
  face_status?: string;
  faces_detected_count?: number;
  last_heartbeat_at: string;
  created_at: string;
  updated_at: string;
}

const ProctorSessionSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    attempt_id: { type: String, required: true, unique: true, index: true },
    exam_id: { type: String, required: true, index: true },
    student_id: { type: String, required: true, index: true },
    camera_status: { type: String, default: 'ACTIVE' },
    microphone_status: { type: String, default: 'ACTIVE' },
    fullscreen_status: { type: String, default: 'ACTIVE' },
    face_status: { type: String, default: 'DETECTED' },
    faces_detected_count: { type: Number, default: 1 },
    last_heartbeat_at: { type: String, required: true },
    created_at: { type: String, required: true },
    updated_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const ProctorSessionModel = mongoose.models.ProctorSession || mongoose.model<IProctorSession>('ProctorSession', ProctorSessionSchema, 'proctor_sessions');
export default ProctorSessionModel;
