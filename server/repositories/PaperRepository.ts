import { v4 as uuidv4 } from 'uuid';
import { GeneratedPaperModel, IGeneratedPaper } from '../models/GeneratedPaper.ts';
import { CompetitiveGeneratedPaperModel, ICompetitiveGeneratedPaper } from '../models/CompetitiveGeneratedPaper.ts';
import { UniversityGeneratedPaperModel, IUniversityGeneratedPaper } from '../models/UniversityGeneratedPaper.ts';
import { EncryptedPaperModel, IEncryptedPaper } from '../models/EncryptedPaper.ts';
import { KeyShareModel, IKeyShare } from '../models/KeyShare.ts';
import { ViewOncePreviewSessionModel, IViewOncePreviewSession } from '../models/ViewOncePreviewSession.ts';

export class PaperRepository {
  // Synthesized / Multi-Paper Generator
  static async findGeneratedPaper(id: string): Promise<IGeneratedPaper | null> {
    return (await (GeneratedPaperModel as any).findOne({ $or: [{ _id: id }, { id }] }).lean()) as IGeneratedPaper | null;
  }

  static async findGeneratedPaperByFingerprint(fingerprint: string): Promise<IGeneratedPaper | null> {
    return (await (GeneratedPaperModel as any).findOne({ paper_fingerprint: fingerprint }).lean()) as IGeneratedPaper | null;
  }

  static async createGeneratedPaper(data: Partial<IGeneratedPaper> & { org_id: string; title: string; version_code: string; total_questions: number; paper_fingerprint: string; generated_by: string }): Promise<IGeneratedPaper> {
    const id = (data as any).id || (data as any)._id || uuidv4();
    const generated_at = data.generated_at || new Date().toISOString();
    return (await (GeneratedPaperModel as any).create({
      ...data,
      _id: id,
      id,
      generated_at,
    })) as IGeneratedPaper;
  }

  // Competitive Generated Papers
  static async findCompetitiveGeneratedPaper(id: string): Promise<ICompetitiveGeneratedPaper | null> {
    return (await (CompetitiveGeneratedPaperModel as any).findOne({ $or: [{ _id: id }, { id }] }).lean()) as ICompetitiveGeneratedPaper | null;
  }

  static async findCompetitivePaperByFingerprint(fingerprint: string): Promise<ICompetitiveGeneratedPaper | null> {
    return (await (CompetitiveGeneratedPaperModel as any).findOne({ paper_fingerprint: fingerprint }).lean()) as ICompetitiveGeneratedPaper | null;
  }

  static async createCompetitiveGeneratedPaper(data: Partial<ICompetitiveGeneratedPaper> & { org_id: string; exam_id: string; title: string; exam_type: string; total_questions: number; total_marks: number; paper_fingerprint: string }): Promise<ICompetitiveGeneratedPaper> {
    const id = (data as any).id || (data as any)._id || uuidv4();
    const generated_at = data.generated_at || new Date().toISOString();
    return (await (CompetitiveGeneratedPaperModel as any).create({
      ...data,
      _id: id,
      id,
      generated_at,
    })) as ICompetitiveGeneratedPaper;
  }

  static async updateCompetitiveGeneratedPaper(id: string, updates: Partial<ICompetitiveGeneratedPaper>): Promise<ICompetitiveGeneratedPaper | null> {
    return (await (CompetitiveGeneratedPaperModel as any).findOneAndUpdate(
      { $or: [{ _id: id }, { id }] },
      { $set: updates },
      { new: true }
    ).lean()) as ICompetitiveGeneratedPaper | null;
  }

  // University Generated Papers
  static async findUniversityGeneratedPaper(id: string): Promise<IUniversityGeneratedPaper | null> {
    return (await (UniversityGeneratedPaperModel as any).findOne({ $or: [{ _id: id }, { id }] }).lean()) as IUniversityGeneratedPaper | null;
  }

  static async createUniversityGeneratedPaper(data: Partial<IUniversityGeneratedPaper> & { exam_id: string; version_code: string; total_questions: number; pdf_filename: string; pdf_url: string; pdf_hash: string }): Promise<IUniversityGeneratedPaper> {
    const id = (data as any).id || (data as any)._id || uuidv4();
    const created_at = data.created_at || new Date().toISOString();
    return (await (UniversityGeneratedPaperModel as any).create({
      ...data,
      _id: id,
      id,
      created_at,
    })) as IUniversityGeneratedPaper;
  }

  static async updateUniversityGeneratedPaper(id: string, updates: Partial<IUniversityGeneratedPaper>): Promise<IUniversityGeneratedPaper | null> {
    return (await (UniversityGeneratedPaperModel as any).findOneAndUpdate(
      { $or: [{ _id: id }, { id }] },
      { $set: updates },
      { new: true }
    ).lean()) as IUniversityGeneratedPaper | null;
  }

  // Cryptographic Envelopes (AES-256-GCM)
  static async findEncryptedPaper(paperVersionId: string): Promise<IEncryptedPaper | null> {
    return (await (EncryptedPaperModel as any).findOne({ paper_version_id: paperVersionId }).lean()) as IEncryptedPaper | null;
  }

  static async saveEncryptedPaper(data: {
    paper_version_id: string;
    exam_id: string;
    aes_cipher_text: string;
    iv_hex: string;
    auth_tag_hex: string;
    encrypted_aes_key_rsa: string;
    key_fingerprint: string;
    checksum_sha256: string;
    encrypted_at?: string;
  }): Promise<IEncryptedPaper> {
    const id = uuidv4();
    const encrypted_at = data.encrypted_at || new Date().toISOString();
    return (await (EncryptedPaperModel as any).create({
      _id: id,
      id,
      ...data,
      encrypted_at,
    })) as IEncryptedPaper;
  }

  // Shamir Secret Key Shares
  static async saveKeyShares(shares: Array<{
    paper_version_id: string;
    share_index: number;
    threshold: number;
    total_shares: number;
    share_hash: string;
    share_payload?: string;
    holder_role?: string;
    holder_user_id?: string;
  }>): Promise<IKeyShare[]> {
    const created_at = new Date().toISOString();
    const docs = shares.map((s) => ({
      _id: uuidv4(),
      id: uuidv4(),
      ...s,
      created_at,
    }));
    return (await (KeyShareModel as any).insertMany(docs)) as IKeyShare[];
  }

  static async findKeyShares(paperVersionId: string): Promise<IKeyShare[]> {
    return (await (KeyShareModel as any).find({ paper_version_id: paperVersionId }).sort({ share_index: 1 }).lean()) as IKeyShare[];
  }

  // View-Once Preview Sessions
  static async findViewOnceSessionByToken(sessionToken: string): Promise<IViewOncePreviewSession | null> {
    return (await (ViewOncePreviewSessionModel as any).findOne({ session_token: sessionToken }).lean()) as IViewOncePreviewSession | null;
  }

  static async findActiveViewOnceSession(paperId: string): Promise<IViewOncePreviewSession | null> {
    return (await (ViewOncePreviewSessionModel as any).findOne({ paper_id: paperId }).sort({ created_at: -1 }).lean()) as IViewOncePreviewSession | null;
  }

  static async createViewOnceSession(data: {
    paper_id: string;
    exam_id: string;
    exam_type: string;
    user_id: string;
    user_role: string;
    session_token: string;
    started_at?: string;
    expires_at?: string;
  }): Promise<IViewOncePreviewSession> {
    const id = uuidv4();
    const created_at = new Date().toISOString();
    return (await (ViewOncePreviewSessionModel as any).create({
      _id: id,
      id,
      ...data,
      status: 'VIEWING',
      created_at,
    })) as IViewOncePreviewSession;
  }

  static async updateViewOnceSession(id: string, updates: Partial<IViewOncePreviewSession>): Promise<IViewOncePreviewSession | null> {
    return (await (ViewOncePreviewSessionModel as any).findOneAndUpdate(
      { $or: [{ _id: id }, { id }] },
      { $set: updates },
      { new: true }
    ).lean()) as IViewOncePreviewSession | null;
  }
}

export default PaperRepository;

