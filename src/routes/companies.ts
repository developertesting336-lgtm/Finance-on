import { Router } from 'express';
import { createCompany, getCompanies, getSubcompanies } from '../controllers/companies.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// 1. POST /api/companies - Create a company with all required fields (Protected)
router.post('/', authenticateToken, createCompany);

// 2. GET /api/companies - Get all companies (Protected)
router.get('/', authenticateToken, getCompanies);

// 3. GET /api/companies/subcompanies (Protected)
router.get('/subcompanies', authenticateToken, getSubcompanies);

// 4. GET /api/companies/:companyId/subcompanies (Protected)
router.get('/:companyId/subcompanies', authenticateToken, getSubcompanies);

export default router;

