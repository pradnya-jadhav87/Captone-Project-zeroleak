import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface ISystemSetting {
  _id: string;
  setting_key: string;
  setting_value: string;
}

const SystemSettingSchema = new Schema(
  {
    _id: { type: String, required: true },
    setting_key: { type: String, required: true, unique: true, index: true },
    setting_value: { type: String, required: true },
  },
  baseSchemaOptions
);

export const SystemSettingModel = mongoose.models.SystemSetting || mongoose.model<ISystemSetting>('SystemSetting', SystemSettingSchema, 'system_settings');
export default SystemSettingModel;
