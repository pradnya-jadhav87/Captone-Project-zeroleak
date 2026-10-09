import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IPrintAnywhereJob {
  _id: string;
  id: string;
  exam_id: string;
  exam_name: string;
  exam_type: string;
  paper_id: string;
  centre_id: string;
  centre_name?: string;
  operator_id: string;
  operator_name: string;
  printer_id: string;
  printer_name: string;
  printer_location?: string;
  status: string;
  unlock_time?: string;
  requested_at: string;
  completed_at?: string;
  failure_reason?: string;
  copies_count?: number;
  tx_hash?: string;
  created_at: string;
}

const PrintAnywhereJobSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    exam_id: { type: String, required: true, index: true },
    exam_name: { type: String, required: true },
    exam_type: { type: String, required: true },
    paper_id: { type: String, required: true, index: true },
    centre_id: { type: String, required: true, index: true },
    centre_name: { type: String },
    operator_id: { type: String, required: true, index: true },
    operator_name: { type: String, required: true },
    printer_id: { type: String, required: true },
    printer_name: { type: String, required: true },
    printer_location: { type: String },
    status: { type: String, default: 'PENDING', index: true },
    unlock_time: { type: String },
    requested_at: { type: String, required: true },
    completed_at: { type: String },
    failure_reason: { type: String },
    copies_count: { type: Number, default: 1 },
    tx_hash: { type: String },
    created_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const PrintAnywhereJobModel = mongoose.models.PrintAnywhereJob || mongoose.model<IPrintAnywhereJob>('PrintAnywhereJob', PrintAnywhereJobSchema, 'print_anywhere_jobs');
export default PrintAnywhereJobModel;
