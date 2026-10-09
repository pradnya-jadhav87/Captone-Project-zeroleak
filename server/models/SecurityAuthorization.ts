import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface ISecurityAuthorization {
  _id: string;
  id: string;
  token: string;
  user_id: string;
  role: string;
  exam_id: string;
  paper_id?: string;
  operation: 'PRINT' | 'TRANSLATE';
  incident_id?: string;
  created_at: string;
  expires_at: string;
  consumed: number;
}

const SecurityAuthorizationSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    token: { type: String, required: true, unique: true, index: true },
    user_id: { type: String, required: true, index: true },
    role: { type: String, required: true },
    exam_id: { type: String, required: true, index: true },
    paper_id: { type: String, index: true },
    operation: { type: String, required: true, index: true },
    incident_id: { type: String },
    created_at: { type: String, required: true },
    expires_at: { type: String, required: true, index: true },
    consumed: { type: Number, default: 0 },
  },
  baseSchemaOptions
);

export const SecurityAuthorizationModel =
  mongoose.models.SecurityAuthorization ||
  mongoose.model<ISecurityAuthorization>('SecurityAuthorization', SecurityAuthorizationSchema, 'security_authorizations');
export default SecurityAuthorizationModel;
