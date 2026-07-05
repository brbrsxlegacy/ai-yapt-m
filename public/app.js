/*
  CodeVision AI - Public Safe Frontend
  Bu dosyada API key yoktur. Görsel OCR ile taranır, sonra sonuçlar
  güvenli backend endpointine (/api/analyze) gönderilir.
*/

const fileInput = document.getElementById("fileInput");
const pickFileBtn = document.getElementById("pickFileBtn");
const dropZone = document.getElementById("dropZone");
const previewImage = document.getElementById("previewImage");
const emptyPreview = document.getElementById("emptyPreview");
const analyzeBtn = document.getElementById("analyzeBtn");
const statusBox = document.getElementById("statusBox");
const languageResult = document.getElementById("languageResult");
const confidencePill = document.getElementById("confidencePill");
const confidenceBar = document.getElementById("confidenceBar");
const aiExplanation = document.getElementById("aiExplanation");
const ocrText = document.getElementById("ocrText");

let selectedFile = null;
let selectedImageBase64 = "";

pickFileBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (event) => handleFile(event.target.files[0]));
analyzeBtn.addEventListener("click", analyzeImage);

// Drag & drop yükleme desteği.
["dragenter", "dragover"].forEach((name) => {
  dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    dropZone.classList.add("drag-over");
  });
});

["dragleave", "drop"].forEach((name) => {
  dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    dropZone.classList.remove("drag-over");
  });
});

dropZone.addEventListener("drop", (event) => {
  handleFile(event.dataTransfer.files[0]);
});

function handleFile(file) {
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    setStatus("Lütfen PNG, JPG veya WEBP türünde bir görsel seç.", "error");
    return;
  }

  // Public app için aşırı büyük dosyaları engelliyoruz.
  if (file.size > 5 * 1024 * 1024) {
    setStatus("Görsel çok büyük. 5 MB altında bir screenshot yükle.", "error");
    return;
  }

  selectedFile = file;
  const reader = new FileReader();

  reader.onload = () => {
    selectedImageBase64 = reader.result;
    previewImage.src = reader.result;
    previewImage.style.display = "block";
    emptyPreview.style.display = "none";
    analyzeBtn.disabled = false;
    resetResult();
    setStatus("Görsel hazır. Analiz Et butonuna basabilirsin.");
  };

  reader.readAsDataURL(file);
}

async function analyzeImage() {
  if (!selectedFile) {
    setStatus("Önce bir kod ekran görüntüsü yükle.", "error");
    return;
  }

  try {
    analyzeBtn.disabled = true;
    setStatus("OCR taraması yapılıyor...", "loading");

    // Tesseract.js görseldeki yazıları okur.
    const extractedText = await runOCR(selectedFile);
    ocrText.textContent = extractedText || "OCR yazı okuyamadı. Daha net bir screenshot dene.";

    setStatus("Güvenli backend üzerinden Groq analizi yapılıyor...", "loading");

    // API key bu istekte yok. Backend kendi .env key'i ile Grok'a bağlanır.
    const result = await askBackend({ extractedText, imageDataUrl: selectedImageBase64 });

    renderResult(result);
    setStatus("Analiz tamamlandı.");
  } catch (error) {
    console.error(error);
    const fallback = localHeuristicGuess(ocrText.textContent || "");
    renderResult(fallback);
    setStatus(`Server/API tarafında hata oldu; yedek yerel tahmin gösterildi. (${error.message})`, "error");
  } finally {
    analyzeBtn.disabled = false;
  }
}

async function runOCR(file) {
  const result = await Tesseract.recognize(file, "eng", {
    logger: (message) => {
      if (message.status === "recognizing text") {
        const percent = Math.round((message.progress || 0) * 100);
        setStatus(`OCR taraması yapılıyor... %${percent}`, "loading");
      }
    }
  });

  return (result.data.text || "").trim();
}

async function askBackend({ extractedText, imageDataUrl }) {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ extractedText, imageDataUrl })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.detail || data.error || `Server error ${response.status}`);
  }

  return data;
}

function localHeuristicGuess(text) {
  const t = text.toLowerCase();
  const rules = [
    { language: "Python", confidence: 72, patterns: ["def ", "import ", "print(", "self", "elif", "none", "pip"] },
    { language: "JavaScript", confidence: 72, patterns: ["console.log", "function", "const ", "let ", "=>", "document.", "node"] },
    { language: "Java", confidence: 72, patterns: ["public class", "static void main", "system.out.println", "string[] args"] },
    { language: "C++", confidence: 72, patterns: ["#include", "iostream", "std::", "cout", "cin", "using namespace"] },
    { language: "C#", confidence: 68, patterns: ["using system", "console.writeline", "namespace", "public static void main"] },
    { language: "Go", confidence: 66, patterns: ["package main", "func main", "fmt.println"] },
    { language: "Rust", confidence: 66, patterns: ["fn main", "println!", "let mut", "cargo"] },
    { language: "HTML/CSS", confidence: 70, patterns: ["<html", "<div", "</", "body", "font-family", "background:"] }
  ];

  let best = { language: "Unknown", confidence: 35, score: 0, signals: [] };

  for (const rule of rules) {
    const signals = rule.patterns.filter((pattern) => t.includes(pattern));
    if (signals.length > best.score) {
      best = {
        language: rule.language,
        confidence: Math.min(95, rule.confidence + signals.length * 5),
        score: signals.length,
        signals
      };
    }
  }

  return {
    language: best.language,
    confidence: best.confidence,
    explanation: best.language === "Unknown"
      ? "OCR metninde güçlü bir dil işareti bulunamadı. Daha net ve yakın çekim screenshot kullan."
      : `API çalışmadığı için yerel kurallarla tahmin yapıldı. Bulunan ipuçları: ${best.signals.join(", ")}`,
    signals: best.signals
  };
}

function renderResult(result) {
  const confidence = clampNumber(result.confidence || 0, 0, 100);
  languageResult.textContent = result.language || "Unknown";
  confidencePill.textContent = `%${confidence}`;
  confidenceBar.style.width = `${confidence}%`;

  const signalsText = result.signals?.length ? `\n\nİpuçları: ${result.signals.join(", ")}` : "";
  aiExplanation.textContent = (result.explanation || "Açıklama yok.") + signalsText;
}

function resetResult() {
  languageResult.textContent = "Bekleniyor...";
  confidencePill.textContent = "%0";
  confidenceBar.style.width = "0%";
  aiExplanation.textContent = "Analiz yapılınca burada açıklama görünecek.";
  ocrText.textContent = "Henüz tarama yapılmadı.";
}

function setStatus(message, type = "normal") {
  statusBox.textContent = message;
  statusBox.classList.toggle("loading", type === "loading");
  statusBox.style.color = type === "error" ? "var(--bad)" : "var(--muted)";
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, Number(value)));
}
