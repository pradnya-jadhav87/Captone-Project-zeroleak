import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface ITrustedDevice {
  _id: string;
  id: string;
  org_id: string;
  user_id: string;
  device_uuid?: string;
  device_fingerprint: string;
  public_key?: string;
  device_name: string;
  device_model?: string;
  operating_system?: string;
  os_version?: string;
  app_version?: string;
  browser_os: string;
  ip_address: string;
  metadata_json?: string;
  status: string;
  attestation_status?: string;
  encryption_algorithm?: string;
  created_at?: string;
  updated_at?: string;
  approved_at?: string;
  approved_by?: string;
  last_authenticated_at?: string;
  registered_at: string;
  last_seen_at: string;
  disabled_at?: string;
  revoked_at?: string;
  replacement_of_device_id?: string;
}

const TrustedDeviceSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    org_id: { type: String, required: true, index: true },
    user_id: { type: String, required: true, index: true },
    device_uuid: { type: String },
    device_fingerprint: { type: String, required: true },
    public_key: { type: String },
    device_name: { type: String, required: true },
    device_model: { type: String },
    operating_system: { type: String },
    os_version: { type: String },
    app_version: { type: String },
    browser_os: { type: String, required: true },
    ip_address: { type: String, required: true },
    metadata_json: { type: String },
    status: { type: String, default: 'PENDING', index: true },
    attestation_status: { type: String, default: 'UNAVAILABLE' },
    encryption_algorithm: { type: String, default: 'ECDSA-P256' },
    created_at: { type: String },
    updated_at: { type: String },
    approved_at: { type: String },
    approved_by: { type: String },
    last_authenticated_at: { type: String },
    registered_at: { type: String, required: true },
    last_seen_at: { type: String, required: true },
    disabled_at: { type: String },
    revoked_at: { type: String },
    replacement_of_device_id: { type: String },
  },
  baseSchemaOptions
);

TrustedDeviceSchema.index(
  { device_uuid: 1 },
  { unique: true, partialFilterExpression: { device_uuid: { $type: 'string' } } }
);

export const TrustedDeviceModel = mongoose.models.TrustedDevice || mongoose.model<ITrustedDevice>('TrustedDevice', TrustedDeviceSchema, 'trusted_devices');
export default TrustedDeviceModel;
