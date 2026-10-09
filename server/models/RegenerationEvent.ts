import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IRegenerationEvent {
  _id: string;
  id: string;
  exam_id: string;
  old_paper_version_id: string;
  new_paper_version_id: string;
  triggered_by: string;
  reason: string;
  quarantined_questions_count: number;
  timestamp: string;
}

const RegenerationEventSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    exam_id: { type: String, required: true, index: true },
    old_paper_version_id: { type: String, required: true },
    new_paper_version_id: { type: String, required: true },
    triggered_by: { type: String, required: true },
    reason: { type: String, required: true },
    quarantined_questions_count: { type: Number, default: 0 },
    timestamp: { type: String, required: true },
  },
  baseSchemaOptions
);

export const RegenerationEventModel = mongoose.models.RegenerationEvent || mongoose.model<IRegenerationEvent>('RegenerationEvent', RegenerationEventSchema, 'regeneration_events');
export default RegenerationEventModel;
