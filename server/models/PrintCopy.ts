import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IPrintCopy {
  _id: string;
  id: string;
  copy_id: string;
  exam_id: string;
  paper_version_id: string;
  centre_id: string;
  operator_user_id: string;
  device_id: string;
  printed_at: string;
  status: string;
  tx_hash: string;
}

const PrintCopySchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    copy_id: { type: String, required: true, unique: true, index: true },
    exam_id: { type: String, required: true, index: true },
    paper_version_id: { type: String, required: true, index: true },
    centre_id: { type: String, required: true, index: true },
    operator_user_id: { type: String, required: true, index: true },
    device_id: { type: String, required: true },
    printed_at: { type: String, required: true },
    status: { type: String, default: 'PRINTED' },
    tx_hash: { type: String, required: true },
  },
  baseSchemaOptions
);

export const PrintCopyModel = mongoose.models.PrintCopy || mongoose.model<IPrintCopy>('PrintCopy', PrintCopySchema, 'print_copies');
export default PrintCopyModel;
