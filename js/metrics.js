/**
 * 部位ROIごとの客観測定ロジック。Python版 metrics.py の1:1移植（OpenCV.js使用）。
 * すべて説明可能な古典的画像処理指標のみを使用（ブラックボックスAI推論なし）。
 *
 * 前提: グローバルに `cv` (OpenCV.js) がロード済みであること。
 * 入力はcanvas由来のRGBA Matを想定し、Python版のBGR2LABなどの変換は
 * RGB2LABなど対応するコードに読み替えている（実際のR/G/B値は同じなので結果は同一）。
 */

const NORMALIZED_SIZE = 200; // 撮影距離・解像度差の影響を抑えるため各ROIをこのサイズに統一

function isValidCanvas(roiCanvas) {
  return (
    roiCanvas != null &&
    roiCanvas.width > 0 &&
    roiCanvas.height > 0 &&
    Math.min(roiCanvas.width, roiCanvas.height) >= 4
  );
}

/** canvas(切り出しROI) -> 正規化済み RGB Mat (200x200)。無効ならnull。呼び出し側でdelete()すること。 */
export function normalizeRoi(roiCanvas) {
  if (!isValidCanvas(roiCanvas)) return null;
  const rgba = cv.imread(roiCanvas);
  const rgb = new cv.Mat();
  cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);
  rgba.delete();
  const interp = rgb.rows > NORMALIZED_SIZE ? cv.INTER_AREA : cv.INTER_CUBIC;
  const dst = new cv.Mat();
  const dsize = new cv.Size(NORMALIZED_SIZE, NORMALIZED_SIZE);
  cv.resize(rgb, dst, dsize, 0, 0, interp);
  rgb.delete();
  return dst;
}

function meanStdOfChannel(mat) {
  const meanMat = new cv.Mat();
  const stdMat = new cv.Mat();
  cv.meanStdDev(mat, meanMat, stdMat);
  const mean = meanMat.data64F[0];
  const std = stdMat.data64F[0];
  meanMat.delete();
  stdMat.delete();
  return { mean, std };
}

function splitChannel(mat3, idx) {
  const channels = new cv.MatVector();
  cv.split(mat3, channels);
  const out = channels.get(idx).clone();
  for (let i = 0; i < channels.size(); i++) channels.get(i).delete();
  channels.delete();
  return out;
}

/** 色ムラ・くすみ：LAB空間の明度(L)標準偏差。値が大きいほどムラが大きい。 */
export function colorEvenness(roiRGB) {
  if (!roiRGB) return null;
  const lab = new cv.Mat();
  cv.cvtColor(roiRGB, lab, cv.COLOR_RGB2Lab);
  const L = splitChannel(lab, 0);
  const { std } = meanStdOfChannel(L);
  lab.delete();
  L.delete();
  return std;
}

/** 明るさ・透明感：LAB空間の明度(L)平均。0-100スケールに変換して返す。 */
export function brightness(roiRGB) {
  if (!roiRGB) return null;
  const lab = new cv.Mat();
  cv.cvtColor(roiRGB, lab, cv.COLOR_RGB2Lab);
  const L = splitChannel(lab, 0);
  const { mean } = meanStdOfChannel(L);
  lab.delete();
  L.delete();
  return mean * (100.0 / 255.0);
}

/** 赤み：LAB空間のa*平均値（緑〜赤軸）。値が大きいほど赤みが強い。 */
export function redness(roiRGB) {
  if (!roiRGB) return null;
  const lab = new cv.Mat();
  cv.cvtColor(roiRGB, lab, cv.COLOR_RGB2Lab);
  const A = splitChannel(lab, 1);
  const { mean } = meanStdOfChannel(A);
  lab.delete();
  A.delete();
  return mean - 128.0;
}

/** ITA°(Individual Typology Angle)：肌色調・色素沈着の標準指標。 */
export function itaAngle(roiRGB) {
  if (!roiRGB) return null;
  const lab = new cv.Mat();
  cv.cvtColor(roiRGB, lab, cv.COLOR_RGB2Lab);
  const L = splitChannel(lab, 0);
  const B = splitChannel(lab, 2);
  const lMean = meanStdOfChannel(L).mean * (100.0 / 255.0);
  let bMean = meanStdOfChannel(B).mean - 128.0;
  lab.delete();
  L.delete();
  B.delete();
  if (Math.abs(bMean) < 1e-6) bMean = 1e-6;
  return (Math.atan2(lMean - 50.0, bMean) * 180) / Math.PI;
}

function laplacianVariance(grayMat) {
  const lap = new cv.Mat();
  cv.Laplacian(grayMat, lap, cv.CV_64F);
  const meanMat = new cv.Mat();
  const stdMat = new cv.Mat();
  cv.meanStdDev(lap, meanMat, stdMat);
  const std = stdMat.data64F[0];
  lap.delete();
  meanMat.delete();
  stdMat.delete();
  return std * std; // 分散 = 標準偏差^2 (population, numpy.var()と同一)
}

/** 毛穴・キメの目立ち：グレースケールのLaplacian分散（局所テクスチャ量）。 */
export function textureScore(roiRGB) {
  if (!roiRGB) return null;
  const gray = new cv.Mat();
  cv.cvtColor(roiRGB, gray, cv.COLOR_RGB2GRAY);
  const v = laplacianVariance(gray);
  gray.delete();
  return v;
}

/** キメの均一性：ROIをブロック分割し、ブロックごとのテクスチャ量のばらつき(std)を算出。 */
export function textureUniformity(roiRGB, blockSize = 20) {
  if (!roiRGB) return null;
  const gray = new cv.Mat();
  cv.cvtColor(roiRGB, gray, cv.COLOR_RGB2GRAY);
  const h = gray.rows;
  const w = gray.cols;
  const blockVars = [];
  for (let y = 0; y + blockSize <= h; y += blockSize) {
    for (let x = 0; x + blockSize <= w; x += blockSize) {
      const rect = new cv.Rect(x, y, blockSize, blockSize);
      const block = gray.roi(rect);
      blockVars.push(laplacianVariance(block));
      block.delete();
    }
  }
  gray.delete();
  if (blockVars.length < 2) return null;
  const n = blockVars.length;
  const mean = blockVars.reduce((a, b) => a + b, 0) / n;
  const variance =
    blockVars.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
  return Math.sqrt(variance);
}

function median(uint8Array) {
  // ヒストグラムベースで中央値を算出（0-255の8bitグレースケール専用、高速）。
  const hist = new Uint32Array(256);
  for (let i = 0; i < uint8Array.length; i++) hist[uint8Array[i]]++;
  const total = uint8Array.length;
  const half = total / 2;
  let cum = 0;
  for (let v = 0; v < 256; v++) {
    cum += hist[v];
    if (cum >= half) return v;
  }
  return 255;
}

function autoCanny(grayMat, sigma = 0.33) {
  const medianVal = median(grayMat.data);
  let lower = Math.max(0, Math.floor((1.0 - sigma) * medianVal));
  let upper = Math.min(255, Math.floor((1.0 + sigma) * medianVal));
  if (upper <= lower) upper = lower + 1;
  const edges = new cv.Mat();
  cv.Canny(grayMat, edges, lower, upper);
  return edges;
}

/** シワ：適応的Cannyエッジ密度（エッジ画素数 / 全画素数）。 */
export function wrinkleDensity(roiRGB) {
  if (!roiRGB) return null;
  const gray = new cv.Mat();
  cv.cvtColor(roiRGB, gray, cv.COLOR_RGB2GRAY);
  const blurred = new cv.Mat();
  cv.GaussianBlur(gray, blurred, new cv.Size(3, 3), 0, 0, cv.BORDER_DEFAULT);
  const edges = autoCanny(blurred);
  const nonZero = cv.countNonZero(edges);
  const total = edges.rows * edges.cols;
  gray.delete();
  blurred.delete();
  edges.delete();
  return nonZero / total;
}

/**
 * 明度が周辺より局所的に高い/低い小領域（ブロブ）を検出し、件数と面積比率を返す。
 * spot/blackhead/acneで共通に使う下請け関数（grayスケール版）。
 */
function blobAreaRatioGray(grayMat, dark, meanOffset, minAreaFrac, maxAreaFrac) {
  const blurred = new cv.Mat();
  cv.GaussianBlur(grayMat, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
  const { mean: meanVal } = meanStdOfChannel(blurred);
  const mask = new cv.Mat();
  if (dark) {
    const threshVal = Math.max(0, meanVal - meanOffset);
    cv.threshold(blurred, mask, threshVal, 255, cv.THRESH_BINARY_INV);
  } else {
    const threshVal = Math.min(255, meanVal + meanOffset);
    cv.threshold(blurred, mask, threshVal, 255, cv.THRESH_BINARY);
  }
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  const roiArea = grayMat.rows * grayMat.cols;
  const minArea = Math.max(1.0, roiArea * minAreaFrac);
  const maxArea = roiArea * maxAreaFrac;
  let count = 0;
  let totalArea = 0;
  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i);
    const area = cv.contourArea(c);
    if (area >= minArea && area <= maxArea) {
      count += 1;
      totalArea += area;
    }
    c.delete();
  }
  blurred.delete();
  mask.delete();
  contours.delete();
  hierarchy.delete();
  return { count, area_ratio: roiArea ? totalArea / roiArea : 0.0 };
}

/** シミ・色素沈着：比較的大きめの暗色ブロブ（面積比0.08%〜8%）を検出。 */
export function spotMetrics(roiRGB) {
  if (!roiRGB) return null;
  const gray = new cv.Mat();
  cv.cvtColor(roiRGB, gray, cv.COLOR_RGB2GRAY);
  const result = blobAreaRatioGray(gray, true, 18, 0.0008, 0.08);
  gray.delete();
  return result;
}

/** 毛穴の黒ずみ：シミより小さい暗色ブロブ（面積比0.005%〜0.6%）を検出。 */
export function blackheadMetrics(roiRGB) {
  if (!roiRGB) return null;
  const gray = new cv.Mat();
  cv.cvtColor(roiRGB, gray, cv.COLOR_RGB2GRAY);
  const result = blobAreaRatioGray(gray, true, 28, 0.00005, 0.006);
  gray.delete();
  return result;
}

/** ニキビ・炎症性トラブル：赤み(a*)が周辺より強い小領域を検出。 */
export function acneMetrics(roiRGB) {
  if (!roiRGB) return null;
  const lab = new cv.Mat();
  cv.cvtColor(roiRGB, lab, cv.COLOR_RGB2Lab);
  const aChannel = splitChannel(lab, 1);
  lab.delete();

  const blurred = new cv.Mat();
  cv.GaussianBlur(aChannel, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
  const { mean: meanVal } = meanStdOfChannel(blurred);
  const threshVal = Math.min(255, meanVal + 10);
  const mask = new cv.Mat();
  cv.threshold(blurred, mask, threshVal, 255, cv.THRESH_BINARY);
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  const roiArea = roiRGB.rows * roiRGB.cols;
  const minArea = Math.max(1.0, roiArea * 0.0006);
  const maxArea = roiArea * 0.05;
  let count = 0;
  let totalArea = 0;
  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i);
    const area = cv.contourArea(c);
    if (area >= minArea && area <= maxArea) {
      count += 1;
      totalArea += area;
    }
    c.delete();
  }
  aChannel.delete();
  blurred.delete();
  mask.delete();
  contours.delete();
  hierarchy.delete();
  return { count, area_ratio: roiArea ? totalArea / roiArea : 0.0 };
}

/** テカリ・皮脂：高輝度・低彩度のハイライト画素（反射光）の比率。 */
export function shineRatio(roiRGB) {
  if (!roiRGB) return null;
  const hsv = new cv.Mat();
  cv.cvtColor(roiRGB, hsv, cv.COLOR_RGB2HSV);
  const s = splitChannel(hsv, 1);
  const v = splitChannel(hsv, 2);
  hsv.delete();
  const sData = s.data;
  const vData = v.data;
  let hit = 0;
  for (let i = 0; i < sData.length; i++) {
    if (vData[i] > 220 && sData[i] < 60) hit++;
  }
  s.delete();
  v.delete();
  return hit / sData.length;
}

/**
 * {region_name: canvas(切り出しROI)} から {region_name: {metric_name: value}} を計算。
 */
export function computeRegionMetrics(regionCrops) {
  const out = {};
  for (const [name, rawCanvas] of Object.entries(regionCrops)) {
    const roi = normalizeRoi(rawCanvas);
    out[name] = {
      color_evenness: colorEvenness(roi),
      brightness: brightness(roi),
      redness: redness(roi),
      ita_angle: itaAngle(roi),
      texture: textureScore(roi),
      texture_uniformity: textureUniformity(roi),
      wrinkle_density: wrinkleDensity(roi),
      spots: spotMetrics(roi),
      blackheads: blackheadMetrics(roi),
      acne: acneMetrics(roi),
      shine: shineRatio(roi),
    };
    if (roi) roi.delete();
  }
  return out;
}

/** 顔全体の画像品質を診断（ブレ・露出）。canvas(アライン済み顔全体)を渡す。 */
export function assessImageQuality(faceCanvas) {
  if (!isValidCanvas(faceCanvas)) {
    return { ok: false, issues: ["顔領域を取得できませんでした"] };
  }
  const rgba = cv.imread(faceCanvas);
  const gray = new cv.Mat();
  cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
  rgba.delete();
  const sharpness = laplacianVariance(gray);
  const { mean: meanBrightness } = meanStdOfChannel(gray);
  gray.delete();

  const issues = [];
  if (sharpness < 40) {
    issues.push("画像がブレ気味です（毛穴・キメ・シワ系スコアの精度が低下する可能性）");
  }
  if (meanBrightness < 60) {
    issues.push("暗すぎます（色ムラ・赤み・シミ系スコアの精度が低下する可能性）");
  } else if (meanBrightness > 210) {
    issues.push("明るすぎます／白飛びしています（色調系スコアの精度が低下する可能性）");
  }

  return {
    ok: issues.length === 0,
    sharpness: Math.round(sharpness * 10) / 10,
    brightness: Math.round(meanBrightness * 10) / 10,
    issues,
  };
}

// フレーミング（顔の大きさ・位置・傾き）の許容範囲。範囲外は撮り直しを促す。
export const FACE_H_RATIO_MIN = 0.35;
export const FACE_H_RATIO_MAX = 0.85;
export const CENTER_OFFSET_MAX = 0.15;
export const TILT_DEG_MAX = 10.0;
export const PITCH_DEG_MAX = 10.0;
export const YAW_DEG_MAX = 15.0;
export const FRAMING_DRIFT_THRESHOLD = 0.1;

/** 撮影時のフレーミング（顔サイズ・位置・傾き・向き）を評価する。 */
export function assessFraming(framing) {
  const issues = [];
  const faceHRatio = framing.face_h_ratio;
  if (faceHRatio < FACE_H_RATIO_MIN) {
    issues.push("顔が小さく写っています（カメラから遠い可能性）。もう少し近づいて撮影してください。");
  } else if (faceHRatio > FACE_H_RATIO_MAX) {
    issues.push("顔が大きく写りすぎています（カメラに近すぎる可能性）。もう少し離れて撮影してください。");
  }

  if (
    Math.abs(framing.center_offset_x) > CENTER_OFFSET_MAX ||
    Math.abs(framing.center_offset_y) > CENTER_OFFSET_MAX
  ) {
    issues.push("顔が画面中央からずれています。正面中央に来るように撮り直してください。");
  }

  if (Math.abs(framing.tilt_deg) > TILT_DEG_MAX) {
    issues.push("顔・カメラが傾いています（首かしげ）。まっすぐ正面を向いて撮影してください。");
  }

  if (Math.abs(framing.pitch_deg || 0.0) > PITCH_DEG_MAX) {
    issues.push("顔がうつむき・あおむき気味です。カメラを目線の高さに合わせ、正面から撮影してください。");
  }

  if (Math.abs(framing.yaw_deg || 0.0) > YAW_DEG_MAX) {
    issues.push("顔が横を向いています。カメラのレンズを正面から見て撮影してください。");
  }

  return { ok: issues.length === 0, issues };
}

/** 前回セッションと今回セッションの撮影距離（顔サイズ比率）を比較。 */
export function compareFramingDrift(current, previous) {
  if (!current || !previous) return null;
  const cur = current.face_h_ratio;
  const prev = previous.face_h_ratio;
  if (cur == null || prev == null) return null;
  const drift = cur - prev;
  if (Math.abs(drift) <= FRAMING_DRIFT_THRESHOLD) return null;
  return (
    `前回撮影時と顔の大きさ（撮影距離の目安）が異なります` +
    `（前回${(prev * 100).toFixed(0)}% → 今回${(cur * 100).toFixed(0)}%）。` +
    `Before/Afterの数値差には撮影距離の違いによる影響が含まれる可能性があります。`
  );
}
