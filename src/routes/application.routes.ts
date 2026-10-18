import { Router } from 'express';
import * as applicationController from '../controllers/application.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { objectIdSchema } from '../validators/job.schema.js';
import { listApplicationsSchema, updateStatusSchema } from '../validators/application.schema.js';

const router = Router();

router.use(requireAuth);

router.get(
  '/mine',
  requireRole('candidate'),
  validate({ query: listApplicationsSchema }),
  applicationController.listMyApplications,
);

router.patch(
  '/:id/status',
  requireRole('recruiter', 'admin'),
  validate({ params: objectIdSchema, body: updateStatusSchema }),
  applicationController.updateApplicationStatus,
);

router.get(
  '/:id/resume',
  validate({ params: objectIdSchema }),
  applicationController.downloadResume,
);

router.get(
  '/:id/resume/view',
  validate({ params: objectIdSchema }),
  applicationController.viewResume,
);

router.post(
  '/:id/ai-eval',
  requireRole('recruiter', 'admin'),
  validate({ params: objectIdSchema }),
  applicationController.evaluateApplicantController,
);

router.delete(
  '/:id',
  requireRole('candidate'),
  validate({ params: objectIdSchema }),
  applicationController.withdrawApplication,
);

export default router;
