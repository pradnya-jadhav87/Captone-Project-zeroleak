import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IPaperReleaseEvent {
  _id: string;
  id: string;
  paper_version_id: string;
  exam_id: string;
  centre_id: string;
  operator_user_id: string;
  released_at: string;
  ip_address?: string;
}

const PaperReleaseEventSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    paper_version_id: { type: String, required: true, index: true },
    exam_id: { type: String, required: true, index: true },
    centre_id: { type: String, required: true, index: true },
    operator_user_id: { type: String, required: true, index: true },
    released_at: { type: String, required: true },
    ip_address: { type: String },
  },
  baseSchemaOptions
);

export const PaperReleaseEventModel = mongoose.models.PaperReleaseEvent || mongoose.model<IPaperReleaseEvent>('PaperReleaseEvent', PaperReleaseEventSchema, 'paper_release_events');
export default PaperReleaseEventModel;
