import { Router } from 'express';
import { getUsers, updateUser } from '../controllers/users.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// 1. GET /api/users - Return all users (Protected)
router.get('/', authenticateToken, getUsers);

// 2. PATCH /api/users/:id - Update user role & company scope (Protected)
router.patch('/:id', authenticateToken, updateUser);

export default router;
