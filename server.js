/*
  CodeVision AI - Secure Groq Backend
  API key server tarafında kalır. Frontend hiçbir zaman GROQ_API_KEY'i görmez.
*/

import "dotenv/config";
import express from "express";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Groq API ayarları. gsk_ ile başlayan key buraya gelir.
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      // Tesseract.js tarayıcıda WebAssembly çalıştırır.
      // Bu yüzden 'unsafe-eval' ve data:/blob: izinleri gerekir.
      "script-src": ["'self'", "'unsafe-eval'", "blob:", "https://cdn.jsdelivr.net"],
      "worker-src": ["'self'", "blob:", "https://cdn.jsdelivr.net"],
      "child-src": ["'self'", "blob:"],
      "img-src": ["'self'", "data:", "blob:"],
      "connect-src": ["'self'", "data:", "blob:", "https://cdn.jsdelivr.net", "https://raw.githubusercontent.com"],
      "style-src": ["'self'", "'unsafe-inline'"]
    }
  }
}));
app.use(compression());
app.use(express.json({ limit: "7mb" }));
app.use(express.static(path.join(__dirname, "public")));

const analyzeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_PER_MINUTE || 12),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Çok hızlı istek atıldı. Biraz bekleyip tekrar dene." }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "CodeVision AI", provider: "Groq", model: GROQ_MODEL });
});

// Favicon 404 hatası görünmesin diye boş cevap veriyoruz.
app.get("/favicon.ico", (_req, res) => res.status(204).end());

app.post("/api/analyze", analyzeLimiter, async (req, res) => {
  try {
    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: "Server tarafında GROQ_API_KEY ayarlı değil." });
    }

    const { extractedText = "", imageDataUrl = "" } = req.body || {};

    if (typeof extractedText !== "string" || typeof imageDataUrl !== "string") {
      return res.status(400).json({ error: "Geçersiz istek formatı." });
    }

    if (!imageDataUrl.startsWith("data:image/")) {
      return res.status(400).json({ error: "Lütfen geçerli bir görsel yükle." });
    }

    if (imageDataUrl.length > 6_500_000) {
      return res.status(413).json({ error: "Görsel çok büyük. Daha küçük bir screenshot kullan." });
    }

    const cleanedText = extractedText.trim().slice(0, 6000);

    if (cleanedText.length < 8) {
      return res.status(400).json({
        error: "OCR yeterli kod okuyamadı. Daha net, yakın çekim bir kod screenshotı yükle."
      });
    }

    // Groq'un llama-3.3-70b-versatile modeli görsel değil metin modelidir.
    // Bu yüzden görseli direkt API'ye göndermiyoruz; frontend'deki OCR metnini analiz ettiriyoruz.
    const result = await askGroq(cleanedText);
    res.json(result);
  } catch (error) {
    console.error("Analyze error:", error);
    res.status(500).json({
      error: "Analiz sırasında server/API hatası oluştu.",
      detail: process.env.NODE_ENV === "production" ? undefined : String(error.message || error)
    });
  }
});

async function askGroq(extractedText) {
  const systemPrompt = `You are CodeVision AI, a programming language detector for a school startup project.
Return ONLY valid JSON with this exact schema:
{
  "language": "Python | JavaScript | Java | C++ | C# | Go | Rust | HTML/CSS | Unknown",
  "confidence": 0-100,
  "explanation": "short Turkish explanation",
  "signals": ["short evidence 1", "short evidence 2"]
}
Be careful: OCR can be noisy. Decide using programming syntax clues.`;

  const userPrompt = `Aşağıdaki OCR ile okunmuş kod metninin hangi yazılım dili olduğunu tahmin et.

OCR metni:
${extractedText}`;

  const response = await fetch(GROQ_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`GROQ API ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content || "";
  return parseModelJson(text);
}

function parseModelJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  const jsonText = match ? match[0] : text;
  const parsed = JSON.parse(jsonText);

  return {
    language: String(parsed.language || "Unknown"),
    confidence: clampNumber(parsed.confidence || 0, 0, 100),
    explanation: String(parsed.explanation || "Açıklama gelmedi."),
    signals: Array.isArray(parsed.signals) ? parsed.signals.map(String).slice(0, 5) : []
  };
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, Number(value)));
}

app.listen(PORT, () => {
  console.log(`CodeVision AI running on http://localhost:${PORT}`);
  console.log(`Provider: Groq | Model: ${GROQ_MODEL}`);
});
