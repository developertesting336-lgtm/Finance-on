import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = [
  'https://finance-on-leyva.base44.app',
  'http://localhost:5173',
  'http://localhost:3000',
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (Postman, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.includes(origin) ||
      origin.endsWith('.base44.app') ||
      origin.endsWith('.trycloudflare.com') ||
      origin.endsWith('.ngrok-free.app')
    ) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// Request logger for debugging
app.use((req, res, next) => {
  console.log(`📡 [${req.method}] ${req.url} - Body:`, JSON.stringify(req.body));
  next();
});

// Routes
app.use('/api/auth', authRoutes);

app.get('/api/test', (req: Request, res: Response) => {
  res.json({
    status: 'success',
    message: 'Hello World from basic TS-Express backend!',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
