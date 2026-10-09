import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IProctorSetting {
  _id: string;
  id: string;
  org_id?: string;
  tab_switch_points: number;
  fullscreen_exit_points: number;
  face_not_detected_points: number;
  multiple_faces_points: number;
  camera_disabled_points: number;
  mic_disabled_points: number;
  audio_activity_points: number;
  copy_paste_points: number;
  key_shortcut_points: number;
  repeated_activity_points: number;
  max_warnings: number;
  updated_at: string;
}

const ProctorSettingSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    org_id: { type: String, index: true },
    tab_switch_points: { type: Number, default: 10 },
    fullscreen_exit_points: { type: Number, default: 10 },
    face_not_detected_points: { type: Number, default: 15 },
    multiple_faces_points: { type: Number, default: 30 },
    camera_disabled_points: { type: Number, default: 30 },
    mic_disabled_points: { type: Number, default: 15 },
    audio_activity_points: { type: Number, default: 5 },
    copy_paste_points: { type: Number, default: 5 },
    key_shortcut_points: { type: Number, default: 5 },
    repeated_activity_points: { type: Number, default: 10 },
    max_warnings: { type: Number, default: 3 },
    updated_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const ProctorSettingModel = mongoose.models.ProctorSetting || mongoose.model<IProctorSetting>('ProctorSetting', ProctorSettingSchema, 'proctor_settings');
export default ProctorSettingModel;
