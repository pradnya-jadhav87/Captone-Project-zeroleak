import { v4 as uuidv4 } from 'uuid';
import { QuestionModel, IQuestion } from '../models/Question.ts';
import { CompetitiveQuestionModel, ICompetitiveQuestion } from '../models/CompetitiveQuestion.ts';
import { QuestionQuarantineModel, IQuestionQuarantine } from '../models/QuestionQuarantine.ts';
import { QuestionPaperModel, IQuestionPaper } from '../models/QuestionPaper.ts';

export class QuestionRepository {
  // Universal Questions
  static async findQuestionById(id: string): Promise<IQuestion | null> {
    return (await (QuestionModel as any).findOne({ $or: [{ _id: id }, { id }] }).lean()) as IQuestion | null;
  }

  static async listQuestions(filter: any = {}): Promise<IQuestion[]> {
    return (await (QuestionModel as any).find(filter).sort({ created_at: -1 }).lean()) as IQuestion[];
  }

  static async createQuestion(data: Partial<IQuestion> & { org_id: string; subject: string; topic: string; correct_answer: string; content_text: string; created_by: string }): Promise<IQuestion> {
    const id = (data as any).id || (data as any)._id || uuidv4();
    const created_at = data.created_at || new Date().toISOString();
    const updated_at = data.updated_at || created_at;
    return (await (QuestionModel as any).create({
      ...data,
      _id: id,
      id,
      created_at,
      updated_at,
    })) as IQuestion;
  }

  static async updateQuestion(id: string, updates: Partial<IQuestion>): Promise<IQuestion | null> {
    return (await (QuestionModel as any).findOneAndUpdate(
      { $or: [{ _id: id }, { id }] },
      { $set: { ...updates, updated_at: new Date().toISOString() } },
      { new: true }
    ).lean()) as IQuestion | null;
  }

  // Competitive Questions
  static async findCompetitiveQuestion(id: string): Promise<ICompetitiveQuestion | null> {
    return (await (CompetitiveQuestionModel as any).findOne({ $or: [{ _id: id }, { id }] }).lean()) as ICompetitiveQuestion | null;
  }

  static async listCompetitiveQuestions(filter: any = {}): Promise<ICompetitiveQuestion[]> {
    return (await (CompetitiveQuestionModel as any).find(filter).sort({ created_at: -1 }).lean()) as ICompetitiveQuestion[];
  }

  static async createCompetitiveQuestion(data: Partial<ICompetitiveQuestion> & { org_id: string; exam_id: string; subject: string; content_text: string }): Promise<ICompetitiveQuestion> {
    const id = (data as any).id || (data as any)._id || uuidv4();
    const created_at = data.created_at || new Date().toISOString();
    return (await (CompetitiveQuestionModel as any).create({
      ...data,
      _id: id,
      id,
      created_at,
    })) as ICompetitiveQuestion;
  }

  static async updateCompetitiveQuestion(id: string, updates: Partial<ICompetitiveQuestion>): Promise<ICompetitiveQuestion | null> {
    return (await (CompetitiveQuestionModel as any).findOneAndUpdate(
      { $or: [{ _id: id }, { id }] },
      { $set: { ...updates, updated_at: new Date().toISOString() } },
      { new: true }
    ).lean()) as ICompetitiveQuestion | null;
  }

  // Question Quarantine
  static async quarantineQuestion(data: {
    question_id: string;
    reason: string;
    reported_by: string;
    notes?: string;
  }): Promise<IQuestionQuarantine> {
    const id = uuidv4();
    const quarantined_at = new Date().toISOString();
    return (await (QuestionQuarantineModel as any).create({
      _id: id,
      id,
      ...data,
      status: 'QUARANTINED',
      quarantined_at,
    })) as IQuestionQuarantine;
  }

  static async listQuarantinedQuestions(filter: any = {}): Promise<IQuestionQuarantine[]> {
    return (await (QuestionQuarantineModel as any).find(filter).sort({ quarantined_at: -1 }).lean()) as IQuestionQuarantine[];
  }

  // Question Papers (Source PDF assets)
  static async findQuestionPaper(id: string): Promise<IQuestionPaper | null> {
    return (await (QuestionPaperModel as any).findOne({ $or: [{ _id: id }, { id }] }).lean()) as IQuestionPaper | null;
  }

  static async listQuestionPapers(filter: any = {}): Promise<IQuestionPaper[]> {
    return (await (QuestionPaperModel as any).find(filter).sort({ uploaded_at: -1 }).lean()) as IQuestionPaper[];
  }
}

export default QuestionRepository;

