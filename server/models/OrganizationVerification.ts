import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IOrganizationVerification {
  _id: string;
  id: string;
  org_id: string;
  previous_status: string;
  new_status: string;
  changed_by: string;
  reason: string;
  verification_ref: string;
  created_at: string;
}

const OrganizationVerificationSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    org_id: { type: String, required: true, index: true },
    previous_status: { type: String, required: true },
    new_status: { type: String, required: true },
    changed_by: { type: String, required: true },
    reason: { type: String, required: true },
    verification_ref: { type: String, required: true },
    created_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const OrganizationVerificationModel = mongoose.models.OrganizationVerification || mongoose.model<IOrganizationVerification>('OrganizationVerification', OrganizationVerificationSchema, 'organization_verifications');
export default OrganizationVerificationModel;
