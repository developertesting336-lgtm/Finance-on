import { Router } from 'express';
import { handleWebhook } from '../controllers/webhook.js';

const router = Router();

// POST /api/webhook
router.post('/', handleWebhook);

export default router;
