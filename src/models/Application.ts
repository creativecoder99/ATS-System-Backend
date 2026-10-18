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

export interface IParsedProfile {
  skills: string[];
  experienceYears: number;
  education: string[];
  summary: string;
  rawTextSnippet?: string;
  parsedAt?: Date;
}

export interface IRedactedProfile {
  anonymizedId: string;
  skills: string[];
  experienceYears: number;
  educationDegrees: string[];
  summary: string;
}

export interface IAiReview {
  matchScore: number; // 0-100
  rating: 'Strong Match' | 'Moderate Match' | 'Potential Match' | 'Low Fit';
  strengths: string[];
  gaps: string[];
  interviewQuestions: string[];
  summary: string;
  analyzedAt?: Date;
}

export interface IApplication extends Document {
  _id: Types.ObjectId;
  job: Types.ObjectId;
  applicant: Types.ObjectId;
  status: ApplicationStatus;
  coverLetter?: string;
  resumeUrl: string;
  history: { status: ApplicationStatus; at: Date; note?: string }[];
  parsedProfile?: IParsedProfile;
  redactedProfile?: IRedactedProfile;
  embedding?: number[];
  aiReview?: IAiReview;
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
    parsedProfile: {
      skills: [{ type: String }],
      experienceYears: { type: Number, default: 0 },
      education: [{ type: String }],
      summary: { type: String },
      rawTextSnippet: { type: String },
      parsedAt: { type: Date },
    },
    redactedProfile: {
      anonymizedId: { type: String },
      skills: [{ type: String }],
      experienceYears: { type: Number, default: 0 },
      educationDegrees: [{ type: String }],
      summary: { type: String },
    },
    embedding: {
      type: [Number],
      select: false, // Omit heavy embedding array from regular queries by default
    },
    aiReview: {
      matchScore: { type: Number },
      rating: {
        type: String,
        enum: ['Strong Match', 'Moderate Match', 'Potential Match', 'Low Fit'],
      },
      strengths: [{ type: String }],
      gaps: [{ type: String }],
      interviewQuestions: [{ type: String }],
      summary: { type: String },
      analyzedAt: { type: Date },
    },
  },
  { timestamps: true },
);

// The database, not the controller, is the final guard against double-applying.
applicationSchema.index({ job: 1, applicant: 1 }, { unique: true });

// Serves the candidate's "my applications, newest first" view.
applicationSchema.index({ applicant: 1, createdAt: -1 });

// Serves recruiter filtering by status on a job.
applicationSchema.index({ job: 1, status: 1 });

export const Application: Model<IApplication> =
  mongoose.models.Application ?? mongoose.model<IApplication>('Application', applicationSchema);
