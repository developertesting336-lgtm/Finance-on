import { Router } from 'express';
import {
  getDashboardStats,
  getDashboardCashflow,
  getDashboardUpcoming,
  getDashboardPosition,
} from '../controllers/dashboard.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// 1. GET /api/dashboard/stats - Fetch company or consolidated holding dashboard KPIs (Protected)
router.get('/stats', authenticateToken, getDashboardStats);

// 2. GET /api/dashboard/cashflow - Cashflow projection rolling 6 months (Protected)
router.get('/cashflow', authenticateToken, getDashboardCashflow);

// 3. GET /api/dashboard/upcoming - Top 10 upcoming movements (Protected)
router.get('/upcoming', authenticateToken, getDashboardUpcoming);

// 4. GET /api/dashboard/position - Financial position by company (Protected)
router.get('/position', authenticateToken, getDashboardPosition);

export default router;
