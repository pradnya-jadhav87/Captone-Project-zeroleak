import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IOrganization {
  _id: string;
  id: string;
  name: string;
  type: string;
  reg_number: string;
  auth_id: string;
  official_email: string;
  website: string;
  address: string;
  contact: string;
  status: string;
  verification_status?: string;
  verification_method?: string;
  verification_source?: string;
  verification_date?: string;
  document_verification_status?: string;
  verification_message?: string;
  domain_verified?: number;
  created_at: string;
  updated_at: string;
}

const OrganizationSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    name: { type: String, required: true },
    type: { type: String, required: true },
    reg_number: { type: String, required: true },
    auth_id: { type: String, required: true },
    official_email: { type: String, required: true },
    website: { type: String, required: true },
    address: { type: String, required: true },
    contact: { type: String, required: true },
    status: { type: String, default: 'PENDING' },
    verification_status: { type: String, default: 'PENDING_VERIFICATION' },
    verification_method: { type: String },
    verification_source: { type: String },
    verification_date: { type: String },
    document_verification_status: { type: String, default: 'PENDING' },
    verification_message: { type: String },
    domain_verified: { type: Number, default: 0 },
    created_at: { type: String, required: true },
    updated_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const OrganizationModel = mongoose.models.Organization || mongoose.model<IOrganization>('Organization', OrganizationSchema, 'organizations');
export default OrganizationModel;
