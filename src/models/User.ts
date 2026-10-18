import bcrypt from 'bcryptjs';
import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

export const ROLES = ['candidate', 'recruiter', 'admin'] as const;
export type Role = (typeof ROLES)[number];

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
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

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
