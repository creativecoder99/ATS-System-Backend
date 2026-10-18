import type { Request, Response } from 'express';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
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
