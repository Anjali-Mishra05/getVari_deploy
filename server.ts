import 'dotenv/config'; // Run dotenv config first before any module hoisting
import express from 'express';
import path from 'path';
import cors from 'cors';
import { register, trace } from '@arizeai/phoenix-otel';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import admin from 'firebase-admin';
import rateLimit from 'express-rate-limit';
import { signToken, verifyFirebaseToken } from './src/utils/auth';

import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

// Initialize Firebase Admin
if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  });
  console.log('Firebase Admin initialized successfully');
} else {
  console.warn('Firebase Admin credentials missing. Auth routes will operate in limited mode.');
}

// Enable OpenTelemetry diagnostic logging
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

// Register the Phoenix tracer provider pointing to the hosted Arize platform
register({
  projectName: "getvari-hydration-co-pilot",
  url: "https://otlp.arize.com/v1/traces",
  batch: false, // Send spans immediately for instant tracing visibility
  headers: {
    "space_id": process.env.ARIZE_SPACE_ID || "",
    "api_key": process.env.ARIZE_API_KEY || "",
    "arize-space-id": process.env.ARIZE_SPACE_ID || "",
    "arize-api-key": process.env.ARIZE_API_KEY || "",
    "model_id": "getvari-hydration-co-pilot",
    "arize-model-id": "getvari-hydration-co-pilot",
  }
});

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cors());

// Auth Throttling
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 OTP requests per window
  message: { error: 'Too many requests from this IP, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth Routes
app.post('/auth/send-otp', authLimiter, (req, res) => {
  const { phoneNumber } = req.body;

  // E.164 validation
  const phoneRegex = /^\+[1-9]\d{1,14}$/;
  if (!phoneNumber || !phoneRegex.test(phoneNumber)) {
    return res.status(400).json({ error: 'Invalid phone number format. Must be E.164 (e.g., +919876543210).' });
  }

  // In this prototype, Firebase Web SDK sends the SMS.
  // The backend just validates the request and enforces rate limits.
  res.json({ success: true, message: 'OTP request authorized' });
});

app.post('/auth/verify-otp', async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ error: 'Firebase ID Token is required' });
  }

  const decodedToken = await verifyFirebaseToken(idToken);
  if (!decodedToken) {
    return res.status(401).json({ error: 'Invalid or expired Firebase ID Token' });
  }

  // Issue backend JWT
  const jwtToken = signToken({
    uid: decodedToken.uid,
    phone_number: decodedToken.phone_number
  });

  res.json({
    success: true,
    token: jwtToken,
    user: {
      uid: decodedToken.uid,
      phoneNumber: decodedToken.phone_number
    }
  });
});

app.post('/auth/logout', (req, res) => {
  // Client is responsible for clearing the JWT.
  // We can implement token blacklisting here if needed.
  res.json({ success: true, message: 'Logged out successfully' });
});

// Log incoming API requests to insights
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Initialize Gemini Client
let ai: GoogleGenAI | null = null;
const API_KEY = process.env.GEMINI_API_KEY;

if (API_KEY) {
  try {
    ai = new GoogleGenAI({
      apiKey: API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    console.log('Gemini AI SDK initialized successfully with key');
  } catch (error) {
    console.error('Failed to initialize Gemini AI SDK:', error);
  }
} else {
  console.log('No GEMINI_API_KEY detected. Server running in Rule-Based Smart Diagnostic mode.');
}

/**
 * Server-Side endpoint to generate customized wellness telemetry insights
 * Using actual model logic and Schema structured output representation
 */
app.post('/api/insights', async (req, res) => {
  const { sensorData, profile, recentLogs, hoursSinceDrink, previousInsights } = req.body;

  if (!sensorData || !profile) {
    return res.status(400).json({ error: 'Missing sensor data or profile parameters' });
  }

  // Fallback Rule-Based insights generator if Gemini is unavailable
  const generateRuleBasedInsights = () => {
    const rules = [];
    const hScore = 100 - (sensorData.hydrationScore || 50);

    if (sensorData.heartRate > 95 && sensorData.activityLoad > 50) {
      rules.push({
        id: `rule_hr_act_${Date.now()}`,
        category: 'activity',
        title: 'Active Cardiovascular Load',
        text: 'Your current cardiovascular stress is high due to ongoing heavy activity. Ensure you are taking consistent sips of electrolytes rather than plain water to offset immediate sweat-loss sodium depletion.',
        timestamp: new Date().toISOString(),
        source: 'rule_engine'
      });
    }

    if (sensorData.temperature > 30) {
      rules.push({
        id: `rule_temp_${Date.now()}`,
        category: 'temperature',
        title: 'High Thermal Exposure Detected',
        text: `With temperature peaking ambiently at ${sensorData.temperature}°C, your fluid evaporation rate climbs by over 250ml/hour. Upward adjustments in electrolyte intake goals are strongly recommended.`,
        timestamp: new Date().toISOString(),
        source: 'rule_engine'
      });
    }

    if (hScore > 40) {
      rules.push({
        id: `rule_hyd_${Date.now()}`,
        category: 'hydration',
        title: 'Hydration Depletion Phase',
        text: `Based on your physiological trends, your current estimated hydration reserves are depleted by around ${hScore}%. Drink 350ml of cool water within the next 15 minutes to stabilize blood viscosity and cognitive focus.`,
        timestamp: new Date().toISOString(),
        source: 'rule_engine'
      });
    }

    if (hoursSinceDrink > 2.5) {
      rules.push({
        id: `rule_time_${Date.now()}`,
        category: 'hydration',
        title: 'Extended Inactivity Alert',
        text: `It has been over ${hoursSinceDrink} hours since your last fluid intake sync. Even without overt thirst signals, your cognitive focus and metabolism are experiencing mild performance degradation.`,
        timestamp: new Date().toISOString(),
        source: 'rule_engine'
      });
    }

    // Default general wellness insight
    if (rules.length === 0) {
      rules.push({
        id: `rule_good_${Date.now()}`,
        category: 'recovery',
        title: 'Optimal Physiological Sync',
        text: 'All physiological sensors indicate perfect recovery sync. Your dynamic hydration score is safe. Maintain your existing baseline routine to stabilize cardiovascular load metrics.',
        timestamp: new Date().toISOString(),
        source: 'rule_engine'
      });
    }

    return rules;
  };

  if (!ai) {
    // Return high-quality rule-based insights immediately if no gemini key
    return res.json({ 
      insights: generateRuleBasedInsights().map(item => ({ ...item, source: 'rule_engine' })),
      fallbackReason: 'no_api_key'
    });
  }

  try {
    const systemPrompt = `You are "GetVari Core", an AI-assisted hydration intelligence engine driven by sensor fusion analysis.
You process real-time streams of physiological data, motion inputs, ambient temperature, humidity, and water intake timelines.

Your goal is to parse this telemetry and output EXACTLY two insights:
- Insight 1: Category: "hydration", Title: "Hydration Risk Insight", Text: Explain the estimated risk based on vital strain and environmental loads. E.g., "Elevated heart strain and activity levels are increasing hydration demand. Current conditions suggest proactive fluid replenishment."
- Insight 2: Category: "recovery", Title: "Recovery Recommendation", Text: Provide a prescriptive hydration amount. E.g., "Based on current hydration deficit and workload, consuming 500ml water may help reduce hydration risk over the next recovery cycle."

Strict constraints:
- NEVER use diagnostic medical language, clinical diagnostic terms, disease names, or claim medical certainty.
- Always frame outputs in terms of "Estimated Hydration Risk", "AI-Assisted Hydration Intelligence", or "Sensor Fusion Analysis".
- Keep each text brief (20-30 words max).
- Return EXACTLY a JSON array containing objects matching the schema.`;

    const userPrompt = `
CURRENT TELEMETRY DATA:
- Heart Rate: ${sensorData.heartRate} BPM
- Activity Load: ${sensorData.activityLoad}/100 active index
- Ambient Temperature: ${sensorData.temperature}°C
- Ambient Humidity: ${sensorData.humidity}%
- Sweat Rate Indicator: ${sensorData.sweatGSR}μS Electrodermal Sweat index
- Computed Hydration Score: ${sensorData.hydrationScore}/100 (100 is fully optimal, 0 is critical risk)
- Hours since last fluid fluid sync: ${hoursSinceDrink} hours

USER BASELINE:
- Profile: Age ${profile.age}, Weight ${profile.weightKg}kg, Gender ${profile.gender}
- Setup Lifestyle: Habits rated as "${profile.waterHabit}" baseline compliance, Activity Level is "${profile.activityLevel}", Fitness Goal: "${profile.fitnessGoal}"
- Location: ${profile.location || 'Not Specified'}
- Pre-existing Medical Conditions: ${(profile.medicalConditions || []).join(', ') || 'None'}

Please return 2 ultra-customized insights as direct responses.`;

    const tracer = trace.getTracer("getvari-hydration-co-pilot");
    const parsedResponse = await tracer.startActiveSpan("gemini-insights-generation", async (span) => {
      try {
        span.setAttribute("openinference.span.kind", "LLM");
        span.setAttribute("input.value", userPrompt);
        span.setAttribute("llm.model_name", "gemini-3.5-flash");

        const response = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: userPrompt,
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  category: {
                    type: Type.STRING,
                    description: 'Must stand out as either "hydration", "activity", "temperature", or "recovery".',
                  },
                  title: {
                    type: Type.STRING,
                    description: 'Short futuristic medical tag (3-5 words max, e.g. "Thermoregulatory Sweat Loss", "Viscous Stroke Volume Impact")',
                  },
                  text: {
                    type: Type.STRING,
                    description: 'Actionable physiological guidance. Limit to 25 words maximum.',
                  },
                },
                required: ['category', 'title', 'text'],
              },
            },
          },
        });

        const outputText = response.text || '[]';
        span.setAttribute("output.value", outputText);
        span.setStatus({ code: 1 }); // OK/Unset
        return JSON.parse(outputText);
      } catch (err: any) {
        span.setStatus({ code: 2, message: err.message }); // Error
        throw err;
      } finally {
        span.end();
      }
    });
    
    // Ensure the response is parsed robustly as an array
    let insightsArray: any[] = [];
    if (Array.isArray(parsedResponse)) {
      insightsArray = parsedResponse;
    } else if (parsedResponse && typeof parsedResponse === 'object') {
      const possibleArray = Object.values(parsedResponse).find(val => Array.isArray(val));
      if (possibleArray) {
        insightsArray = possibleArray as any[];
      } else if ((parsedResponse as any).category && (parsedResponse as any).text) {
        insightsArray = [parsedResponse];
      }
    }
    
    // Add custom ids and timestamps to the Gemini insights
    const formattedInsights = insightsArray.map((insight: any, idx: number) => ({
      id: `gemini_insight_${idx}_${Date.now()}`,
      category: insight.category || 'hydration',
      title: insight.title || 'Physiological Variance Detect',
      text: insight.text || 'Telemetry values are fluctuating slightly. Hydrate based on your current recovery status index.',
      timestamp: new Date().toISOString(),
      source: 'gemini_brain',
    }));

    return res.json({ insights: formattedInsights });
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    const isQuotaError = errorMsg.includes('429') || 
                         errorMsg.includes('quota') || 
                         errorMsg.includes('RESOURCE_EXHAUSTED') || 
                         errorMsg.includes('limit');

    if (isQuotaError) {
      console.warn('⚠️ Gemini API free-tier developer quota/rate-limit hit (429 RESOURCE_EXHAUSTED). Gracefully falling back to physiological rules.');
    } else {
      console.error('Gemini insights generation error:', error);
    }

    // Graceful fallback to rich rule-based insights
    return res.json({ 
      insights: generateRuleBasedInsights().map(item => ({ ...item, source: 'rule_engine' })),
      fallbackReason: isQuotaError ? 'quota_exceeded' : 'general_error'
    });
  }
});

// Setup Vite Dev server or production static serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Vite development server middleware loaded.');
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('Production static asset routing loaded.');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GetVari Core running on port ${PORT}`);
  });
}

startServer();
