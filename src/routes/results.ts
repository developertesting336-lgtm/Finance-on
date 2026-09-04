import { Router } from 'express';
import { getPnL, getBalance, getRatios, getComparison } from '../controllers/results.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// 1. GET /api/results/pnl - Cuenta de Pérdidas y Ganancias (Protected)
router.get('/pnl', authenticateToken, getPnL);

// 2. GET /api/results/balance - Balance de Situación (Protected)
router.get('/balance', authenticateToken, getBalance);

// 3. GET /api/results/ratios - Ratios Financieros (Protected)
router.get('/ratios', authenticateToken, getRatios);

// 4. GET /api/results/comparison - Comparativa de Empresas y Sociedades (Protected)
router.get('/comparison', authenticateToken, getComparison);

export default router;
