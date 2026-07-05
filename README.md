# CodeVision AI - Groq Public Safe Edition

Kod screenshot'ından yazılım dilini tahmin eden neon görünümlü web uygulaması.

Bu sürüm public yayın için düzenlendi: API key frontend'de değil, server tarafındaki `.env` / hosting environment variables içinde durur.

## Önemli düzeltme

`gsk_` ile başlayan key **Groq** keyidir. Bu proje artık Groq endpointini kullanır:

```txt
https://api.groq.com/openai/v1/chat/completions
```

`llama-3.3-70b-versatile` görsel modeli olmadığı için görsel direkt API'ye gönderilmez. Frontend önce Tesseract.js ile OCR yapar, sonra çıkan kod metni Groq'a analiz ettirilir.

## Lokal çalıştırma

```bash
npm install
cp .env.example .env
npm start
```

`.env` içine:

```env
GROQ_API_KEY=gsk_buraya_kendi_keyini_yapistir
GROQ_MODEL=llama-3.3-70b-versatile
RATE_LIMIT_PER_MINUTE=12
```

Tarayıcıdan aç:

```txt
http://localhost:3000
```

## Render'da yayınlama

Build command:

```bash
npm install
```

Start command:

```bash
npm start
```

Environment Variables:

```txt
GROQ_API_KEY = gsk_...
GROQ_MODEL = llama-3.3-70b-versatile
RATE_LIMIT_PER_MINUTE = 12
```

Sonra Manual Deploy yap.

## Güvenlik

`.env` dosyasını GitHub'a yükleme. `.gitignore` içinde `.env` zaten var.
