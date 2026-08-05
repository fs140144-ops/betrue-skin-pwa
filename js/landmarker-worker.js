/**
 * MediaPipe FaceLandmarkerの初期化・顔検出処理を、メインスレッドから
 * 完全に切り離して実行するためのWorker。
 *
 * なぜWorkerに分離するのか:
 * メインスレッド上のsetTimeoutによる「ソフトタイムアウト」は、WASMの初期化や
 * 検出処理そのものがメインスレッドを同期的にブロックしている場合、
 * タイマーのコールバック自体が実行されるまで発火できない
 * （＝本当にフリーズしている状況では役に立たない）。
 * Workerは別スレッドで動くため、Worker内部で何が起きていても
 * （無限ループでも、長時間の同期WASM呼び出しでも）メインスレッド側から
 * worker.terminate()で強制的に打ち切ることができる。これが実機での
 * 「顔検出モデルを読み込み中のまま一生固まる」を構造的になくす唯一の方法。
 *
 * 重要: あえて「クラシックWorker」として生成すること（type: "module"にしない）。
 * vision_bundle.mjs内部には、WASMグルーコードを追加ロードする際に
 * `typeof importScripts === "function"` であればWorker環境とみなして
 * `importScripts(...)` を呼び出す実装が含まれている。ところが
 * importScripts()は仕様上「モジュールWorker」では使用できず、呼び出した瞬間に
 * 例外（Module scripts don't support importScripts()）で落ちてしまう
 * （実機検証で実際にこのエラーが発生することを確認済み）。
 * クラシックWorkerであればimportScripts()は正常に使えるため、
 * vision_bundle.mjs（ESモジュール）自体は静的importではなく動的import()で読み込む
 * （動的import()はクラシックスクリプト・クラシックWorkerからでも仕様上使用可能）。
 * パス解決も、モジュールでないため import.meta.url が使えず、代わりに
 * self.location.href（Workerスクリプト自身の絶対URL）を基準にする。
 */
const SELF_URL = self.location.href;
const MODEL_URL = new URL("../models/face_landmarker.task", SELF_URL).href;
const WASM_BASE_URL = new URL("../vendor/mediapipe/wasm", SELF_URL).href;
const VISION_BUNDLE_URL = new URL("../vendor/mediapipe/vision_bundle.mjs", SELF_URL).href;

let faceLandmarker = null;

async function init() {
  const { FaceLandmarker, FilesetResolver } = await import(VISION_BUNDLE_URL);
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
  faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      // GPU delegateはiOS Safari等で互換性が不安定で、環境によっては例外を投げずに
      // 初期化が長時間ハングすることが確認されている。撮影1枚あたり1回しか
      // 検出を実行しないため速度メリットは小さく、全端末で確実に動くことを優先する。
      delegate: "CPU",
    },
    runningMode: "IMAGE",
    numFaces: 1,
    outputFacialTransformationMatrixes: true,
  });
}

// MediaPipeの検出結果はメインスレッドへ構造化複製（structured clone）で渡す必要がある。
// faceLandmarks/facialTransformationMatrixesの中身を、複製可能な単純なオブジェクト・
// 配列に変換しておく（regions.jsは.x/.y、配列風の数値インデックスしか使わないため
// この変換で情報は失われない）。
function serializeDetectResult(result) {
  const faceLandmarks = (result.faceLandmarks || []).map((landmarks) =>
    landmarks.map((p) => ({ x: p.x, y: p.y, z: p.z })),
  );
  const facialTransformationMatrixes = (result.facialTransformationMatrixes || []).map((m) => ({
    data: Array.from(m.data),
  }));
  return { faceLandmarks, facialTransformationMatrixes };
}

self.onmessage = async (event) => {
  const { id, type, payload } = event.data || {};
  try {
    if (type === "init") {
      await init();
      self.postMessage({ id, type: "init-done" });
    } else if (type === "detect") {
      if (!faceLandmarker) throw new Error("顔検出エンジンが未初期化です");
      const result = faceLandmarker.detect(payload.bitmap);
      payload.bitmap.close();
      self.postMessage({ id, type: "detect-done", result: serializeDetectResult(result) });
    }
  } catch (e) {
    self.postMessage({ id, type: "error", message: (e && (e.message || String(e))) || "不明なエラー" });
  }
};
