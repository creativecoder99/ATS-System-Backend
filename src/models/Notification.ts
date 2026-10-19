import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

export type NotificationType =
  | 'status_update'
  | 'application_received'
  | 'job_alert'
  | 'system'
  | 'verification_submitted'
  | 'verification_approved'
  | 'verification_rejected';

export interface INotification extends Document {
  _id: Types.ObjectId;
  recipient: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: [
        'status_update',
        'application_received',
        'job_alert',
        'system',
        'verification_submitted',
        'verification_approved',
        'verification_rejected',
      ],
      default: 'status_update',
    },
    title: { type: String, required: true, maxlength: 150 },
    message: { type: String, required: true, maxlength: 1000 },
    link: { type: String, maxlength: 300 },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

notificationSchema.index({ recipient: 1, createdAt: -1 });

export const Notification: Model<INotification> =
  mongoose.models.Notification ?? mongoose.model<INotification>('Notification', notificationSchema);
