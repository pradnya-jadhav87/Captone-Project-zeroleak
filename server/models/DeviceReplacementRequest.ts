import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IDeviceReplacementRequest {
  _id: string;
  id: string;
  org_id: string;
  user_id: string;
  existing_device_id: string;
  requested_device_uuid?: string;
  status: string;
  requested_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
  details_json?: string;
}

const DeviceReplacementRequestSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    org_id: { type: String, required: true, index: true },
    user_id: { type: String, required: true, index: true },
    existing_device_id: { type: String, required: true },
    requested_device_uuid: { type: String },
    status: { type: String, default: 'PENDING', index: true },
    requested_at: { type: String, required: true },
    reviewed_at: { type: String },
    reviewed_by: { type: String },
    details_json: { type: String },
  },
  baseSchemaOptions
);

export const DeviceReplacementRequestModel = mongoose.models.DeviceReplacementRequest || mongoose.model<IDeviceReplacementRequest>('DeviceReplacementRequest', DeviceReplacementRequestSchema, 'device_replacement_requests');
export default DeviceReplacementRequestModel;
