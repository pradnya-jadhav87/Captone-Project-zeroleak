import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IEmergencyIncident {
  _id: string;
  id: string;
  exam_id: string;
  exam_type: 'UNIVERSITY' | 'COMPETITIVE';
  paper_id?: string;
  subject?: string;
  subject_code?: string;
  threat_type: string;
  threat_severity: 'HIGH' | 'CRITICAL';
  status: 'ACTIVE' | 'RESOLVED' | 'EMERGENCY_PAPER_GENERATED' | 'EMERGENCY_PAPER_APPROVED';
  detected_at: string;
  original_paper_status: 'COMPROMISED' | 'LOCKED_EMERGENCY';
  compromised_question_ids?: string;
  emergency_paper_id?: string;
  resolved_at?: string;
  resolved_by?: string;
  details_json?: string;
}

const EmergencyIncidentSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    exam_id: { type: String, required: true, index: true },
    exam_type: { type: String, required: true, index: true },
    paper_id: { type: String, index: true },
    subject: { type: String },
    subject_code: { type: String },
    threat_type: { type: String, required: true, index: true },
    threat_severity: { type: String, required: true, index: true },
    status: { type: String, default: 'ACTIVE', index: true },
    detected_at: { type: String, required: true, index: true },
    original_paper_status: { type: String, default: 'LOCKED_EMERGENCY' },
    compromised_question_ids: { type: String },
    emergency_paper_id: { type: String, index: true },
    resolved_at: { type: String },
    resolved_by: { type: String },
    details_json: { type: String },
  },
  baseSchemaOptions
);

export const EmergencyIncidentModel =
  mongoose.models.EmergencyIncident ||
  mongoose.model<IEmergencyIncident>('EmergencyIncident', EmergencyIncidentSchema, 'emergency_incidents');
export default EmergencyIncidentModel;
