import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IPaperBlueprint {
  _id: string;
  id: string;
  org_id: string;
  name: string;
  exam_id?: string;
  total_questions: number;
  subject_rules_json: string;
  difficulty_rules_json: string;
  max_source_contribution_percent: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const PaperBlueprintSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    org_id: { type: String, required: true, index: true },
    name: { type: String, required: true },
    exam_id: { type: String, index: true },
    total_questions: { type: Number, required: true },
    subject_rules_json: { type: String, required: true },
    difficulty_rules_json: { type: String, required: true },
    max_source_contribution_percent: { type: Number, default: 40.0 },
    created_by: { type: String, required: true },
    created_at: { type: String, required: true },
    updated_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const PaperBlueprintModel = mongoose.models.PaperBlueprint || mongoose.model<IPaperBlueprint>('PaperBlueprint', PaperBlueprintSchema, 'paper_blueprints');
export default PaperBlueprintModel;
