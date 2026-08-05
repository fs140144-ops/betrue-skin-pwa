/**
 * 顔ランドマーク検出結果からのROI(部位)算出。
 * Python版 face_regions.py の1:1移植。MediaPipe FaceLandmarker Web (468点) を使用。
 */

export const NOSE_TIP = 1;
export const FOREHEAD_TOP = 10;
export const LEFT_EYE_OUTER = 33;
export const LEFT_EYE_INNER = 133;
export const CHIN = 152;
export const LEFT_FACE_EDGE = 234;
export const RIGHT_EYE_OUTER = 263;
export const RIGHT_EYE_INNER = 362;
export const MOUTH_LEFT = 61;
export const MOUTH_RIGHT = 291;
export const RIGHT_FACE_EDGE = 454;

/**
 * MediaPipe FaceLandmarkerResult -> ピクセル座標の配列 [[x,y], ...] へ変換。
 */
export function landmarksToPixels(faceLandmarks, width, height) {
  const pts = new Array(faceLandmarks.length);
  for (let i = 0; i < faceLandmarks.length; i++) {
    const lm = faceLandmarks[i];
    pts[i] = [lm.x * width, lm.y * height];
  }
  return pts;
}

/**
 * MediaPipeのfacialTransformationMatrixes[0].data (16要素, 行優先 4x4) から
 * pitch/yaw/roll(度)を算出。Python版 _pose_from_matrix と同一の計算。
 */
export function poseFromMatrix(matrixData) {
  // matrixData: Float32Array(16), row-major 4x4
  const m = matrixData;
  // 3x3回転部分 r[i][j] = m[i*4+j]
  const r = [
    [m[0], m[1], m[2]],
    [m[4], m[5], m[6]],
    [m[8], m[9], m[10]],
  ];
  const pitch = (Math.atan2(r[2][1], r[2][2]) * 180) / Math.PI;
  const yaw =
    (Math.atan2(-r[2][0], Math.sqrt(r[2][1] ** 2 + r[2][2] ** 2)) * 180) /
    Math.PI;
  const roll = (Math.atan2(r[1][0], r[0][0]) * 180) / Math.PI;
  return { pitch, yaw, roll };
}

/**
 * 目のラインが水平になるよう画像を回転補正し、回転後の画像(canvas)とランドマークを返す。
 * srcCanvas: HTMLCanvasElement (元画像)
 * landmarks: [[x,y], ...]
 * 戻り値: { canvas, landmarks: [[x,y],...] }
 */
export function alignFace(srcCanvas, landmarks) {
  const leftEye = landmarks[LEFT_EYE_OUTER];
  const rightEye = landmarks[RIGHT_EYE_OUTER];
  const dy = rightEye[1] - leftEye[1];
  const dx = rightEye[0] - leftEye[0];
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

  const w = srcCanvas.width;
  const h = srcCanvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const angleRad = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(-angleRad);
  const sinA = Math.sin(-angleRad);

  const outCanvas = document.createElement("canvas");
  outCanvas.width = w;
  outCanvas.height = h;
  const ctx = outCanvas.getContext("2d");
  ctx.translate(cx, cy);
  ctx.rotate(-angleRad);
  ctx.translate(-cx, -cy);
  ctx.drawImage(srcCanvas, 0, 0);

  // OpenCVのgetRotationMatrix2D(center, angle, 1.0)と同じ変換をランドマークに適用。
  // OpenCVのangleは反時計回りが正、canvas 2D contextのrotate()は時計回りが正のため、
  // 同じ見た目の回転にするにはctx.rotate(-angleRad)。ランドマーク座標変換もそれに合わせる。
  const alignedLandmarks = landmarks.map(([x, y]) => {
    const tx = x - cx;
    const ty = y - cy;
    const rx = tx * cosA - ty * sinA;
    const ry = tx * sinA + ty * cosA;
    return [rx + cx, ry + cy];
  });

  return { canvas: outCanvas, landmarks: alignedLandmarks };
}

/**
 * 撮影時のフレーミング（顔の大きさ・位置・傾き）を数値化する。
 * 回転補正前の生画像・ランドマークに対して計算する。
 */
export function computeFramingMetrics(width, height, landmarks, headPose) {
  const top = landmarks[FOREHEAD_TOP];
  const chin = landmarks[CHIN];
  const leftEdge = landmarks[LEFT_FACE_EDGE];
  const rightEdge = landmarks[RIGHT_FACE_EDGE];
  const leftEye = landmarks[LEFT_EYE_OUTER];
  const rightEye = landmarks[RIGHT_EYE_OUTER];

  const faceHRatio = (chin[1] - top[1]) / height;
  const xMin = Math.min(leftEdge[0], rightEdge[0]);
  const xMax = Math.max(leftEdge[0], rightEdge[0]);
  const faceWRatio = (xMax - xMin) / width;
  const faceCx = (xMin + xMax) / 2.0;
  const faceCy = (top[1] + chin[1]) / 2.0;
  const centerOffsetX = (faceCx - width / 2.0) / width;
  const centerOffsetY = (faceCy - height / 2.0) / height;
  const dy = rightEye[1] - leftEye[1];
  const dx = rightEye[0] - leftEye[0];
  const tiltDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

  const hp = headPose || {};
  return {
    face_h_ratio: faceHRatio,
    face_w_ratio: faceWRatio,
    center_offset_x: centerOffsetX,
    center_offset_y: centerOffsetY,
    tilt_deg: tiltDeg,
    pitch_deg: hp.pitch || 0.0,
    yaw_deg: hp.yaw || 0.0,
  };
}

/**
 * 整列済みランドマークから各部位のバウンディングボックス[x1,y1,x2,y2]を算出。
 */
export function getRegions(landmarks) {
  const top = landmarks[FOREHEAD_TOP];
  const chin = landmarks[CHIN];
  const leftEdge = landmarks[LEFT_FACE_EDGE];
  const rightEdge = landmarks[RIGHT_FACE_EDGE];
  const leftEye = landmarks[LEFT_EYE_OUTER];
  const rightEye = landmarks[RIGHT_EYE_OUTER];

  const faceH = chin[1] - top[1];
  const faceTop = top[1];
  const faceXMin = Math.min(leftEdge[0], rightEdge[0]);
  const faceXMax = Math.max(leftEdge[0], rightEdge[0]);
  const faceW = faceXMax - faceXMin;
  const eyeY = (leftEye[1] + rightEye[1]) / 2.0;

  function box(x0, x1, y0, y1) {
    return [
      Math.trunc(faceXMin + x0 * faceW),
      Math.trunc(faceTop + y0 * faceH),
      Math.trunc(faceXMin + x1 * faceW),
      Math.trunc(faceTop + y1 * faceH),
    ];
  }

  const eyeFrac = faceH ? (eyeY - faceTop) / faceH : 0.4;

  function eyeSideBox(eyePt, outwardSign) {
    const [ex, ey] = eyePt;
    const x0 = ex + outwardSign * 0.01 * faceW;
    const x1 = ex + outwardSign * 0.11 * faceW;
    return [
      Math.trunc(Math.min(x0, x1)),
      Math.trunc(ey - 0.02 * faceH),
      Math.trunc(Math.max(x0, x1)),
      Math.trunc(ey + 0.09 * faceH),
    ];
  }

  return {
    forehead: box(0.22, 0.78, 0.06, 0.28),
    glabella: box(0.44, 0.56, Math.max(0.0, eyeFrac - 0.12), Math.max(0.0, eyeFrac - 0.02)),
    left_cheek: box(0.08, 0.32, 0.5, 0.74),
    right_cheek: box(0.68, 0.92, 0.5, 0.74),
    nose: box(0.4, 0.6, 0.38, 0.64),
    chin: box(0.35, 0.65, 0.84, 0.98),
    left_under_eye: [
      Math.trunc(faceXMin + 0.14 * faceW),
      Math.trunc(eyeY + 0.02 * faceH),
      Math.trunc(faceXMin + 0.34 * faceW),
      Math.trunc(eyeY + 0.14 * faceH),
    ],
    right_under_eye: [
      Math.trunc(faceXMin + 0.66 * faceW),
      Math.trunc(eyeY + 0.02 * faceH),
      Math.trunc(faceXMin + 0.86 * faceW),
      Math.trunc(eyeY + 0.14 * faceH),
    ],
    left_nasolabial: box(0.2, 0.36, 0.6, 0.8),
    right_nasolabial: box(0.64, 0.8, 0.6, 0.8),
    left_crow_feet: eyeSideBox(leftEye, -1),
    right_crow_feet: eyeSideBox(rightEye, +1),
  };
}

/**
 * canvasから各部位を切り出す。戻り値は { name: HTMLCanvasElement|null }。
 */
export function cropRegions(srcCanvas, regions) {
  const w = srcCanvas.width;
  const h = srcCanvas.height;
  const crops = {};
  for (const [name, [x1, y1, x2, y2]] of Object.entries(regions)) {
    const x1c = Math.max(0, x1);
    const y1c = Math.max(0, y1);
    const x2c = Math.min(w, x2);
    const y2c = Math.min(h, y2);
    if (x2c <= x1c || y2c <= y1c) {
      crops[name] = null;
      continue;
    }
    const cw = x2c - x1c;
    const ch = y2c - y1c;
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = cw;
    cropCanvas.height = ch;
    const ctx = cropCanvas.getContext("2d");
    ctx.drawImage(srcCanvas, x1c, y1c, cw, ch, 0, 0, cw, ch);
    crops[name] = cropCanvas;
  }
  return crops;
}
