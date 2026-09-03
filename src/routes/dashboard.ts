import { Router } from 'express';
import { getDashboardStats } from '../controllers/dashboard.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// GET /api/dashboard/stats - Fetch company or consolidated holding dashboard KPIs (Protected)
router.get('/stats', authenticateToken, getDashboardStats);

export default router;
