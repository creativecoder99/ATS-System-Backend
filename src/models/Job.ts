import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

export const JOB_TYPES = ['full-time', 'part-time', 'internship', 'contract'] as const;
export const WORK_MODES = ['on-site', 'remote', 'hybrid'] as const;
export const JOB_STATUS = ['open', 'closed'] as const;

export type JobType = (typeof JOB_TYPES)[number];
export type WorkMode = (typeof WORK_MODES)[number];
export type JobStatus = (typeof JOB_STATUS)[number];

export interface IJob extends Document {
  _id: Types.ObjectId;
  title: string;
  company: string;
  description: string;
  location: string;
  workMode: WorkMode;
  type: JobType;
  skills: string[];
  salaryMin: number;
  salaryMax: number;
  experienceMin: number;
  openings: number;
  status: JobStatus;
  postedBy: Types.ObjectId;
  applicantCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const jobSchema = new Schema<IJob>(
  {
    title: { type: String, required: [true, 'Title is required'], trim: true, maxlength: 120 },
    company: { type: String, required: [true, 'Company is required'], trim: true, maxlength: 100 },
    description: { type: String, required: true, maxlength: 8000 },
    location: { type: String, required: true, trim: true, maxlength: 80 },
    workMode: { type: String, enum: WORK_MODES, default: 'on-site' },
    type: { type: String, enum: JOB_TYPES, default: 'full-time' },
    skills: { type: [String], default: [], index: true },
    salaryMin: { type: Number, default: 0, min: 0 },
    salaryMax: { type: Number, default: 0, min: 0 },
    experienceMin: { type: Number, default: 0, min: 0, max: 40 },
    openings: { type: Number, default: 1, min: 1 },
    status: { type: String, enum: JOB_STATUS, default: 'open', index: true },
    postedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Denormalised counter maintained on apply/withdraw. Saves an aggregate join
    // on the hot listing path, where every card shows an applicant count.
    applicantCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

// Full-text search across the fields users actually type into a search box.
// Weighted so a title match outranks a description mention.
jobSchema.index(
  { title: 'text', company: 'text', description: 'text', skills: 'text' },
  { weights: { title: 10, company: 5, skills: 4, description: 1 }, name: 'job_text_search' },
);

// Compound index matching the default listing query: open jobs, newest first.
jobSchema.index({ status: 1, createdAt: -1 });

jobSchema.pre('validate', function checkSalaryRange(next) {
  if (this.salaryMax && this.salaryMin && this.salaryMax < this.salaryMin) {
    this.invalidate('salaryMax', 'Maximum salary cannot be lower than minimum salary');
  }
  next();
});

export const Job: Model<IJob> = mongoose.models.Job ?? mongoose.model<IJob>('Job', jobSchema);
