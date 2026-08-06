/**
 * PWA版 肌測定アプリのUI制御・オーケストレーション。
 * カメラ撮影 → 顔検出(MediaPipe) → 部位切り出し・測定(OpenCV.js) → スコアリング → 履歴保存(IndexedDB)
 * → レポート表示、をすべて端末内（オフライン）で完結させる。Python版 analyze.run() の移植。
 */
import { LandmarkerClient } from "./landmarker-client.js";
import * as regions from "./regions.js";
import * as metrics from "./metrics.js";
import * as scoring from "./scoring.js";
import * as history from "./history.js";
import * as report from "./report.js";
import * as i18n from "./i18n.js";

const MAX_PHOTOS = 3;
const THRESHOLD = 60.0;
// 診断結果の同期先（ダッシュボード用バックエンド）。オフラインでも本体機能が
// 止まらないよう、送信は常にベストエフォート（失敗しても何もしない）にする。
const SYNC_ENDPOINT = "https://betrue-booking-form.onrender.com/api/diagnosis/sync";

const els = {
  statusBox: document.getElementById("boot-status"),
  customerId: document.getElementById("customer_id"),
  treatmentSelect: document.getElementById("treatment_select"),
  treatmentOther: document.getElementById("treatment_other"),
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
  langSwitcher: document.getElementById("lang-switcher"),
};

// 静的DOMテキストの一括翻訳＋言語セレクターの描画。
// setLang()経由の切替時もi18n.js側がapplyDom()を呼ぶため、ここでは初回のみでよい。
i18n.applyDom();
i18n.renderLanguageSwitcher(els.langSwitcher);

// 「本日の施術」<select>の選択肢を現在言語で描画する。値（key）は言語に関わらず
// 固定（wodorowe等）なので、選択状態を保ったまま言語切替時に再描画できる。
function renderTreatmentOptions() {
  if (!els.treatmentSelect) return;
  const prevValue = els.treatmentSelect.value;
  els.treatmentSelect.innerHTML = "";
  const placeholderOpt = document.createElement("option");
  placeholderOpt.value = "";
  placeholderOpt.textContent = i18n.t("ui.treatmentPlaceholder");
  els.treatmentSelect.appendChild(placeholderOpt);
  for (const { key, label } of i18n.treatmentOptions()) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = label;
    els.treatmentSelect.appendChild(opt);
  }
  if (prevValue) els.treatmentSelect.value = prevValue;
}
renderTreatmentOptions();
i18n.onLangChange(renderTreatmentOptions);

// 「その他」選択時のみ自由入力欄を表示する。
if (els.treatmentSelect && els.treatmentOther) {
  els.treatmentSelect.addEventListener("change", () => {
    els.treatmentOther.style.display = els.treatmentSelect.value === "other" ? "" : "none";
  });
}

// 顔検出の初期化・実行はメインスレッドをフリーズさせないよう、
// すべてWeb Worker（landmarker-worker.js）内で行う。詳細はlandmarker-client.js参照。
const landmarkerClient = new LandmarkerClient();
let landmarkerReady = false;
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
      `${i18n.t("ui.screenshotHint")}</span></p>` +
      els.resultSection.innerHTML;
  }
}

window.addEventListener("error", (event) => {
  showFatalError(i18n.t("ui.unexpectedError"), event.error || event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  showFatalError(i18n.t("ui.unexpectedError"), event.reason);
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
    els.resetCacheBtn.textContent = i18n.t("ui.resetting");
    els.resetCacheBtn.disabled = true;
    hardResetCache();
  });
  // 初期化が20秒経っても終わらない場合に備えて、逃げ道として早めに表示しておく
  // （タイムアウトの180秒を待たなくても、ユーザーが自分の判断でやり直せるように）。
  setTimeout(() => {
    if (!landmarkerReady) els.resetCacheBtn.style.display = "";
  }, 20000);
}

// ---------- 初期化（WASMランタイム・モデルのロード） ----------

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
    setStatus(`${label}${i18n.t("ui.elapsedSuffix", { sec })}`);
  }, 1000);

  const timeout = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(i18n.t("ui.timeoutMsg", { label })));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearInterval(tick));
}

async function boot() {
  logStep(i18n.t("ui.initializing"));
  // opencv.js のWASMランタイム初期化待ち。onerror/タイムアウトいずれの場合も
  // withElapsedStatusが例外を投げ、下のboot().catch(...)でエラー表示される
  // ため、ここが理由不明なまま無限に固まることはない。
  await withElapsedStatus(window.cvReady, i18n.t("ui.loadingImageEngine"), 90000);
  logStep(i18n.t("ui.imageEngineReady"));

  // 顔検出エンジン・モデルの初期化はWorker内で実行する。万一Worker内で
  // 本当にフリーズしても、landmarkerClient側が180秒でworker.terminate()を
  // 呼んで強制的に打ち切るため、この画面が固まったままになることはない。
  await withElapsedStatus(
    landmarkerClient.init(180000),
    i18n.t("ui.loadingFaceEngine"),
    185000,
  );
  landmarkerReady = true;
  logStep(i18n.t("ui.faceEngineReady"));

  setStatus(i18n.t("ui.ready"));
  setTimeout(clearStatus, 1500);
  initCamera();
  wireUi();
}

// ---------- カメラ ----------

async function initCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showFallback(i18n.t("ui.cameraUnsupported"));
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
    return i18n.t("ui.cameraNotAllowed");
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return i18n.t("ui.cameraNotFound");
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return i18n.t("ui.cameraNotReadable");
  }
  return i18n.t("ui.cameraOtherError", { name: name || e });
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
  els.captureStatus.textContent = i18n.t("ui.analyzingCapture");
  els.captureBtn.disabled = true;
  try {
    const detectResult = await landmarkerClient.detect(canvas, 30000);
    if (!detectResult.faceLandmarks || !detectResult.faceLandmarks.length) {
      els.captureStatus.textContent = i18n.t("ui.noFaceDetected");
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
    els.captureStatus.textContent = issues.length
      ? i18n.t("ui.captureStatusWarn", {
          n: capturedPhotos.length,
          max: MAX_PHOTOS,
          issue: i18n.t("issues." + issues[0]),
        })
      : i18n.t("ui.captureStatusOk", { n: capturedPhotos.length, max: MAX_PHOTOS });

    if (capturedPhotos.length >= MAX_PHOTOS) {
      els.captureBtn.disabled = true;
      els.captureBtn.textContent = i18n.t("ui.captureBtnComplete");
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
  els.captureBtn.textContent = i18n.t("ui.captureBtn");
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
  // customerId = お客様の電話番号（正規化済み）。IndexedDBの保存キー・同期キーとして共通で使う。
  const customerId = normalizePhone(els.customerId.value);
  if (!customerId) {
    alert(i18n.t("ui.alertNeedCustomerId"));
    return;
  }
  // treatment = 本日の施術。「その他」選択時は自由入力欄の値をそのまま保存する
  // （キー固定の選択肢と違い翻訳は行わない＝スタッフが入力した言語のまま）。
  const treatmentKey = els.treatmentSelect ? els.treatmentSelect.value : "";
  const treatment = treatmentKey === "other"
    ? (els.treatmentOther ? els.treatmentOther.value.trim() : "")
    : treatmentKey;
  if (!treatment) {
    alert(i18n.t("ui.alertNeedTreatment"));
    return;
  }
  if (!capturedPhotos.length) {
    alert(i18n.t("ui.alertNeedPhoto"));
    return;
  }

  els.analyzeBtn.disabled = true;
  els.resultSection.innerHTML = `<p class="analyzing">${i18n.t("ui.analyzingReport")}</p>`;
  els.resultSection.scrollIntoView({ behavior: "smooth" });

  try {
    const categoryRaw = averageCategoryRaw(capturedPhotos.map((p) => p.categoryRaw));
    const framingAvg = averageFraming(capturedPhotos.map((p) => p.framing));
    // capturedPhotos[].issues は表示用の完成文ではなく issues.xxx の翻訳キー
    // （metrics.jsのassessFraming/assessImageQuality参照）。ここで現在言語の文言に変換する。
    let qualityIssues = capturedPhotos.flatMap((p) => p.issues).map((key) => i18n.t("issues." + key));

    let [prevRecord] = await history.getLatestTwo(customerId);
    if (!prevRecord) {
      const existing = await history.loadHistory(customerId);
      prevRecord = existing.length ? existing[existing.length - 1] : null;
    }

    const driftNote = metrics.compareFramingDrift(framingAvg, prevRecord ? prevRecord.framing : null);
    if (driftNote) {
      qualityIssues.push(i18n.t("issues." + driftNote.key, { prev: driftNote.prev, cur: driftNote.cur }));
    }
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
      methodNote = i18n.t("ui.methodNoteAllPercentile");
    } else if (methodsUsed.has("percentile") || methodsUsed.has("blended")) {
      methodNote = i18n.t("ui.methodNoteBlended");
    } else {
      methodNote = i18n.t("ui.methodNoteProvisional");
    }

    let beforeAfter = null;
    if (prevRecord && prevRecord.raw_metrics) {
      beforeAfter = scoring.compareBeforeAfter(prevRecord.raw_metrics, categoryRaw);
    }

    const recordTimestamp = new Date().toISOString();
    const scoresByCategory = Object.fromEntries(
      Object.entries(categoryScores).map(([k, v]) => [k, v.score]),
    );

    await history.saveRecord(customerId, {
      timestamp: recordTimestamp,
      raw_metrics: categoryRaw,
      framing: framingAvg,
      scores: scoresByCategory,
      overall,
      photo_count: capturedPhotos.length,
      treatment,
    });

    // ダッシュボード同期はベストエフォート・fire-and-forget（awaitしない）。
    // 失敗してもレポート表示・IndexedDB保存は既に完了しているため影響しない。
    syncDiagnosisToServer({
      phone: customerId,
      timestamp: recordTimestamp,
      overall,
      scores: scoresByCategory,
      treatment,
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
    els.resultSection.innerHTML = `<p class="error">${escapeHtml(i18n.t("ui.analyzeError", { msg: e.message || String(e) }))}</p>`;
  } finally {
    els.analyzeBtn.disabled = false;
  }
}

// 電話番号の正規化（スペース・ハイフン・カッコを除去）。
// サーバー側（booking_form/app.py の _normalize_phone）と同じルールにしておくことで、
// 「080-1234-5678」「080 1234 5678」など表記ゆれがあっても同一顧客として同期・照合できる。
function normalizePhone(raw) {
  return String(raw || "").replace(/[\s\-()]/g, "");
}

/**
 * 診断結果をスタッフ確認用ダッシュボード（Flaskバックエンド）へベストエフォートで同期する。
 * - 完全オフライン動作を壊さないよう、失敗しても何もしない（IndexedDBには既に保存済み）。
 * - awaitせずに呼び出す（fire-and-forget）。UI描画をブロックしない。
 */
function syncDiagnosisToServer(payload) {
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (typeof fetch !== "function") return;
    fetch(SYNC_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // オフライン／サーバーエラー時は握りつぶす。次回オンライン時の解析成功で
      // 改めて同期されるため、ここでのリトライは行わない。
    });
  } catch (e) {
    // fetch自体が例外を投げるような環境でも、解析フロー自体には影響させない。
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function renderResult(html) {
  els.resultSection.innerHTML =
    html + `<div class="report-actions"><button id="print-btn" type="button">${i18n.t("ui.printBtn")}</button>
    <button id="back-btn" type="button">${i18n.t("ui.backBtn")}</button></div>`;
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

boot().catch((e) => showFatalError(i18n.t("ui.bootFailed"), e));
