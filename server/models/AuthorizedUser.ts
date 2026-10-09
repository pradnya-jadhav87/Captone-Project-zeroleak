import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IAuthorizedUser {
  _id: string;
  id: string;
  org_id: string;
  full_name: string;
  official_email: string;
  contact_number: string;
  designation: string;
  assigned_role: string;
  authorized_by: string;
  authorization_status: string;
  created_at: string;
}

const AuthorizedUserSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    org_id: { type: String, required: true, index: true },
    full_name: { type: String, required: true },
    official_email: { type: String, required: true, unique: true, index: true },
    contact_number: { type: String, required: true },
    designation: { type: String, required: true },
    assigned_role: { type: String, required: true },
    authorized_by: { type: String, required: true },
    authorization_status: { type: String, default: 'AUTHORIZED' },
    created_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const AuthorizedUserModel = mongoose.models.AuthorizedUser || mongoose.model<IAuthorizedUser>('AuthorizedUser', AuthorizedUserSchema, 'authorized_users');
export default AuthorizedUserModel;
