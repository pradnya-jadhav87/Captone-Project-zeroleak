import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface IDeletedVaultAsset {
  _id: string;
  public_id: string;
  cloudinary_url?: string;
  deleted_at: string;
}

const DeletedVaultAssetSchema = new Schema(
  {
    _id: { type: String, required: true },
    public_id: { type: String, required: true, unique: true, index: true },
    cloudinary_url: { type: String },
    deleted_at: { type: String, required: true },
  },
  baseSchemaOptions
);

export const DeletedVaultAssetModel = mongoose.models.DeletedVaultAsset || mongoose.model<IDeletedVaultAsset>('DeletedVaultAsset', DeletedVaultAssetSchema, 'deleted_vault_assets');
export default DeletedVaultAssetModel;
