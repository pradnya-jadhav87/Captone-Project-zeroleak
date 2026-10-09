import { v4 as uuidv4 } from 'uuid';
import { ExaminationModel, IExamination } from '../models/Examination.ts';
import { CompetitiveExamModel, ICompetitiveExam } from '../models/CompetitiveExam.ts';
import { ExaminationConfigurationModel, IExaminationConfiguration } from '../models/ExaminationConfiguration.ts';
import { PaperBlueprintModel, IPaperBlueprint } from '../models/PaperBlueprint.ts';

export class ExamRepository {
  // University Examinations
  static async findExaminationById(id: string): Promise<IExamination | null> {
    return (await (ExaminationModel as any).findOne({ $or: [{ _id: id }, { id }] }).lean()) as IExamination | null;
  }

  static async listExaminations(filter: any = {}): Promise<IExamination[]> {
    return (await (ExaminationModel as any).find(filter).sort({ created_at: -1 }).lean()) as IExamination[];
  }

  static async createExamination(data: Partial<IExamination> & { name: string; org_id: string; subject: string; category: string; exam_type: string; exam_date: string; exam_time: string; unlock_time: string; created_by: string }): Promise<IExamination> {
    const id = (data as any).id || (data as any)._id || uuidv4();
    const created_at = data.created_at || new Date().toISOString();
    const updated_at = data.updated_at || created_at;
    return (await (ExaminationModel as any).create({
      ...data,
      _id: id,
      id,
      created_at,
      updated_at,
    })) as IExamination;
  }

  static async updateExamination(id: string, updates: Partial<IExamination>): Promise<IExamination | null> {
    return (await (ExaminationModel as any).findOneAndUpdate(
      { $or: [{ _id: id }, { id }] },
      { $set: { ...updates, updated_at: new Date().toISOString() } },
      { new: true }
    ).lean()) as IExamination | null;
  }

  // Competitive Examinations
  static async findCompetitiveExamById(id: string): Promise<ICompetitiveExam | null> {
    return (await (CompetitiveExamModel as any).findOne({ $or: [{ _id: id }, { id }] }).lean()) as ICompetitiveExam | null;
  }

  static async listCompetitiveExams(filter: any = {}): Promise<ICompetitiveExam[]> {
    return (await (CompetitiveExamModel as any).find(filter).sort({ created_at: -1 }).lean()) as ICompetitiveExam[];
  }

  static async createCompetitiveExam(data: Partial<ICompetitiveExam> & { org_id: string; name: string; exam_type: string }): Promise<ICompetitiveExam> {
    const id = (data as any).id || (data as any)._id || uuidv4();
    const created_at = data.created_at || new Date().toISOString();
    const updated_at = data.updated_at || created_at;
    return (await (CompetitiveExamModel as any).create({
      ...data,
      _id: id,
      id,
      created_at,
      updated_at,
    })) as ICompetitiveExam;
  }

  static async updateCompetitiveExam(id: string, updates: Partial<ICompetitiveExam>): Promise<ICompetitiveExam | null> {
    return (await (CompetitiveExamModel as any).findOneAndUpdate(
      { $or: [{ _id: id }, { id }] },
      { $set: { ...updates, updated_at: new Date().toISOString() } },
      { new: true }
    ).lean()) as ICompetitiveExam | null;
  }

  // Blueprints
  static async findBlueprintById(id: string): Promise<IPaperBlueprint | null> {
    return (await (PaperBlueprintModel as any).findOne({ $or: [{ _id: id }, { id }] }).lean()) as IPaperBlueprint | null;
  }

  static async listBlueprints(filter: any = {}): Promise<IPaperBlueprint[]> {
    return (await (PaperBlueprintModel as any).find(filter).sort({ created_at: -1 }).lean()) as IPaperBlueprint[];
  }

  static async createBlueprint(data: Partial<IPaperBlueprint> & { org_id: string; name: string; total_questions: number; subject_rules_json: string; difficulty_rules_json: string; created_by: string }): Promise<IPaperBlueprint> {
    const id = (data as any).id || (data as any)._id || uuidv4();
    const created_at = data.created_at || new Date().toISOString();
    const updated_at = data.updated_at || created_at;
    return (await (PaperBlueprintModel as any).create({
      ...data,
      _id: id,
      id,
      created_at,
      updated_at,
    })) as IPaperBlueprint;
  }

  static async findExamConfiguration(examId: string): Promise<IExaminationConfiguration | null> {
    return (await (ExaminationConfigurationModel as any).findOne({ exam_id: examId }).lean()) as IExaminationConfiguration | null;
  }
}

export default ExamRepository;

