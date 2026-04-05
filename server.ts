import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Mercado Pago
let mpClient: MercadoPagoConfig | null = null;

function getMP() {
  if (!mpClient) {
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error('MERCADO_PAGO_ACCESS_TOKEN is not configured. Please set it in the environment variables.');
    }
    mpClient = new MercadoPagoConfig({ accessToken });
  }
  return mpClient;
}

const app = express();
const PORT = 3000;

// Initialize Firebase Admin lazily
function getDb() {
  if (!admin.apps.length) {
    try {
      admin.initializeApp({
        projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'gen-lang-client-0624434095'
      });
    } catch (error) {
      console.error('Firebase Admin Init Error:', error);
      throw error;
    }
  }
  return admin.firestore();
}

app.use(express.json());

// Mercado Pago Webhook
app.post('/api/webhook', async (req, res) => {
  const { action, data, type } = req.body;

  console.log('Mercado Pago Webhook received:', { action, data, type });

  // Handle payment notification
  if (type === 'payment' || action === 'payment.created' || action === 'payment.updated') {
    const paymentId = data?.id || req.query.id;
    
    if (paymentId) {
      try {
        const client = getMP();
        const payment = new Payment(client);
        const paymentDetails = await payment.get({ id: paymentId });

        if (paymentDetails.status === 'approved') {
          const userId = paymentDetails.external_reference;
          
          if (userId) {
            const db = getDb();
            await db.collection('users').doc(userId).update({
              plan: 'PRO',
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              paymentId: paymentId,
              paymentMethod: paymentDetails.payment_method_id
            });
            console.log(`User ${userId} upgraded to PRO via Mercado Pago payment ${paymentId}`);
          }
        }
      } catch (error) {
        console.error('Error processing Mercado Pago payment:', error);
      }
    }
  }

  res.sendStatus(200);
});

// Create Mercado Pago Preference
app.post('/api/create-preference', async (req, res) => {
  const { userId, email, title, price } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    const client = getMP();
    const preference = new Preference(client);
    
    const result = await preference.create({
      body: {
        items: [
          {
            id: 'pro-plan',
            title: title || 'NIVOR Calculadora PRO - Assinatura Mensal',
            quantity: 1,
            unit_price: Number(price) || 36.90,
            currency_id: 'BRL',
          },
        ],
        payer: {
          email: email,
        },
        external_reference: userId,
        back_urls: {
          success: `${req.headers.origin}/?payment=success`,
          failure: `${req.headers.origin}/?payment=failure`,
          pending: `${req.headers.origin}/?payment=pending`,
        },
        auto_return: 'approved',
        notification_url: `${process.env.APP_URL || req.headers.origin}/api/webhook`,
      },
    });

    res.json({ id: result.id, init_point: result.init_point });
  } catch (error: any) {
    console.error('Mercado Pago Preference Error:', error);
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
