import { Router } from 'express';
import * as statsController from '../controllers/stats.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/recruiter', requireRole('recruiter', 'admin'), statsController.recruiterStats);
router.get('/candidate', requireRole('candidate'), statsController.candidateStats);

export default router;
