import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  listNotifications,
  markAllAsRead,
  markAsRead,
} from '../controllers/notification.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', listNotifications);
router.patch('/read-all', markAllAsRead);
router.patch('/:id/read', markAsRead);

export default router;
