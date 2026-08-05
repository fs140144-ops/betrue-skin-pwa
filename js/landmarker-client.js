/**
 * landmarker-worker.js をメインスレッドから使うためのラッパー。
 *
 * タイムアウト時にPromiseをrejectするだけでなく、必ずworker.terminate()で
 * ワーカーそのものを強制終了する点が重要（詳細はlandmarker-worker.jsのコメント参照）。
 * 強制終了後は内部状態をリセットするため、次回呼び出し時には新しいワーカーが
 * クリーンな状態から作り直され、壊れた状態のまま使い続けることがない。
 */
export class LandmarkerClient {
  constructor() {
    this.worker = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  _createWorker() {
    const workerUrl = new URL("./landmarker-worker.js", import.meta.url);
    // あえてクラシックWorkerとして生成する（type: "module"を指定しない）。
    // 理由はlandmarker-worker.js冒頭のコメント参照
    // （MediaPipe内部がimportScripts()を使うため、モジュールWorkerだと例外になる）。
    const worker = new Worker(workerUrl);
    worker.onmessage = (event) => {
      const { id, type, result, message } = event.data || {};
      const entry = this.pending.get(id);
      if (!entry) return;
      this.pending.delete(id);
      clearTimeout(entry.timer);
      if (type === "error") {
        entry.reject(new Error(message));
      } else {
        entry.resolve(result);
      }
    };
    worker.onerror = (event) => {
      // Worker内で起きたキャッチされない例外（構文エラー・読み込み失敗等）。
      // 保留中の全リクエストを失敗させ、壊れたワーカーは捨てる。
      const err = new Error(event.message || "Workerで予期しないエラーが発生しました");
      for (const [, entry] of this.pending) {
        clearTimeout(entry.timer);
        entry.reject(err);
      }
      this.pending.clear();
      this.worker = null;
    };
    this.worker = worker;
  }

  _send(type, payload, timeoutMs, transfer) {
    if (!this.worker) this._createWorker();
    const worker = this.worker;
    const id = this.nextId++;
    const label = type === "init" ? "顔検出エンジンの初期化" : "顔検出処理";
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        // メインスレッドのsetTimeoutではなくWorker自体を強制終了する。
        // Worker内部が本当にフリーズ・無限ループしていても、これは必ず効く。
        worker.terminate();
        if (this.worker === worker) this.worker = null;
        reject(new Error(`${label}がタイムアウトしました。画面を再読み込みしてもう一度お試しください。`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, type, payload }, transfer || []);
    });
  }

  /** 顔検出エンジン・モデルの初期化。 */
  init(timeoutMs) {
    return this._send("init", null, timeoutMs);
  }

  /** canvas上の画像1枚に対して顔検出を実行する。 */
  async detect(canvas, timeoutMs) {
    const bitmap = await createImageBitmap(canvas);
    return this._send("detect", { bitmap }, timeoutMs, [bitmap]);
  }
}
