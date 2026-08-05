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
  fallbackNote: document.getElementById("fallback-note"),
  retryCameraBtn: document.getElementById("retry-camera-btn"),
  analyzeBtn: document.getElementById("analyze-btn"),
  resultSection: document.getElementById("result-section"),
  workCanvas: document.getElementById("work-canvas"),
  resetCacheBtn: document.getElementById("reset-cache-btn"),
};

let faceLandmarker = null;
let capturedPhotos = []; // { alignedCanvas, regions, framing, categoryRaw, issues }
let mediaStream = null;

// 初期化の各段階を「上書き」ではなく「行を積み上げて」表示する。
// もし途中でフリーズしても、その時点のスクリーンショット1枚だけで
// どの段階まで進んでから止まったのかが分かるようにするため
// （サポート時の原因切り分けを速くする目的）。
function logStep(text) {
  console.log("[boot]", text);
  if (!els.statusBox) return;
  const line = document.createElement("div");
  line.textContent = text;
  els.statusBox.appendChild(line);
}

// 進捗カウンタなど、頻繁に更新される行はチェックポイント行を積み上げず
// 直近の1行だけを書き換える（末尾がlive行でなければ新規に作る）。
function setStatus(text) {
  if (!els.statusBox) return;
  let last = els.statusBox.lastElementChild;
  if (!last || last.dataset.live !== "1") {
    last = document.createElement("div");
    last.dataset.live = "1";
    els.statusBox.appendChild(last);
  }
  last.textContent = text;
}

function clearStatus() {
  if (els.statusBox) els.statusBox.innerHTML = "";
}

// 実機での「押しても何も起きない」を防ぐための保険。
// コンソールにしか出ないはずの想定外のエラーも、画面上に見える形で必ず表示する。
// これまでの進捗ログ（logStep/setStatusで積み上げた行）は消さずに残す
// ＝どこまで進んでから失敗したのかが、エラー画面からもそのまま分かる。
function showFatalError(prefix, err) {
  const msg = (err && (err.message || err.toString())) || String(err);
  console.error(prefix, err);
  if (els.statusBox) {
    const line = document.createElement("div");
    line.style.color = "#ff6b6b";
    line.style.fontWeight = "bold";
    line.textContent = `⚠ ${prefix}: ${msg}`;
    els.statusBox.appendChild(line);
  }
  if (els.resultSection) {
    els.resultSection.innerHTML =
      `<p class="error">⚠ ${prefix}: ${escapeHtml(msg)}<br><span class="small">` +
      `画面を再読み込みしても直らない場合は、この画面のスクリーンショットを共有してください。</span></p>` +
      els.resultSection.innerHTML;
  }
}

window.addEventListener("error", (event) => {
  showFatalError("予期しないエラーが発生しました", event.error || event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  showFatalError("予期しないエラーが発生しました", event.reason);
});

// 端末に「壊れた／中途半端な」状態でキャッシュされたファイルが残っていると、
// コード側をいくら修正しても初期化が終わらないことがある。
// その場合の最終手段として、Service Workerの登録解除＋全キャッシュ削除＋
// 再読み込みを1ボタンでできるようにしておく。
async function hardResetCache() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch (e) {
    console.warn("hardResetCache failed:", e);
  } finally {
    location.reload();
  }
}

if (els.resetCacheBtn) {
  els.resetCacheBtn.addEventListener("click", () => {
    els.resetCacheBtn.textContent = "リセット中…";
    els.resetCacheBtn.disabled = true;
    hardResetCache();
  });
  // 初期化が20秒経っても終わらない場合に備えて、逃げ道として早めに表示しておく
  // （タイムアウトの180秒を待たなくても、ユーザーが自分の判断でやり直せるように）。
  setTimeout(() => {
    if (!faceLandmarker) els.resetCacheBtn.style.display = "";
  }, 20000);
}

// ---------- 初期化（WASMランタイム・モデルのロード） ----------

// GPU delegateはiOS Safari等で互換性が不安定で、環境によっては例外を投げずに
// 初期化が長時間ハングすることが確認された（try/catchでは救えない）。
// 撮影1枚あたり1回しか顔検出を実行しないため速度面のメリットは小さく、
// 全端末で確実に動くことを優先してCPU delegateのみを使用する。
//
// パス解決について: MediaPipeのforVisionTasks/modelAssetPathに渡す文字列は
// 「現在のドキュメントのURL」基準で解決される（jsモジュールのimport文のように
// app.js自身の場所を基準にはしてくれない）。GitHub Pages等、pwa/がオリジン直下
// ではなくサブディレクトリ（例: https://example.github.io/betrue-skin-pwa/）で
// 配信される場合、"../vendor/..." のような相対文字列は誤ったパスに解決されて
// しまう（一つ上のディレクトリに飛び出してしまう）。そのため必ずimport.meta.url
// （app.js自身の実URL）を基準にした絶対URLへ変換してから渡す。
const MODEL_URL = new URL("../models/face_landmarker.task", import.meta.url).href;
const WASM_BASE_URL = new URL("../vendor/mediapipe/wasm", import.meta.url).href;

function createLandmarker(fileset, delegate) {
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate,
    },
    runningMode: "IMAGE",
    numFaces: 1,
    outputFacialTransformationMatrixes: true,
  });
}

// 初回起動時はopencv.js(約10MB)＋WASM本体(約9MB)＋顔検出モデル(約4MB)の
// 合計20数MBをダウンロード・コンパイルする必要があり、回線が遅い環境
// （特にモバイル回線）では数十秒〜数分かかることがある。
// 進捗が全く動かないと「フリーズした」ように見えてしまうため、
// ①経過秒数を画面に表示し続ける、②あまりに長くかかる場合はタイムアウトして
// 「回線を確認してください」という具体的な案内を出す、という二段構えにする。
function withElapsedStatus(promise, label, timeoutMs) {
  const startedAt = Date.now();
  const tick = setInterval(() => {
    const sec = Math.floor((Date.now() - startedAt) / 1000);
    setStatus(`${label}…（${sec}秒経過。初回は時間がかかります）`);
  }, 1000);

  const timeout = new Promise((_, reject) => {
    setTimeout(() => {
      reject(
        new Error(
          `${label}がタイムアウトしました。通信環境（できればWi-Fi）を確認のうえ、` +
            `画面を再読み込みしてもう一度お試しください。何度も失敗する場合は電波の良い場所でお試しください。`,
        ),
      );
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearInterval(tick));
}

async function boot() {
  logStep("初期化中…（初回のみ数十秒〜数分かかる場合があります）");
  await window.cvReady; // opencv.js のWASMランタイム初期化待ち
  logStep("✓ 画像処理エンジンの準備完了");

  const fileset = await withElapsedStatus(
    FilesetResolver.forVisionTasks(WASM_BASE_URL),
    "顔検出エンジンを読み込み中",
    180000,
  );
  logStep("✓ 顔検出エンジンの読み込み完了");

  faceLandmarker = await withElapsedStatus(
    createLandmarker(fileset, "CPU"),
    "顔検出モデルを読み込み中",
    180000,
  );
  logStep("✓ 顔検出モデルの読み込み完了");

  setStatus("準備完了。撮影してください。");
  setTimeout(clearStatus, 1500);
  initCamera();
  wireUi();
}

// ---------- カメラ ----------

async function initCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showFallback("このブラウザはカメラ撮影に対応していません。");
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
    console.warn("getUserMedia failed:", e);
    showFallback(cameraErrorMessage(e));
  }
}

function cameraErrorMessage(e) {
  const name = e && e.name;
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "カメラの使用が許可されていません。ブラウザ／端末の設定でこのアプリのカメラ許可をオンにしてから「カメラをもう一度試す」を押してください。";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "カメラが見つかりませんでした。下のボタンから写真を撮影／選択してください。";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "カメラが他のアプリで使用中の可能性があります。他のカメラアプリを閉じてから「カメラをもう一度試す」を押してください。";
  }
  return `カメラを起動できませんでした（${name || e}）。下のボタンから写真を撮影／選択してください。`;
}

function showFallback(reason) {
  els.cameraSection.style.display = "none";
  els.fallbackSection.style.display = "";
  if (reason && els.fallbackNote) {
    els.fallbackNote.textContent = reason;
  }
}

function wireUi() {
  els.captureBtn.addEventListener("click", onCaptureClick);
  els.resetBtn.addEventListener("click", onReset);
  els.fallbackInput.addEventListener("change", onFallbackFileChange);
  els.analyzeBtn.addEventListener("click", onAnalyzeClick);
  if (els.retryCameraBtn) {
    els.retryCameraBtn.addEventListener("click", () => initCamera());
  }
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
  els.resultSection.scrollIntoView({ behavior: "smooth" });

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
  // 新しいService Workerが有効化されて「操作の主体」が切り替わったら、
  // 自動的に1回だけページを再読み込みする。これが無いと、修正版を
  // デプロイしても古いService Workerが既に開いているタブを制御し続け、
  // ユーザーが手動でアプリを閉じて開き直すまで新しいコードが反映されない
  // （＝修正したはずのバグが直って見えない）という問題が起きる。
  let swRefreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (swRefreshing) return;
    swRefreshing = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    const swUrl = new URL("../service-worker.js", import.meta.url);
    navigator.serviceWorker.register(swUrl, { scope: "../" }).catch((e) => {
      console.warn("Service Worker registration failed:", e);
    });
  });
}

boot().catch((e) => showFatalError("初期化に失敗しました", e));
