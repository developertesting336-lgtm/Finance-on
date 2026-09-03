import { Router } from 'express';
import { createCompany, getCompanies } from '../controllers/companies.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// 1. POST /api/companies - Create a company with all required fields (Protected)
router.post('/', authenticateToken, createCompany);

// 2. GET /api/companies - Get all companies (Protected)
router.get('/', authenticateToken, getCompanies);

export default router;
