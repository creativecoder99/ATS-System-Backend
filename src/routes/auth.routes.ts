import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as authController from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { uploadVerificationDoc } from '../middleware/upload.js';
import { loginSchema, registerSchema, updateProfileSchema } from '../validators/auth.schema.js';
import { env } from '../config/env.js';

const router = Router();

// Credential endpoints get a tighter budget than the rest of the API so a
// stolen email list cannot be password-sprayed from a single host.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts, please try again in 15 minutes' },
  // The suite registers far more than 20 users; the limiter would fail tests
  // for a reason unrelated to what they are checking.
  skip: () => env.NODE_ENV === 'test',
});

router.post('/register', authLimiter, validate({ body: registerSchema }), authController.register);
router.post('/login', authLimiter, validate({ body: loginSchema }), authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.me);
router.patch(
  '/me',
  requireAuth,
  validate({ body: updateProfileSchema }),
  authController.updateProfile,
);

// Verification Document Endpoints
router.post(
  '/me/verification-docs',
  requireAuth,
  uploadVerificationDoc,
  authController.uploadVerificationDocHandler,
);
router.delete(
  '/me/verification-docs/:docId',
  requireAuth,
  authController.deleteVerificationDocHandler,
);
router.post(
  '/me/submit-verification',
  requireAuth,
  authController.submitVerificationRequest,
);

export default router;

