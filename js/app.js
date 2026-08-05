/**
 * PWA版 肌測定アプリのUI制御・オーケストレーション。
 * カメラ撮影 → 顔検出(MediaPipe) → 部位切り出し・測定(OpenCV.js) → スコアリング → 履歴保存(IndexedDB)
 * → レポート表示、をすべて端末内（オフライン）で完結させる。Python版 analyze.run() の移植。
 */
import { FaceLandmarker, FilesetResolver } from "../vendor/mediapipe/vision_bundle.mjs";
import * as regions from "./regions.js";
import * as metrics from "./metrics.js";
import * as scoring from "./scoring.js";
import * as history from "./history.js";
import * as report from "./report.js";

const MAX_PHOTOS = 3;
const THRESHOLD = 60.0;

const els = {
  statusBox: document.getElementById("boot-status"),
  customerId: document.getElementById("customer_id"),
  cameraSection: document.getElementById("camera-section"),
  fallbackSection: document.getElementById("fallback-section"),
  video: document.getElementById("camera-video"),
  captureBtn: document.getElementById("capture-btn"),
  resetBtn: document.getElementById("reset-btn"),
  captureStatus: document.getElementById("capture-status"),
  thumbs: document.getElementById("thumbs"),
  fallbackInput: document.getElementById("fallback-input"),
  analyzeBtn: document.getElementById("analyze-btn"),
  resultSection: document.getElementById("result-section"),
  workCanvas: document.getElementById("work-canvas"),
};

let faceLandmarker = null;
let capturedPhotos = []; // { alignedCanvas, regions, framing, categoryRaw, issues }
let mediaStream = null;

function setStatus(text) {
  if (els.statusBox) els.statusBox.textContent = text;
}

// ---------- 初期化（WASMランタイム・モデルのロード） ----------

// GPU delegateはiOS Safari等で互換性が不安定で、環境によっては例外を投げずに
// 初期化が長時間ハングすることが確認された（try/catchでは救えない）。
// 撮影1枚あたり1回しか顔検出を実行しないため速度面のメリットは小さく、
// 全端末で確実に動くことを優先してCPU delegateのみを使用する。
function createLandmarker(fileset, delegate) {
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: "../models/face_landmarker.task",
      delegate,
    },
    runningMode: "IMAGE",
    numFaces: 1,
    outputFacialTransformationMatrixes: true,
  });
}

async function boot() {
  setStatus("初期化中…（初回のみ数十秒かかる場合があります）");
  await window.cvReady; // opencv.js のWASMランタイム初期化待ち
  setStatus("顔検出モデルを読み込み中…");

  const fileset = await FilesetResolver.forVisionTasks("../vendor/mediapipe/wasm");
  faceLandmarker = await createLandmarker(fileset, "CPU");

  setStatus("準備完了。撮影してください。");
  setTimeout(() => setStatus(""), 1500);
  initCamera();
  wireUi();
}

// ---------- カメラ ----------

async function initCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showFallback();
    return;
  }
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    els.video.srcObject = mediaStream;
    els.cameraSection.style.display = "";
    els.fallbackSection.style.display = "none";
  } catch (e) {
    showFallback();
  }
}

function showFallback() {
  els.cameraSection.style.display = "none";
  els.fallbackSection.style.display = "";
}

function wireUi() {
  els.captureBtn.addEventListener("click", onCaptureClick);
  els.resetBtn.addEventListener("click", onReset);
  els.fallbackInput.addEventListener("change", onFallbackFileChange);
  els.analyzeBtn.addEventListener("click", onAnalyzeClick);
}

async function onCaptureClick() {
  if (capturedPhotos.length >= MAX_PHOTOS) return;
  const video = els.video;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  await processCapturedCanvas(canvas);
}

async function onFallbackFileChange(event) {
  const files = Array.from(event.target.files || []).slice(0, MAX_PHOTOS - capturedPhotos.length);
  for (const file of files) {
    const canvas = await fileToCanvas(file);
    await processCapturedCanvas(canvas);
  }
  event.target.value = "";
}

function fileToCanvas(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0);
      URL.revokeObjectURL(img.src);
      resolve(canvas);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/** 1枚の撮影画像(canvas)に対し、顔検出〜部位測定〜カテゴリ生値算出までを実行し、状態に追加する。 */
async function processCapturedCanvas(canvas) {
  els.captureStatus.textContent = "解析中…";
  els.captureBtn.disabled = true;
  try {
    const detectResult = faceLandmarker.detect(canvas);
    if (!detectResult.faceLandmarks || !detectResult.faceLandmarks.length) {
      els.captureStatus.textContent =
        "⚠ 顔を検出できませんでした。正面を向いた明るい写真で再撮影してください。";
      return;
    }
    const landmarks = regions.landmarksToPixels(
      detectResult.faceLandmarks[0], canvas.width, canvas.height,
    );
    let headPose = null;
    if (detectResult.facialTransformationMatrixes && detectResult.facialTransformationMatrixes.length) {
      headPose = regions.poseFromMatrix(detectResult.facialTransformationMatrixes[0].data);
    }

    const framing = regions.computeFramingMetrics(canvas.width, canvas.height, landmarks, headPose);
    const framingIssues = metrics.assessFraming(framing).issues;

    const { canvas: alignedCanvas, landmarks: alignedLandmarks } = regions.alignFace(canvas, landmarks);
    const qualityResult = metrics.assessImageQuality(alignedCanvas);
    const photoRegions = regions.getRegions(alignedLandmarks);
    const crops = regions.cropRegions(alignedCanvas, photoRegions);
    const regionMetrics = metrics.computeRegionMetrics(crops);
    const categoryRaw = scoring.aggregateCategoryRaw(regionMetrics);

    const issues = [...framingIssues, ...qualityResult.issues];
    capturedPhotos.push({
      alignedCanvas, regions: photoRegions, framing, categoryRaw, issues,
    });

    addThumb(alignedCanvas, issues);
    els.captureStatus.textContent =
      issues.length
        ? `撮影 ${capturedPhotos.length}/${MAX_PHOTOS} 枚（⚠ ${issues[0]}）`
        : `撮影 ${capturedPhotos.length}/${MAX_PHOTOS} 枚 OK`;

    if (capturedPhotos.length >= MAX_PHOTOS) {
      els.captureBtn.disabled = true;
      els.captureBtn.textContent = "撮影完了（3枚）";
    }
  } finally {
    if (capturedPhotos.length < MAX_PHOTOS) els.captureBtn.disabled = false;
  }
}

function addThumb(canvas, issues) {
  const wrap = document.createElement("div");
  wrap.className = "thumb" + (issues.length ? " thumb-warn" : "");
  const img = document.createElement("img");
  img.src = canvas.toDataURL("image/jpeg", 0.7);
  wrap.appendChild(img);
  els.thumbs.appendChild(wrap);
}

function onReset() {
  capturedPhotos = [];
  els.thumbs.innerHTML = "";
  els.captureStatus.textContent = "";
  els.captureBtn.disabled = false;
  els.captureBtn.textContent = "📸 撮影する";
  els.resultSection.innerHTML = "";
}

// ---------- 解析（analyze.run() 相当） ----------

function averageCategoryRaw(rawList) {
  if (!rawList.length) return {};
  const averaged = {};
  for (const catKey of Object.keys(rawList[0])) {
    const vals = rawList.map((r) => r[catKey]).filter((v) => v !== null && v !== undefined);
    averaged[catKey] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }
  return averaged;
}

function averageFraming(framingList) {
  if (!framingList.length) return {};
  const out = {};
  for (const key of Object.keys(framingList[0])) {
    const vals = framingList.map((f) => f[key]);
    out[key] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  return out;
}

async function onAnalyzeClick() {
  const customerId = (els.customerId.value || "").trim();
  if (!customerId) {
    alert("顧客IDを入力してください。");
    return;
  }
  if (!capturedPhotos.length) {
    alert("少なくとも1枚は撮影してください。");
    return;
  }

  els.analyzeBtn.disabled = true;
  els.resultSection.innerHTML = `<p class="analyzing">解析中…しばらくお待ちください。</p>`;

  try {
    const categoryRaw = averageCategoryRaw(capturedPhotos.map((p) => p.categoryRaw));
    const framingAvg = averageFraming(capturedPhotos.map((p) => p.framing));
    let qualityIssues = capturedPhotos.flatMap((p) => p.issues);

    let [prevRecord] = await history.getLatestTwo(customerId);
    if (!prevRecord) {
      const existing = await history.loadHistory(customerId);
      prevRecord = existing.length ? existing[existing.length - 1] : null;
    }

    const driftNote = metrics.compareFramingDrift(framingAvg, prevRecord ? prevRecord.framing : null);
    if (driftNote) qualityIssues.push(driftNote);
    const quality = { issues: Array.from(new Set(qualityIssues)).sort() };

    const categoryScores = await scoring.scoreCategories(categoryRaw, customerId);
    const overall = scoring.overallScore(categoryScores);
    const recommendations = scoring.recommendTreatments(categoryScores, THRESHOLD);

    const methodsUsed = new Set(
      Object.values(categoryScores).map((info) => info.method).filter((m) => m !== "no_data"),
    );
    let methodNote;
    const usedArr = Array.from(methodsUsed);
    if (usedArr.length && usedArr.every((m) => m === "percentile")) {
      methodNote = "全カテゴリ、十分な件数の過去データに基づく当サロンの相対比較によるスコアです。";
    } else if (methodsUsed.has("percentile") || methodsUsed.has("blended")) {
      methodNote =
        "当サロンの過去データとの相対比較を、カテゴリごとのデータ件数に応じた比重で" +
        "段階的に反映したスコアです（件数が少ないカテゴリほど暫定レンジ方式寄り、" +
        "件数が増えるほど自動的に相対評価の比重が高まります）。";
    } else {
      methodNote =
        "データ蓄積中のため暫定レンジによる簡易スコアです。測定件数が増えると自動的に当サロン基準の相対評価へ切り替わります。";
    }

    let beforeAfter = null;
    if (prevRecord && prevRecord.raw_metrics) {
      beforeAfter = scoring.compareBeforeAfter(prevRecord.raw_metrics, categoryRaw);
    }

    await history.saveRecord(customerId, {
      raw_metrics: categoryRaw,
      framing: framingAvg,
      scores: Object.fromEntries(Object.entries(categoryScores).map(([k, v]) => [k, v.score])),
      overall,
      photo_count: capturedPhotos.length,
    });

    const firstPhoto = capturedPhotos[0];
    const diagnosisCanvas = report.drawDiagnosisOverlay(
      firstPhoto.alignedCanvas, firstPhoto.regions, categoryScores,
    );
    const diagnosisDataUrl = diagnosisCanvas.toDataURL("image/jpeg", 0.85);

    const html = report.buildHtmlReport({
      customerId, categoryScores, overall, recommendations, methodNote,
      diagnosisDataUrl, beforeAfter, quality,
    });

    renderResult(html);
  } catch (e) {
    console.error(e);
    els.resultSection.innerHTML = `<p class="error">解析中にエラーが発生しました: ${escapeHtml(e.message || String(e))}</p>`;
  } finally {
    els.analyzeBtn.disabled = false;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function renderResult(html) {
  els.resultSection.innerHTML =
    html + `<div class="report-actions"><button id="print-btn" type="button">🖨 印刷／PDFとして保存</button>
    <button id="back-btn" type="button">← もう一度測定する</button></div>`;
  document.getElementById("print-btn").addEventListener("click", () => window.print());
  document.getElementById("back-btn").addEventListener("click", onReset);
  els.resultSection.scrollIntoView({ behavior: "smooth" });
}

// ---------- Service Worker登録（オフライン対応） ----------

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const swUrl = new URL("../service-worker.js", import.meta.url);
    navigator.serviceWorker.register(swUrl, { scope: "../" }).catch((e) => {
      console.warn("Service Worker registration failed:", e);
    });
  });
}

boot();
