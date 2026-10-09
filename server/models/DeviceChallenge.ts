import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IDeviceChallenge {
  _id: string;
  id: string;
  user_id: string;
  org_id: string;
  device_id?: string;
  device_uuid?: string;
  authentication_attempt_id: string;
  purpose: string;
  challenge: string;
  used_at?: string;
  expires_at: string;
  created_at: string;
}

const DeviceChallengeSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    user_id: { type: String, required: true, index: true },
    org_id: { type: String, required: true, index: true },
    device_id: { type: String },
    device_uuid: { type: String },
    authentication_attempt_id: { type: String, required: true },
    purpose: { type: String, required: true, index: true },
    challenge: { type: String, required: true },
    used_at: { type: String },
    expires_at: { type: String, required: true },
    created_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const DeviceChallengeModel = mongoose.models.DeviceChallenge || mongoose.model<IDeviceChallenge>('DeviceChallenge', DeviceChallengeSchema, 'device_challenges');
export default DeviceChallengeModel;
