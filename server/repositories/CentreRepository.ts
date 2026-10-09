import { v4 as uuidv4 } from 'uuid';
import { ExaminationCentreModel, IExaminationCentre } from '../models/ExaminationCentre.ts';
import { PrintAnywhereJobModel, IPrintAnywhereJob } from '../models/PrintAnywhereJob.ts';
import { PrintCopyModel, IPrintCopy } from '../models/PrintCopy.ts';

export class CentreRepository {
  static async findCentreById(id: string): Promise<IExaminationCentre | null> {
    return (await (ExaminationCentreModel as any).findOne({ $or: [{ _id: id }, { id }] }).lean()) as IExaminationCentre | null;
  }

  static async listCentres(filter: any = {}): Promise<IExaminationCentre[]> {
    return (await (ExaminationCentreModel as any).find(filter).sort({ centre_name: 1 }).lean()) as IExaminationCentre[];
  }

  static async createCentre(data: Partial<IExaminationCentre> & { exam_id: string; centre_code: string; centre_name: string; city: string; address: string }): Promise<IExaminationCentre> {
    const id = (data as any).id || (data as any)._id || uuidv4();
    const created_at = data.created_at || new Date().toISOString();
    return (await (ExaminationCentreModel as any).create({
      ...data,
      _id: id,
      id,
      created_at,
    })) as IExaminationCentre;
  }

  static async updateCentre(id: string, updates: Partial<IExaminationCentre>): Promise<IExaminationCentre | null> {
    return (await (ExaminationCentreModel as any).findOneAndUpdate(
      { $or: [{ _id: id }, { id }] },
      { $set: updates },
      { new: true }
    ).lean()) as IExaminationCentre | null;
  }

  // Print Anywhere Jobs
  static async createPrintAnywhereJob(data: Partial<IPrintAnywhereJob> & { exam_id: string; exam_name: string; exam_type: string; paper_id: string; centre_id: string; operator_id: string; operator_name: string; printer_id: string; printer_name: string }): Promise<IPrintAnywhereJob> {
    const id = (data as any).id || (data as any)._id || uuidv4();
    const created_at = data.created_at || new Date().toISOString();
    return (await (PrintAnywhereJobModel as any).create({
      ...data,
      _id: id,
      id,
      created_at,
    })) as IPrintAnywhereJob;
  }

  static async updatePrintJob(id: string, updates: Partial<IPrintAnywhereJob>): Promise<IPrintAnywhereJob | null> {
    return (await (PrintAnywhereJobModel as any).findOneAndUpdate(
      { $or: [{ _id: id }, { id }] },
      { $set: updates },
      { new: true }
    ).lean()) as IPrintAnywhereJob | null;
  }

  static async listPrintJobs(filter: any = {}): Promise<IPrintAnywhereJob[]> {
    return (await (PrintAnywhereJobModel as any).find(filter).sort({ requested_at: -1 }).lean()) as IPrintAnywhereJob[];
  }

  // Numbered Physical Print Copies
  static async logPrintCopy(data: {
    copy_id: string;
    exam_id: string;
    paper_version_id: string;
    centre_id: string;
    operator_user_id: string;
    device_id: string;
    tx_hash: string;
    printed_at?: string;
  }): Promise<IPrintCopy> {
    const id = uuidv4();
    const printed_at = data.printed_at || new Date().toISOString();
    return (await (PrintCopyModel as any).create({
      _id: id,
      id,
      ...data,
      printed_at,
      status: 'PRINTED',
    })) as IPrintCopy;
  }

  static async listPrintCopies(filter: any = {}): Promise<IPrintCopy[]> {
    return (await (PrintCopyModel as any).find(filter).sort({ printed_at: -1 }).lean()) as IPrintCopy[];
  }
}

export default CentreRepository;

