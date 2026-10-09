import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IOrganizationDocument {
  _id: string;
  id: string;
  org_id: string;
  doc_type: string;
  file_name: string;
  file_size: number;
  file_data?: string;
  status: string;
  uploaded_at: string;
  verified_at?: string;
  verified_by?: string;
}

const OrganizationDocumentSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    org_id: { type: String, required: true, index: true },
    doc_type: { type: String, required: true },
    file_name: { type: String, required: true },
    file_size: { type: Number, required: true },
    file_data: { type: String },
    status: { type: String, default: 'PENDING', index: true },
    uploaded_at: { type: String, required: true },
    verified_at: { type: String },
    verified_by: { type: String },
  },
  baseSchemaOptions
);

export const OrganizationDocumentModel = mongoose.models.OrganizationDocument || mongoose.model<IOrganizationDocument>('OrganizationDocument', OrganizationDocumentSchema, 'organization_documents');
export default OrganizationDocumentModel;
