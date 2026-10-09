import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './common.ts';

export interface INotification {
  _id: string;
  id: string;
  user_id?: string;
  role?: string;
  org_id?: string;
  title: string;
  message: string;
  category: string;
  is_read: number;
  created_at: string;
}

const NotificationSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, index: true },
    user_id: { type: String, index: true },
    role: { type: String, index: true },
    org_id: { type: String, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    category: { type: String, required: true },
    is_read: { type: Number, default: 0, index: true },
    created_at: { type: String, required: true, index: true },
  },
  baseSchemaOptions
);

export const NotificationModel = mongoose.models.Notification || mongoose.model<INotification>('Notification', NotificationSchema, 'notifications');
export default NotificationModel;
