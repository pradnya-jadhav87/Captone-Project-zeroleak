import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IUser {
  _id: string;
  id: string;
  org_id: string;
  email: string;
  username: string;
  password_hash: string;
  full_name: string;
  role: string;
  status: string;
  authorization_status?: string;
  account_type?: string;
  environment?: string;
  authorized_by?: string;
  authorized_at?: string;
  centre_id?: string;
  created_at: string;
  last_login_at?: string;
}

const UserSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    org_id: { type: String, required: true, index: true },
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    username: { type: String, required: true, unique: true, index: true, trim: true },
    password_hash: { type: String, required: true },
    full_name: { type: String, required: true },
    role: { type: String, required: true, index: true },
    status: { type: String, default: 'ACTIVE', index: true },
    authorization_status: { type: String, default: 'AUTHORIZED' },
    account_type: { type: String, default: 'STANDARD' },
    environment: { type: String, default: 'production' },
    authorized_by: { type: String },
    authorized_at: { type: String },
    centre_id: { type: String, index: true },
    created_at: { type: String, required: true },
    last_login_at: { type: String },
  },
  baseSchemaOptions
);

import { Model } from 'mongoose';
export const UserModel: Model<IUser> = (mongoose.models.User as Model<IUser>) || mongoose.model<IUser>('User', UserSchema, 'users');
export default UserModel;
