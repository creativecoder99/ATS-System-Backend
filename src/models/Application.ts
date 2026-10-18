import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

export const APPLICATION_STATUS = [
  'applied',
  'shortlisted',
  'interview',
  'offered',
  'rejected',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUS)[number];

/**
 * Allowed status moves. A recruiter can advance a candidate or reject at any
 * point, but cannot walk a decision backwards — that keeps the pipeline
 * auditable and stops accidental un-rejections.
 */
export const STATUS_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  applied: ['shortlisted', 'rejected'],
  shortlisted: ['interview', 'rejected'],
  interview: ['offered', 'rejected'],
  offered: [],
  rejected: [],
};

export interface IApplication extends Document {
  _id: Types.ObjectId;
  job: Types.ObjectId;
  applicant: Types.ObjectId;
  status: ApplicationStatus;
  coverLetter?: string;
  resumeUrl: string;
  history: { status: ApplicationStatus; at: Date; note?: string }[];
  createdAt: Date;
  updatedAt: Date;
}

const applicationSchema = new Schema<IApplication>(
  {
    job: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    applicant: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: APPLICATION_STATUS, default: 'applied', index: true },
    coverLetter: { type: String, maxlength: 3000 },
    resumeUrl: { type: String, required: true },
    history: {
      type: [
        {
          _id: false,
          status: { type: String, enum: APPLICATION_STATUS, required: true },
          at: { type: Date, default: Date.now },
          note: { type: String, maxlength: 500 },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

// The database, not the controller, is the final guard against double-applying.
applicationSchema.index({ job: 1, applicant: 1 }, { unique: true });

// Serves the candidate's "my applications, newest first" view.
applicationSchema.index({ applicant: 1, createdAt: -1 });

export const Application: Model<IApplication> =
  mongoose.models.Application ?? mongoose.model<IApplication>('Application', applicationSchema);
