import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
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
      throw new Error('MERCADO_PAGO_ACCESS_TOKEN is not configured. Please set it in the environment variables (Vercel Settings > Environment Variables).');
    }
    // Basic validation to check if it's a real token or just a placeholder
    if (accessToken === 'MERCADO_PAGO_ACCESS_TOKEN' || accessToken === 'YOUR_ACCESS_TOKEN') {
      throw new Error('O valor da chave MERCADO_PAGO_ACCESS_TOKEN parece ser um texto de exemplo. Você deve colar o seu Token de Acesso real (que começa com APP_USR-).');
    }
    if (!accessToken.startsWith('APP_USR-')) {
      console.warn('AVISO: O Token de Acesso do Mercado Pago geralmente começa com "APP_USR-". Verifique se você copiou o token de PRODUÇÃO corretamente.');
    }
    mpClient = new MercadoPagoConfig({ accessToken });
  }
  return mpClient;
}

const app = express();
const PORT = 3000;

// Initialize Firebase Admin lazily and safely
let db: any = null;
function getDb() {
  if (db) return db;
  
  try {
    if (!admin.apps.length) {
      const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT;
      
      console.log('DIAGNOSTIC: FIREBASE_SERVICE_ACCOUNT exists?', !!serviceAccountVar);
      if (serviceAccountVar) {
        console.log('DIAGNOSTIC: FIREBASE_SERVICE_ACCOUNT length:', serviceAccountVar.length);
        console.log('DIAGNOSTIC: FIREBASE_SERVICE_ACCOUNT starts with {?', serviceAccountVar.trim().startsWith('{'));
      }

      if (serviceAccountVar) {
        try {
          const serviceAccount = JSON.parse(serviceAccountVar);
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
          });
          console.log('Firebase Admin initialized using Service Account from environment variable');
        } catch (parseError) {
          console.error('Error parsing FIREBASE_SERVICE_ACCOUNT JSON:', parseError);
          // Fallback to default init if parsing fails
          admin.initializeApp({
            projectId: 'gen-lang-client-0624434095'
          });
        }
      } else {
        // Default initialization for environments with Application Default Credentials (like Cloud Run)
        admin.initializeApp({
          projectId: 'gen-lang-client-0624434095'
        });
        console.log('Firebase Admin initialized using default credentials (Project ID)');
      }
    }
    db = getFirestore('ai-studio-c4d6b3fe-53ca-4e86-923e-a0918eb8fade');
    return db;
  } catch (error) {
    console.error('CRITICAL: Firebase Admin Init Error:', error);
    return null;
  }
}

app.use(express.json());

// Health check route
app.get('/api/health', (req, res) => {
  const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT;
  
  console.log('HEALTH CHECK DIAGNOSTIC:');
  console.log('- FIREBASE_SERVICE_ACCOUNT exists?', !!serviceAccountVar);
  if (serviceAccountVar) {
    console.log('- FIREBASE_SERVICE_ACCOUNT length:', serviceAccountVar.length);
    console.log('- FIREBASE_SERVICE_ACCOUNT starts with {?', serviceAccountVar.trim().startsWith('{'));
  }

  res.json({ 
    status: 'ok', 
    env: process.env.NODE_ENV,
    hasMpToken: !!process.env.MERCADO_PAGO_ACCESS_TOKEN,
    hasFirebaseKey: !!serviceAccountVar,
    timestamp: new Date().toISOString()
  });
});

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
      try {
        const firestore = getDb();
        if (firestore) {
          await firestore.collection('users').doc(userId).update({
            plan: 'PRO',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            paymentId: paymentId,
            paymentMethod: paymentDetails.payment_method_id
          });
          console.log(`User ${userId} upgraded to PRO via Mercado Pago payment ${paymentId}`);
        } else {
          console.error('Could not update user: Firestore not initialized');
        }
      } catch (dbError) {
        console.error('Database update error after payment:', dbError);
      }
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

  console.log('Creating preference for user:', userId, 'Price:', price);

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    const client = getMP();
    const preference = new Preference(client);
    
    // Detect base URL more robustly
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers.host;
    const baseUrl = process.env.APP_URL || `${protocol}://${host}`;
    
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
          success: `${baseUrl}/?payment=success`,
          failure: `${baseUrl}/?payment=failure`,
          pending: `${baseUrl}/?payment=pending`,
        },
        auto_return: 'approved',
        notification_url: `${baseUrl}/api/webhook`,
      },
    });

    console.log('SUCCESS: Preference Created!');
    console.log('Preference ID:', result.id);
    console.log('Init Point:', result.init_point);
    console.log('Payer Email:', email);

    res.json({ id: result.id, init_point: result.init_point });
  } catch (error: any) {
    console.error('Mercado Pago Preference Error:', error);
    
    let errorMessage = error.message || 'Erro interno ao processar pagamento';
    
    // Handle specific Google Cloud / Secret Manager unauthorized error
    if (errorMessage.includes('UNAUTHORIZED') || errorMessage.includes('policy')) {
      errorMessage = 'Erro de autorização: Verifique se a chave MERCADO_PAGO_ACCESS_TOKEN está configurada corretamente no menu Settings.';
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

  if (!isProduction) {
    // Dynamic import to avoid loading Vite in production/Vercel
    const { createServer: createViteServer } = await import('vite');
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

  // Only listen if not running on Vercel
  if (!process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startServer();

// Export for Vercel
export default app;
