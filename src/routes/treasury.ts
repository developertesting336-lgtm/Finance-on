import { Router } from 'express';
import {
  getTreasurySummary,
  getTreasuryBanks,
  getTreasuryReceivables,
  getTreasuryPayables,
  getTreasuryForecast,
  getTreasuryLoans,
} from '../controllers/treasury.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// 1. GET /api/treasury/summary
router.get('/summary', authenticateToken, getTreasurySummary);

// 2. GET /api/treasury/banks
router.get('/banks', authenticateToken, getTreasuryBanks);

// 3. GET /api/treasury/receivables
router.get('/receivables', authenticateToken, getTreasuryReceivables);

// 4. GET /api/treasury/payables
router.get('/payables', authenticateToken, getTreasuryPayables);

// 5. GET /api/treasury/forecast
router.get('/forecast', authenticateToken, getTreasuryForecast);

// 6. GET /api/treasury/loans
router.get('/loans', authenticateToken, getTreasuryLoans);

export default router;
