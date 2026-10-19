import path from 'node:path';
import fs from 'node:fs/promises';
import type { Request, Response } from 'express';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { UPLOAD_DIR } from '../middleware/upload.js';
import { sendNotification } from './notification.controller.js';
import {
  REFRESH_COOKIE,
  clearRefreshCookie,
  setRefreshCookie,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/tokens.js';

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password, role, company } = req.body;

  if (await User.exists({ email })) {
    throw ApiError.conflict('An account with that email already exists');
  }

  const user = await User.create({ name, email, password, role, company });
  const payload = { sub: user._id.toString(), role: user.role };

  setRefreshCookie(res, signRefreshToken(payload));
  res.status(201).json({
    success: true,
    data: { user: user.toJSON(), accessToken: signAccessToken(payload) },
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  // password is select:false on the schema, so ask for it explicitly.
  const user = await User.findOne({ email }).select('+password');
  // Same message for "no such user" and "wrong password" so the endpoint
  // cannot be used to enumerate which emails have accounts.
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const payload = { sub: user._id.toString(), role: user.role };
  setRefreshCookie(res, signRefreshToken(payload));
  res.json({
    success: true,
    data: { user: user.toJSON(), accessToken: signAccessToken(payload) },
  });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw ApiError.unauthorized('No refresh token provided');

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw ApiError.unauthorized('Refresh token is invalid or expired');
  }

  // Re-read the user so a deleted account or changed role cannot keep
  // refreshing its way into a valid session.
  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('Account no longer exists');

  const next = { sub: user._id.toString(), role: user.role };
  setRefreshCookie(res, signRefreshToken(next));
  res.json({
    success: true,
    data: { user: user.toJSON(), accessToken: signAccessToken(next) },
  });
});

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  clearRefreshCookie(res);
  res.json({ success: true, message: 'Logged out' });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw ApiError.notFound('User not found');
  res.json({ success: true, data: user.toJSON() });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findByIdAndUpdate(req.user!.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!user) throw ApiError.notFound('User not found');
  res.json({ success: true, data: user.toJSON() });
});

/**
 * POST /api/auth/me/verification-docs — uploads a verification document for candidate/recruiter.
 */
export const uploadVerificationDocHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw ApiError.badRequest('Please upload a document file (PDF, Word, or image up to 10MB)');
  }

  const { docType, title } = req.body;
  if (!docType || !title) {
    throw ApiError.badRequest('Document type and title are required');
  }

  const user = await User.findById(req.user!.id);
  if (!user) throw ApiError.notFound('User not found');

  const newDoc = {
    docType: docType.trim(),
    title: title.trim(),
    fileUrl: `/uploads/${req.file.filename}`,
    originalName: req.file.originalname,
    fileSize: req.file.size,
    mimeType: req.file.mimetype,
    uploadedAt: new Date(),
    status: 'pending' as const,
  };

  user.verificationDocuments.push(newDoc as any);
  if (user.verificationStatus === 'unverified' || user.verificationStatus === 'rejected') {
    user.verificationStatus = 'pending';
    user.verificationSubmittedAt = new Date();
  }
  await user.save();

  res.status(201).json({
    success: true,
    message: 'Verification document uploaded successfully',
    data: user.toJSON(),
  });
});

/**
 * DELETE /api/auth/me/verification-docs/:docId — removes an uploaded verification document.
 */
export const deleteVerificationDocHandler = asyncHandler(async (req: Request, res: Response) => {
  const { docId } = req.params;
  const user = await User.findById(req.user!.id);
  if (!user) throw ApiError.notFound('User not found');

  const doc = (user.verificationDocuments as any).id(docId);
  if (!doc) throw ApiError.notFound('Verification document not found');

  const filename = path.basename(doc.fileUrl);
  const filePath = path.join(UPLOAD_DIR, filename);
  await fs.unlink(filePath).catch(() => {});

  doc.deleteOne();
  if (user.verificationDocuments.length === 0 && !user.isVerified) {
    user.verificationStatus = 'unverified';
  }
  await user.save();

  res.json({
    success: true,
    message: 'Verification document removed',
    data: user.toJSON(),
  });
});

/**
 * POST /api/auth/me/submit-verification — submits user documents to admin review.
 */
export const submitVerificationRequest = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw ApiError.notFound('User not found');

  if (!user.verificationDocuments || user.verificationDocuments.length === 0) {
    throw ApiError.badRequest('Please upload at least one verification document before submitting');
  }

  user.verificationStatus = 'pending';
  user.verificationSubmittedAt = new Date();
  await user.save();

  sendNotification(
    user._id.toString(),
    'verification_submitted',
    'Verification Submitted',
    'Your verification documents have been submitted and are under review by the HireHive Trust & Safety team.',
    '/profile'
  );

  res.json({
    success: true,
    message: 'Verification request submitted for admin review',
    data: user.toJSON(),
  });
});

/**
 * GET /api/admin/verifications — admin lists candidate and recruiter verification profiles.
 */
export const adminListVerifications = asyncHandler(async (req: Request, res: Response) => {
  const { status, role } = req.query as { status?: string; role?: string };
  const filter: Record<string, any> = {};
  if (status && status !== 'all') {
    filter.verificationStatus = status;
  }
  if (role && role !== 'all') {
    filter.role = role;
  }

  const users = await User.find(filter)
    .select(
      'name email role headline company phone education currentCompany currentRole designation industry companyWebsite isVerified verificationStatus verificationDocuments verificationSubmittedAt verifiedAt verifiedBy verificationRejectionReason createdAt'
    )
    .sort({ verificationSubmittedAt: -1, createdAt: -1 });

  res.json({ success: true, data: users });
});

/**
 * PATCH /api/admin/verifications/:userId — admin approves or rejects verification.
 */
export const adminReviewVerification = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { status, notes } = req.body as { status: 'verified' | 'rejected' | 'pending'; notes?: string };

  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');

  if (status === 'verified') {
    user.isVerified = true;
    user.verificationStatus = 'verified';
    user.verifiedAt = new Date();
    user.verifiedBy = req.user!.id as any;
    user.verificationRejectionReason = undefined;
    user.verificationDocuments.forEach((d) => {
      d.status = 'verified';
    });

    sendNotification(
      user._id.toString(),
      'verification_approved',
      'Profile Verified!',
      'Congratulations! Your profile verification has been approved by the HireHive admin team. Your profile now features the Verified badge.',
      '/profile'
    );
  } else if (status === 'rejected') {
    user.isVerified = false;
    user.verificationStatus = 'rejected';
    user.verificationRejectionReason = notes || 'Verification documents could not be validated.';
    user.verificationDocuments.forEach((d) => {
      d.status = 'rejected';
      if (notes) d.adminNotes = notes;
    });

    sendNotification(
      user._id.toString(),
      'verification_rejected',
      'Verification Needs Attention',
      `Your verification request was not approved: ${user.verificationRejectionReason}. You may re-upload corrected documents anytime.`,
      '/profile'
    );
  } else {
    user.verificationStatus = 'pending';
    user.isVerified = false;
  }

  await user.save();

  res.json({
    success: true,
    message: `Verification ${status === 'verified' ? 'approved' : status === 'rejected' ? 'rejected' : 'updated'} successfully`,
    data: user.toJSON(),
  });
});

