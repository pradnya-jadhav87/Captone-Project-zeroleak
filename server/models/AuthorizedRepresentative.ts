import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IAuthorizedRepresentative {
  _id: string;
  id: string;
  org_id: string;
  user_id?: string;
  name: string;
  designation: string;
  email: string;
  contact: string;
  status: string;
  created_at: string;
}

const AuthorizedRepresentativeSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    org_id: { type: String, required: true, index: true },
    user_id: { type: String, index: true },
    name: { type: String, required: true },
    designation: { type: String, required: true },
    email: { type: String, required: true, index: true },
    contact: { type: String, required: true },
    status: { type: String, default: 'ACTIVE' },
    created_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const AuthorizedRepresentativeModel = mongoose.models.AuthorizedRepresentative || mongoose.model<IAuthorizedRepresentative>('AuthorizedRepresentative', AuthorizedRepresentativeSchema, 'authorized_representatives');
export default AuthorizedRepresentativeModel;
