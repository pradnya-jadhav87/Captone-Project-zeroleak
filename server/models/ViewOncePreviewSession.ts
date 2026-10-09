import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IViewOncePreviewSession {
  _id: string;
  id: string;
  paper_id: string;
  exam_id: string;
  exam_type: string;
  user_id: string;
  user_role: string;
  session_token: string;
  status: string;
  started_at?: string;
  expires_at?: string;
  consumed_at?: string;
  consumed_reason?: string;
  security_events_json?: string;
  browser_info_json?: string;
  created_at: string;
}

const ViewOncePreviewSessionSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    paper_id: { type: String, required: true, index: true },
    exam_id: { type: String, required: true, index: true },
    exam_type: { type: String, required: true },
    user_id: { type: String, required: true, index: true },
    user_role: { type: String, required: true },
    session_token: { type: String, required: true, unique: true, index: true },
    status: { type: String, default: 'NOT_VIEWED', index: true },
    started_at: { type: String },
    expires_at: { type: String },
    consumed_at: { type: String },
    consumed_reason: { type: String },
    security_events_json: { type: String, default: '[]' },
    browser_info_json: { type: String },
    created_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const ViewOncePreviewSessionModel = mongoose.models.ViewOncePreviewSession || mongoose.model<IViewOncePreviewSession>('ViewOncePreviewSession', ViewOncePreviewSessionSchema, 'view_once_preview_sessions');
export default ViewOncePreviewSessionModel;
