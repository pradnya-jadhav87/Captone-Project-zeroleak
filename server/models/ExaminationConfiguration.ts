import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IExaminationConfiguration {
  _id: string;
  id: string;
  exam_id: string;
  blueprint_json?: string;
  theory_pattern_json?: string;
  pattern_confirmed?: number;
  reference_template_text?: string;
  created_at: string;
  updated_at: string;
}

const ExaminationConfigurationSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    exam_id: { type: String, required: true, unique: true, index: true },
    blueprint_json: { type: String },
    theory_pattern_json: { type: String },
    pattern_confirmed: { type: Number, default: 0 },
    reference_template_text: { type: String },
    created_at: { type: String, required: true },
    updated_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const ExaminationConfigurationModel = mongoose.models.ExaminationConfiguration || mongoose.model<IExaminationConfiguration>('ExaminationConfiguration', ExaminationConfigurationSchema, 'examination_configurations');
export default ExaminationConfigurationModel;
