import bcrypt from 'bcryptjs';
import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

export const ROLES = ['candidate', 'recruiter', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const VERIFICATION_STATUSES = ['unverified', 'pending', 'verified', 'rejected'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export interface IVerificationDocument {
  _id?: Types.ObjectId;
  docType: string;
  title: string;
  fileUrl: string;
  originalName: string;
  fileSize?: number;
  mimeType?: string;
  uploadedAt: Date;
  status: 'pending' | 'verified' | 'rejected';
  adminNotes?: string;
}

export interface IUser extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password: string;
  role: Role;
  headline?: string;
  location?: string;
  skills: string[];
  experienceYears: number;
  company?: string;
  resumeUrl?: string;

  // Contact & Social
  phone?: string;
  bio?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  githubUrl?: string;

  // Candidate Details
  education?: string;
  currentCompany?: string;
  currentRole?: string;

  // Recruiter Details
  designation?: string;
  companyWebsite?: string;
  industry?: string;
  companySize?: string;
  officeAddress?: string;

  // Verification
  isVerified: boolean;
  verificationStatus: VerificationStatus;
  verificationDocuments: IVerificationDocument[];
  verificationSubmittedAt?: Date;
  verifiedAt?: Date;
  verifiedBy?: Types.ObjectId;
  verificationRejectionReason?: string;

  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const verificationDocSchema = new Schema<IVerificationDocument>(
  {
    docType: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    fileUrl: { type: String, required: true },
    originalName: { type: String, required: true },
    fileSize: { type: Number },
    mimeType: { type: String },
    uploadedAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending',
    },
    adminNotes: { type: String, trim: true },
  },
  { _id: true }
);

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 80 },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    // select:false keeps the hash out of every query result unless explicitly asked for.
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: ROLES, default: 'candidate', index: true },
    headline: { type: String, trim: true, maxlength: 140 },
    location: { type: String, trim: true, maxlength: 80 },
    skills: { type: [String], default: [] },
    experienceYears: { type: Number, default: 0, min: 0, max: 60 },
    company: { type: String, trim: true, maxlength: 100 },
    resumeUrl: { type: String },

    // Contact & Social
    phone: { type: String, trim: true, maxlength: 30 },
    bio: { type: String, trim: true, maxlength: 2000 },
    linkedinUrl: { type: String, trim: true },
    portfolioUrl: { type: String, trim: true },
    githubUrl: { type: String, trim: true },

    // Candidate Details
    education: { type: String, trim: true, maxlength: 250 },
    currentCompany: { type: String, trim: true, maxlength: 120 },
    currentRole: { type: String, trim: true, maxlength: 120 },

    // Recruiter Details
    designation: { type: String, trim: true, maxlength: 120 },
    companyWebsite: { type: String, trim: true },
    industry: { type: String, trim: true, maxlength: 80 },
    companySize: { type: String, trim: true, maxlength: 50 },
    officeAddress: { type: String, trim: true, maxlength: 250 },

    // Trust & Verification
    isVerified: { type: Boolean, default: false, index: true },
    verificationStatus: {
      type: String,
      enum: VERIFICATION_STATUSES,
      default: 'unverified',
      index: true,
    },
    verificationDocuments: { type: [verificationDocSchema], default: [] },
    verificationSubmittedAt: { type: Date },
    verifiedAt: { type: Date },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    verificationRejectionReason: { type: String, trim: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        // Belt-and-braces alongside select:false — even a document that was
        // loaded with the hash must not serialise it to a client.
        const { password, __v, ...safe } = ret as Record<string, unknown>;
        void password;
        void __v;
        return safe;
      },
    },
  },
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate: string) {
  return bcrypt.compare(candidate, this.password);
};

export const User: Model<IUser> =
  mongoose.models.User ?? mongoose.model<IUser>('User', userSchema);
