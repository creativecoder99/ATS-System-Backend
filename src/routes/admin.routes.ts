import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { adminVerifySchema } from '../validators/auth.schema.js';
import * as authController from '../controllers/auth.controller.js';

const router = Router();

// Restrict all routes in this router to admin users
router.use(requireAuth, requireRole('admin'));

router.get('/verifications', authController.adminListVerifications);
router.patch(
  '/verifications/:userId',
  validate({ body: adminVerifySchema }),
  authController.adminReviewVerification,
);

export default router;
