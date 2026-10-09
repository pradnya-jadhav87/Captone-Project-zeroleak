import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IKeyShare {
  _id: string;
  id: string;
  paper_version_id: string;
  share_index: number;
  threshold: number;
  total_shares: number;
  share_hash: string;
  share_payload?: string;
  holder_role?: string;
  holder_user_id?: string;
  created_at: string;
}

const KeyShareSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    paper_version_id: { type: String, required: true, index: true },
    share_index: { type: Number, required: true },
    threshold: { type: Number, required: true },
    total_shares: { type: Number, required: true },
    share_hash: { type: String, required: true },
    share_payload: { type: String },
    holder_role: { type: String },
    holder_user_id: { type: String },
    created_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const KeyShareModel = mongoose.models.KeyShare || mongoose.model<IKeyShare>('KeyShare', KeyShareSchema, 'key_shares');
export default KeyShareModel;
