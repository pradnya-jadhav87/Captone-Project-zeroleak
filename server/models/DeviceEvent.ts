import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IDeviceEvent {
  _id: string;
  id: string;
  device_id: string;
  user_id: string;
  event_type: string;
  details?: string;
  ip_address?: string;
  timestamp: string;
}

const DeviceEventSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    device_id: { type: String, required: true, index: true },
    user_id: { type: String, required: true, index: true },
    event_type: { type: String, required: true, index: true },
    details: { type: String },
    ip_address: { type: String },
    timestamp: { type: String, required: true },
  },
  baseSchemaOptions
);

export const DeviceEventModel = mongoose.models.DeviceEvent || mongoose.model<IDeviceEvent>('DeviceEvent', DeviceEventSchema, 'device_events');
export default DeviceEventModel;
