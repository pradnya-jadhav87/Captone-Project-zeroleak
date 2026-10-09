import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IVariantLifecycleEvent {
  _id: string;
  id: string;
  org_id: string;
  exam_id: string;
  variant_id: string;
  variant_code: string;
  action: string;
  performed_by: string;
  user_role: string;
  reason?: string;
  previous_state: string;
  new_state: string;
  timestamp: string;
}

const VariantLifecycleEventSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    org_id: { type: String, required: true, index: true },
    exam_id: { type: String, required: true, index: true },
    variant_id: { type: String, required: true, index: true },
    variant_code: { type: String, required: true },
    action: { type: String, required: true },
    performed_by: { type: String, required: true },
    user_role: { type: String, required: true },
    reason: { type: String },
    previous_state: { type: String, required: true },
    new_state: { type: String, required: true },
    timestamp: { type: String, required: true, index: true },
  },
  baseSchemaOptions
);

export const VariantLifecycleEventModel = mongoose.models.VariantLifecycleEvent || mongoose.model<IVariantLifecycleEvent>('VariantLifecycleEvent', VariantLifecycleEventSchema, 'variant_lifecycle_events');
export default VariantLifecycleEventModel;
