import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IEncryptedPaper {
  _id: string;
  id: string;
  paper_version_id: string;
  exam_id: string;
  aes_cipher_text: string;
  iv_hex: string;
  auth_tag_hex: string;
  encrypted_aes_key_rsa: string;
  key_fingerprint: string;
  checksum_sha256: string;
  encrypted_at: string;
}

const EncryptedPaperSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    paper_version_id: { type: String, required: true, unique: true, index: true },
    exam_id: { type: String, required: true, index: true },
    aes_cipher_text: { type: String, required: true },
    iv_hex: { type: String, required: true },
    auth_tag_hex: { type: String, required: true },
    encrypted_aes_key_rsa: { type: String, required: true },
    key_fingerprint: { type: String, required: true },
    checksum_sha256: { type: String, required: true },
    encrypted_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const EncryptedPaperModel = mongoose.models.EncryptedPaper || mongoose.model<IEncryptedPaper>('EncryptedPaper', EncryptedPaperSchema, 'encrypted_papers');
export default EncryptedPaperModel;
