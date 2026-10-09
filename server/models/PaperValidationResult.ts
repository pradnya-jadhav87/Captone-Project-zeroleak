import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IPaperValidationResult {
  _id: string;
  id: string;
  paper_version_id: string;
  is_valid: number;
  validation_errors_json?: string;
  validated_at: string;
}

const PaperValidationResultSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    paper_version_id: { type: String, required: true, index: true },
    is_valid: { type: Number, required: true },
    validation_errors_json: { type: String },
    validated_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const PaperValidationResultModel = mongoose.models.PaperValidationResult || mongoose.model<IPaperValidationResult>('PaperValidationResult', PaperValidationResultSchema, 'paper_validation_results');
export default PaperValidationResultModel;
