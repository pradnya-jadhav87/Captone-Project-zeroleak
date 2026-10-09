import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IPaperVersion {
  _id: string;
  id: string;
  exam_id: string;
  version_code: string;
  status: string;
  is_current: number;
  generated_by: string;
  generated_at: string;
  invalidated_at?: string;
  invalidation_reason?: string;
}

const PaperVersionSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    exam_id: { type: String, required: true, index: true },
    version_code: { type: String, required: true, index: true },
    status: { type: String, required: true, index: true },
    is_current: { type: Number, default: 1 },
    generated_by: { type: String, required: true },
    generated_at: { type: String, required: true },
    invalidated_at: { type: String },
    invalidation_reason: { type: String },
  },
  baseSchemaOptions
);

export const PaperVersionModel = mongoose.models.PaperVersion || mongoose.model<IPaperVersion>('PaperVersion', PaperVersionSchema, 'paper_versions');
export default PaperVersionModel;
