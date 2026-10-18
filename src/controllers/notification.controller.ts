import type { Request, Response } from 'express';
import { Notification, type NotificationType } from '../models/Notification.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const listNotifications = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 20));

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find({ recipient: userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Notification.countDocuments({ recipient: userId }),
    Notification.countDocuments({ recipient: userId, read: false }),
  ]);

  res.json({
    success: true,
    data: notifications,
    unreadCount,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
});

export const markAsRead = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const notification = await Notification.findOne({ _id: id, recipient: req.user!.id });
  if (!notification) throw ApiError.notFound('Notification not found');

  notification.read = true;
  await notification.save();

  res.json({ success: true, data: notification });
});

export const markAllAsRead = asyncHandler(async (req: Request, res: Response) => {
  await Notification.updateMany({ recipient: req.user!.id, read: false }, { $set: { read: true } });
  res.json({ success: true, message: 'All notifications marked as read' });
});

export async function sendNotification(
  recipientId: string,
  type: NotificationType,
  title: string,
  message: string,
  link?: string
): Promise<void> {
  try {
    await Notification.create({
      recipient: recipientId,
      type,
      title,
      message,
      link,
      read: false,
    });
  } catch (err) {
    console.error('[NotificationService] failed to create notification:', err);
  }
}
