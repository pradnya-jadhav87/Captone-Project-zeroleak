import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IAicteUniversity {
  _id: string;
  id: string;
  aicte_id: string;
  name: string;
  short_code: string;
  nirf_rank?: number;
  type: string;
  state: string;
  city: string;
  official_email: string;
  website: string;
  contact_number: string;
  headquarters_address: string;
  auth_id: string;
  created_at: string;
}

const AicteUniversitySchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    aicte_id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    short_code: { type: String, required: true },
    nirf_rank: { type: Number },
    type: { type: String, required: true },
    state: { type: String, required: true },
    city: { type: String, required: true },
    official_email: { type: String, required: true },
    website: { type: String, required: true },
    contact_number: { type: String, required: true },
    headquarters_address: { type: String, required: true },
    auth_id: { type: String, required: true },
    created_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const AicteUniversityModel = mongoose.models.AicteUniversity || mongoose.model<IAicteUniversity>('AicteUniversity', AicteUniversitySchema, 'aicte_universities');
export default AicteUniversityModel;
