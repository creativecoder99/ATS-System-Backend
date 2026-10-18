import { Router } from 'express';
import * as jobController from '../controllers/job.controller.js';
import * as applicationController from '../controllers/application.controller.js';
import * as savedJobController from '../controllers/savedJob.controller.js';
import { optionalAuth, requireAuth, requireRole } from '../middleware/auth.js';
import { uploadResume } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { createJobSchema, listJobsSchema, objectIdSchema, updateJobSchema } from '../validators/job.schema.js';
import { applySchema, listApplicationsSchema } from '../validators/application.schema.js';

const router = Router();

// Literal paths must be registered before "/:id", otherwise Express would
// match "mine" and "saved" as an id and the CastError would surface instead.
router.get('/mine', requireAuth, requireRole('recruiter', 'admin'), jobController.listMyJobs);
router.get('/saved', requireAuth, savedJobController.listSavedJobs);

router.get('/', validate({ query: listJobsSchema }), jobController.listJobs);
router.post(
  '/',
  requireAuth,
  requireRole('recruiter', 'admin'),
  validate({ body: createJobSchema }),
  jobController.createJob,
);

router.get('/:id', optionalAuth, validate({ params: objectIdSchema }), jobController.getJob);
router.patch(
  '/:id',
  requireAuth,
  requireRole('recruiter', 'admin'),
  validate({ params: objectIdSchema, body: updateJobSchema }),
  jobController.updateJob,
);
router.delete(
  '/:id',
  requireAuth,
  requireRole('recruiter', 'admin'),
  validate({ params: objectIdSchema }),
  jobController.deleteJob,
);

router.post(
  '/:id/apply',
  requireAuth,
  requireRole('candidate'),
  validate({ params: objectIdSchema }),
  // multer parses the multipart body, so it has to run before validation.
  uploadResume,
  validate({ body: applySchema }),
  applicationController.applyToJob,
);

router.get(
  '/:id/applications',
  requireAuth,
  requireRole('recruiter', 'admin'),
  validate({ params: objectIdSchema, query: listApplicationsSchema }),
  applicationController.listJobApplications,
);

router.post(
  '/:id/save',
  requireAuth,
  validate({ params: objectIdSchema }),
  savedJobController.saveJob,
);
router.delete(
  '/:id/save',
  requireAuth,
  validate({ params: objectIdSchema }),
  savedJobController.unsaveJob,
);

export default router;
