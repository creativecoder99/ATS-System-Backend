import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

export interface ISavedJob extends Document {
  _id: Types.ObjectId;
  job: Types.ObjectId;
  user: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const savedJobSchema = new Schema<ISavedJob>(
  {
    job: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

// Saving the same job twice is a no-op, enforced at the index level.
savedJobSchema.index({ user: 1, job: 1 }, { unique: true });

export const SavedJob: Model<ISavedJob> =
  mongoose.models.SavedJob ?? mongoose.model<ISavedJob>('SavedJob', savedJobSchema);
