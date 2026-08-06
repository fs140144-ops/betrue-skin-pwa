/**
 * 多言語対応（日本語・英語・ポーランド語）の中核モジュール。
 *
 * 設計方針:
 * - 選択言語は localStorage に永続化し、次回起動時も同じ言語で開く。
 * - 静的なDOMテキストは index.html 側に data-i18n="ui.xxx" のような属性を
 *   付けておき、applyDom() が textContent を一括で差し替える
 *   （app.js側で個別にDOM操作しなくて済むようにするため）。
 * - 動的に生成される文言（app.js/report.jsが実行時に組み立てる文字列）は
 *   t("ui.xxx", {vars}) を呼び出して直接文字列として取得する。
 * - カテゴリ・部位名など、業務データ本体（日本語）は scoring.js / report.js に
 *   既にあるものをそのまま「日本語の正本」として扱い、ここでは英語・ポーランド語
 *   の対訳だけを追加で持つ（二重管理を避けるため）。
 */

export const LANGS = ["ja", "en", "pl"];
export const LANG_LABELS = { ja: "🇯🇵 日本語", en: "🇬🇧 English", pl: "🇵🇱 Polski" };
export const LOCALE_MAP = { ja: "ja-JP", en: "en-US", pl: "pl-PL" };

const STORAGE_KEY = "betrue_skin_lang";
const CHANGE_EVENT = "betrue:langchange";

function detectDefaultLang() {
  const nav = (navigator.language || "ja").toLowerCase();
  if (nav.startsWith("pl")) return "pl";
  if (nav.startsWith("ja")) return "ja";
  if (nav.startsWith("en")) return "en";
  return "ja";
}

let _lang = null;
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  _lang = LANGS.includes(saved) ? saved : null;
} catch (e) {
  _lang = null;
}
if (!_lang) _lang = detectDefaultLang();

export function getLang() {
  return _lang;
}

export function setLang(lang) {
  if (!LANGS.includes(lang) || lang === _lang) return;
  _lang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch (e) {
    /* プライベートブラウジング等で保存できなくても致命的ではないため無視 */
  }
  applyDom();
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { lang } }));
}

export function onLangChange(handler) {
  window.addEventListener(CHANGE_EVENT, (e) => handler(e.detail.lang));
}

// ---------- UI文言 ----------

const UI = {
  ja: {
    title: "🌸 Be:true 肌測定",
    loading: "読み込み中…",
    resetCacheBtn: "🗑 キャッシュをクリアして再試行",
    resetting: "リセット中…",
    customerIdLabel: "お客様の電話番号",
    customerIdPlaceholder: "例：09012345678",
    treatmentLabel: "本日の施術",
    treatmentPlaceholder: "選択してください",
    treatmentOtherPlaceholder: "施術名を入力してください",
    alertNeedTreatment: "本日の施術を選択してください。",
    guideTitle: "📋 撮影ガイド",
    guide1: "明るい場所で撮影してください",
    guide2: "正面を向いて、カメラと同じ高さで撮影してください",
    guide3: "前髪を上げ、メガネ・マスクは外してください",
    guide4: "無表情で、枠に顔を合わせてください",
    guide5: "できれば3枚撮影してください（誤差を減らせます）",
    guideOverlayText: "顔をこの枠に合わせてください",
    captureBtn: "📸 撮影する",
    captureBtnComplete: "撮影完了（3枚）",
    resetBtn: "🔄 撮り直す",
    fallbackNoteDefault: "カメラが使用できないため、下のボタンから写真を撮影／選択してください（最大3枚）。",
    fallbackLabel: "📷 写真を撮る／選択する",
    retryCameraBtn: "🔄 カメラをもう一度試す",
    analyzeBtn: "🔬 解析する",
    opencvLoadError: "画像処理エンジン(opencv.js)の読み込みに失敗しました。通信環境を確認してください。",
    unexpectedError: "予期しないエラーが発生しました",
    screenshotHint: "画面を再読み込みしても直らない場合は、この画面のスクリーンショットを共有してください。",
    initializing: "初期化中…（初回のみ数十秒〜数分かかる場合があります）",
    loadingImageEngine: "画像処理エンジンを読み込み中",
    imageEngineReady: "✓ 画像処理エンジンの準備完了",
    loadingFaceEngine: "顔検出エンジンを読み込み中",
    faceEngineReady: "✓ 顔検出エンジンの読み込み完了",
    ready: "準備完了。撮影してください。",
    elapsedSuffix: "…（{sec}秒経過。初回は時間がかかります）",
    timeoutMsg: "{label}がタイムアウトしました。通信環境（できればWi-Fi）を確認のうえ、画面を再読み込みしてもう一度お試しください。何度も失敗する場合は電波の良い場所でお試しください。",
    cameraUnsupported: "このブラウザはカメラ撮影に対応していません。",
    cameraNotAllowed: "カメラの使用が許可されていません。ブラウザ／端末の設定でこのアプリのカメラ許可をオンにしてから「カメラをもう一度試す」を押してください。",
    cameraNotFound: "カメラが見つかりませんでした。下のボタンから写真を撮影／選択してください。",
    cameraNotReadable: "カメラが他のアプリで使用中の可能性があります。他のカメラアプリを閉じてから「カメラをもう一度試す」を押してください。",
    cameraOtherError: "カメラを起動できませんでした（{name}）。下のボタンから写真を撮影／選択してください。",
    analyzingCapture: "解析中…",
    noFaceDetected: "⚠ 顔を検出できませんでした。正面を向いた明るい写真で再撮影してください。",
    captureStatusWarn: "撮影 {n}/{max} 枚（⚠ {issue}）",
    captureStatusOk: "撮影 {n}/{max} 枚 OK",
    alertNeedCustomerId: "お客様の電話番号を入力してください。",
    alertNeedPhoto: "少なくとも1枚は撮影してください。",
    analyzingReport: "解析中…しばらくお待ちください。",
    methodNoteAllPercentile: "全カテゴリ、十分な件数の過去データに基づく当サロンの相対比較によるスコアです。",
    methodNoteBlended: "当サロンの過去データとの相対比較を、カテゴリごとのデータ件数に応じた比重で段階的に反映したスコアです（件数が少ないカテゴリほど暫定レンジ方式寄り、件数が増えるほど自動的に相対評価の比重が高まります）。",
    methodNoteProvisional: "データ蓄積中のため暫定レンジによる簡易スコアです。測定件数が増えると自動的に当サロン基準の相対評価へ切り替わります。",
    analyzeError: "解析中にエラーが発生しました: {msg}",
    printBtn: "🖨 印刷／PDFとして保存",
    backBtn: "← もう一度測定する",
    bootFailed: "初期化に失敗しました",
  },
  en: {
    title: "🌸 Be:true Skin Analysis",
    loading: "Loading…",
    resetCacheBtn: "🗑 Clear cache and retry",
    resetting: "Resetting…",
    customerIdLabel: "Customer phone number",
    customerIdPlaceholder: "e.g. 09012345678",
    treatmentLabel: "Today's treatment",
    treatmentPlaceholder: "Please select",
    treatmentOtherPlaceholder: "Enter treatment name",
    alertNeedTreatment: "Please select today's treatment.",
    guideTitle: "📋 Photo guide",
    guide1: "Take the photo in a bright, well-lit place",
    guide2: "Face forward, with the camera at eye level",
    guide3: "Lift your bangs and remove glasses/mask",
    guide4: "Keep a neutral expression and fit your face inside the frame",
    guide5: "If possible, take 3 photos (this reduces measurement error)",
    guideOverlayText: "Fit your face inside this frame",
    captureBtn: "📸 Take photo",
    captureBtnComplete: "Photos complete (3)",
    resetBtn: "🔄 Retake",
    fallbackNoteDefault: "Camera is unavailable. Please take or choose a photo using the button below (up to 3).",
    fallbackLabel: "📷 Take or choose a photo",
    retryCameraBtn: "🔄 Try camera again",
    analyzeBtn: "🔬 Analyze",
    opencvLoadError: "Failed to load the image-processing engine (opencv.js). Please check your internet connection.",
    unexpectedError: "An unexpected error occurred",
    screenshotHint: "If reloading the page doesn't fix this, please share a screenshot of this screen.",
    initializing: "Initializing… (the first run may take from tens of seconds up to a few minutes)",
    loadingImageEngine: "Loading image-processing engine",
    imageEngineReady: "✓ Image-processing engine ready",
    loadingFaceEngine: "Loading face-detection engine",
    faceEngineReady: "✓ Face-detection engine ready",
    ready: "Ready. Please take a photo.",
    elapsedSuffix: "… ({sec}s elapsed. The first run takes longer)",
    timeoutMsg: "{label} timed out. Please check your connection (Wi-Fi recommended), reload the page and try again. If it keeps failing, try somewhere with a stronger signal.",
    cameraUnsupported: "This browser does not support camera capture.",
    cameraNotAllowed: "Camera access was not granted. Please enable camera permission for this app in your browser/device settings, then tap \"Try camera again\".",
    cameraNotFound: "No camera was found. Please take or choose a photo using the button below.",
    cameraNotReadable: "The camera may be in use by another app. Please close other camera apps, then tap \"Try camera again\".",
    cameraOtherError: "Could not start the camera ({name}). Please take or choose a photo using the button below.",
    analyzingCapture: "Analyzing…",
    noFaceDetected: "⚠ No face was detected. Please retake a bright, front-facing photo.",
    captureStatusWarn: "Photo {n}/{max} (⚠ {issue})",
    captureStatusOk: "Photo {n}/{max} OK",
    alertNeedCustomerId: "Please enter the customer's phone number.",
    alertNeedPhoto: "Please take at least one photo.",
    analyzingReport: "Analyzing… please wait a moment.",
    methodNoteAllPercentile: "All categories are scored by comparing against this salon's own past measurements (sufficient data available).",
    methodNoteBlended: "Scores blend a relative comparison against this salon's past data with a provisional-range method, weighted by how much data exists for each category (categories with less data lean on the provisional range; as data accumulates, the relative comparison automatically takes over).",
    methodNoteProvisional: "Scores use a provisional range as data is still being collected. As more measurements accumulate, scoring will automatically switch to this salon's own relative comparison.",
    analyzeError: "An error occurred during analysis: {msg}",
    printBtn: "🖨 Print / Save as PDF",
    backBtn: "← Measure again",
    bootFailed: "Initialization failed",
  },
  pl: {
    title: "🌸 Be:true Analiza Skóry",
    loading: "Wczytywanie…",
    resetCacheBtn: "🗑 Wyczyść pamięć podręczną i spróbuj ponownie",
    resetting: "Resetowanie…",
    customerIdLabel: "Numer telefonu klienta",
    customerIdPlaceholder: "np. 09012345678",
    treatmentLabel: "Dzisiejszy zabieg",
    treatmentPlaceholder: "Wybierz",
    treatmentOtherPlaceholder: "Wpisz nazwę zabiegu",
    alertNeedTreatment: "Wybierz dzisiejszy zabieg.",
    guideTitle: "📋 Instrukcja zdjęcia",
    guide1: "Zrób zdjęcie w jasnym, dobrze oświetlonym miejscu",
    guide2: "Ustaw się przodem, z kamerą na wysokości oczu",
    guide3: "Odsłoń czoło i zdejmij okulary/maseczkę",
    guide4: "Zachowaj neutralny wyraz twarzy i zmieść twarz w ramce",
    guide5: "Jeśli to możliwe, zrób 3 zdjęcia (zmniejsza to błąd pomiaru)",
    guideOverlayText: "Dopasuj twarz do tej ramki",
    captureBtn: "📸 Zrób zdjęcie",
    captureBtnComplete: "Zdjęcia gotowe (3)",
    resetBtn: "🔄 Zrób ponownie",
    fallbackNoteDefault: "Kamera jest niedostępna. Zrób lub wybierz zdjęcie za pomocą przycisku poniżej (maks. 3).",
    fallbackLabel: "📷 Zrób lub wybierz zdjęcie",
    retryCameraBtn: "🔄 Spróbuj kamery ponownie",
    analyzeBtn: "🔬 Analizuj",
    opencvLoadError: "Nie udało się wczytać silnika przetwarzania obrazu (opencv.js). Sprawdź połączenie internetowe.",
    unexpectedError: "Wystąpił nieoczekiwany błąd",
    screenshotHint: "Jeśli odświeżenie strony nie pomoże, prześlij zrzut ekranu tego widoku.",
    initializing: "Inicjalizacja… (pierwsze uruchomienie może potrwać od kilkudziesięciu sekund do kilku minut)",
    loadingImageEngine: "Wczytywanie silnika przetwarzania obrazu",
    imageEngineReady: "✓ Silnik przetwarzania obrazu gotowy",
    loadingFaceEngine: "Wczytywanie silnika wykrywania twarzy",
    faceEngineReady: "✓ Silnik wykrywania twarzy gotowy",
    ready: "Gotowe. Zrób zdjęcie.",
    elapsedSuffix: "… (upłynęło {sec}s. Pierwsze uruchomienie trwa dłużej)",
    timeoutMsg: "{label} — przekroczono limit czasu. Sprawdź połączenie (najlepiej Wi-Fi), odśwież stronę i spróbuj ponownie. Jeśli błąd się powtarza, spróbuj w miejscu z lepszym zasięgiem.",
    cameraUnsupported: "Ta przeglądarka nie obsługuje robienia zdjęć kamerą.",
    cameraNotAllowed: "Nie udzielono dostępu do kamery. Włącz uprawnienia kamery dla tej aplikacji w ustawieniach przeglądarki/urządzenia, a następnie dotknij „Spróbuj kamery ponownie”.",
    cameraNotFound: "Nie znaleziono kamery. Zrób lub wybierz zdjęcie za pomocą przycisku poniżej.",
    cameraNotReadable: "Kamera może być używana przez inną aplikację. Zamknij inne aplikacje korzystające z kamery, a następnie dotknij „Spróbuj kamery ponownie”.",
    cameraOtherError: "Nie udało się uruchomić kamery ({name}). Zrób lub wybierz zdjęcie za pomocą przycisku poniżej.",
    analyzingCapture: "Analizowanie…",
    noFaceDetected: "⚠ Nie wykryto twarzy. Zrób ponownie jasne zdjęcie twarzą do kamery.",
    captureStatusWarn: "Zdjęcie {n}/{max} (⚠ {issue})",
    captureStatusOk: "Zdjęcie {n}/{max} OK",
    alertNeedCustomerId: "Podaj numer telefonu klienta.",
    alertNeedPhoto: "Zrób co najmniej jedno zdjęcie.",
    analyzingReport: "Analizowanie… proszę czekać.",
    methodNoteAllPercentile: "Wszystkie kategorie są oceniane na podstawie porównania z dotychczasowymi pomiarami tego salonu (wystarczająca ilość danych).",
    methodNoteBlended: "Wynik łączy porównanie względne z danymi historycznymi salonu z metodą tymczasowego zakresu, z wagą zależną od ilości danych w każdej kategorii (przy mniejszej ilości danych dominuje zakres tymczasowy, a wraz z przybywaniem pomiarów automatycznie rośnie waga porównania względnego).",
    methodNoteProvisional: "Wynik oparty jest na tymczasowym zakresie, ponieważ dane są wciąż gromadzone. Wraz ze wzrostem liczby pomiarów ocena automatycznie przełączy się na porównanie względne w ramach tego salonu.",
    analyzeError: "Wystąpił błąd podczas analizy: {msg}",
    printBtn: "🖨 Drukuj / Zapisz jako PDF",
    backBtn: "← Zmierz ponownie",
    bootFailed: "Inicjalizacja nie powiodła się",
  },
};

// ---------- 撮影品質・フレーミングの注意メッセージ ----------

const ISSUES = {
  ja: {
    blurry: "画像がブレ気味です（毛穴・キメ・シワ系スコアの精度が低下する可能性）",
    tooDark: "暗すぎます（色ムラ・赤み・シミ系スコアの精度が低下する可能性）",
    tooBright: "明るすぎます／白飛びしています（色調系スコアの精度が低下する可能性）",
    noFaceRegion: "顔領域を取得できませんでした",
    faceTooSmall: "顔が小さく写っています（カメラから遠い可能性）。もう少し近づいて撮影してください。",
    faceTooLarge: "顔が大きく写りすぎています（カメラに近すぎる可能性）。もう少し離れて撮影してください。",
    offCenter: "顔が画面中央からずれています。正面中央に来るように撮り直してください。",
    tilted: "顔・カメラが傾いています（首かしげ）。まっすぐ正面を向いて撮影してください。",
    pitchOff: "顔がうつむき・あおむき気味です。カメラを目線の高さに合わせ、正面から撮影してください。",
    yawOff: "顔が横を向いています。カメラのレンズを正面から見て撮影してください。",
    framingDrift: "前回撮影時と顔の大きさ（撮影距離の目安）が異なります（前回{prev}% → 今回{cur}%）。Before/Afterの数値差には撮影距離の違いによる影響が含まれる可能性があります。",
  },
  en: {
    blurry: "The image is somewhat blurry (accuracy of pore/texture/wrinkle scores may be reduced)",
    tooDark: "Too dark (accuracy of unevenness/redness/spot scores may be reduced)",
    tooBright: "Too bright / overexposed (accuracy of tone-related scores may be reduced)",
    noFaceRegion: "Could not capture the face region",
    faceTooSmall: "The face appears small (camera may be too far). Please move a little closer and retake.",
    faceTooLarge: "The face appears too large (camera may be too close). Please move back a little and retake.",
    offCenter: "The face is off-center. Please retake with your face centered.",
    tilted: "The face/camera is tilted (head tilt). Please face forward straight and retake.",
    pitchOff: "The face is tilted up or down. Please align the camera to eye level and shoot straight on.",
    yawOff: "The face is turned to the side. Please look straight at the camera lens.",
    framingDrift: "The apparent face size (shooting distance) differs from the previous session (previous {prev}% → now {cur}%). The Before/After numeric difference may partly reflect this distance difference.",
  },
  pl: {
    blurry: "Zdjęcie jest lekko rozmyte (może obniżyć dokładność wyników dot. porów/tekstury/zmarszczek)",
    tooDark: "Zbyt ciemno (może obniżyć dokładność wyników dot. przebarwień/zaczerwienień/plam)",
    tooBright: "Zbyt jasno / prześwietlone (może obniżyć dokładność wyników dot. kolorytu)",
    noFaceRegion: "Nie udało się uchwycić obszaru twarzy",
    faceTooSmall: "Twarz jest mała na zdjęciu (kamera może być zbyt daleko). Podejdź bliżej i zrób zdjęcie ponownie.",
    faceTooLarge: "Twarz jest zbyt duża na zdjęciu (kamera może być zbyt blisko). Odsuń się nieco i zrób zdjęcie ponownie.",
    offCenter: "Twarz jest przesunięta od środka kadru. Zrób zdjęcie ponownie, centrując twarz.",
    tilted: "Twarz/kamera są przechylone. Ustaw się prosto, przodem do kamery i zrób zdjęcie ponownie.",
    pitchOff: "Twarz jest pochylona w górę lub w dół. Ustaw kamerę na wysokości oczu i zrób zdjęcie na wprost.",
    yawOff: "Twarz jest odwrócona w bok. Spójrz prosto w obiektyw kamery.",
    framingDrift: "Widoczny rozmiar twarzy (odległość od kamery) różni się od poprzedniej sesji (poprzednio {prev}% → teraz {cur}%). Różnica liczbowa Przed/Po może częściowo wynikać z tej różnicy odległości.",
  },
};

// ---------- 部位（ROI）ラベル ----------

const REGIONS = {
  ja: {
    forehead: "額", glabella: "眉間", left_cheek: "左頬", right_cheek: "右頬",
    nose: "鼻", chin: "あご", left_under_eye: "左目下", right_under_eye: "右目下",
    left_nasolabial: "左ほうれい線", right_nasolabial: "右ほうれい線",
    left_crow_feet: "左目尻", right_crow_feet: "右目尻",
  },
  en: {
    forehead: "Forehead", glabella: "Glabella", left_cheek: "Left cheek", right_cheek: "Right cheek",
    nose: "Nose", chin: "Chin", left_under_eye: "Left under-eye", right_under_eye: "Right under-eye",
    left_nasolabial: "Left nasolabial fold", right_nasolabial: "Right nasolabial fold",
    left_crow_feet: "Left crow's feet", right_crow_feet: "Right crow's feet",
  },
  pl: {
    forehead: "Czoło", glabella: "Gładzizna", left_cheek: "Lewy policzek", right_cheek: "Prawy policzek",
    nose: "Nos", chin: "Podbródek", left_under_eye: "Lewa okolica pod okiem", right_under_eye: "Prawa okolica pod okiem",
    left_nasolabial: "Lewa bruzda nosowo-wargowa", right_nasolabial: "Prawa bruzda nosowo-wargowa",
    left_crow_feet: "Lewe kurze łapki", right_crow_feet: "Prawe kurze łapki",
  },
};

// ---------- レポート文言 ----------

const REPORT = {
  ja: {
    reportTitle: "肌測定レポート",
    subLine: "Be:true　顧客ID: {id}　測定日: {date}",
    overallHeading: "総合スコア　{score} / 100",
    overallMissing: "測定データが不足しているため、総合評価は算出できませんでした。",
    overallGreat: "全体的にとても良い状態です。今の習慣を維持していきましょう。",
    overallGood: "全体的に良好ですが、一部の項目でケアの余地があります。",
    overallAverage: "標準的な状態です。気になる項目から重点的にケアしていきましょう。",
    overallNeedsCare: "複数の項目でケアが必要な状態です。集中的なケアをおすすめします。",
    qualityHeading: "撮影時の注意点",
    diagnosisHeading: "顔写真での診断部位",
    diagnosisDesc: "お顔の各部位に測定項目の番号を表示しています。枠の色は良好(緑)・標準(青)・要ケア(赤)の目安です。番号は下表の「No.」列に対応しています。",
    scoreHeading: "項目別スコア",
    colNo: "No.", colItem: "項目", colScore: "スコア", colJudge: "判定", colContent: "内容",
    judgeUnmeasurable: "測定不可", judgeGood: "良好", judgeAverage: "標準", judgeNeedsCare: "要ケア",
    recoHeading: "おすすめ施術",
    colMenu: "施術メニュー", colFrequency: "目安の頻度", colHomecare: "ホームケア",
    noMenuSet: "（メニュー未設定）",
    changeHeading: "前回からの変化",
    noChangeAtAll: "前回測定時から大きな変化は見られませんでした（すべて誤差範囲内）。",
    improved: "改善しています",
    worsened: "やや悪化しています。重点ケアをおすすめします",
    footerNote: "※ 本レポートは画像処理による簡易的な肌測定であり、医療的診断ではありません。光の当たり方・撮影距離により数値は変動する場合があります。",
  },
  en: {
    reportTitle: "Skin Analysis Report",
    subLine: "Be:true　Customer ID: {id}　Date: {date}",
    overallHeading: "Overall score　{score} / 100",
    overallMissing: "Not enough measurement data was available to calculate an overall score.",
    overallGreat: "Your skin is in very good condition overall. Keep up your current routine.",
    overallGood: "Overall good condition, though a few areas could use some care.",
    overallAverage: "This is an average condition. Focus your care on the items you're concerned about.",
    overallNeedsCare: "Several areas need care. We recommend a focused care plan.",
    qualityHeading: "Notes about this photo",
    diagnosisHeading: "Diagnosis areas on your photo",
    diagnosisDesc: "Numbers are shown on each area of your face. Frame color indicates good (green), average (blue), or needs-care (red). Numbers correspond to the \"No.\" column in the table below.",
    scoreHeading: "Scores by item",
    colNo: "No.", colItem: "Item", colScore: "Score", colJudge: "Result", colContent: "Description",
    judgeUnmeasurable: "N/A", judgeGood: "Good", judgeAverage: "Average", judgeNeedsCare: "Needs care",
    recoHeading: "Recommended treatments",
    colMenu: "Treatment menu", colFrequency: "Suggested frequency", colHomecare: "Home care",
    noMenuSet: "(no menu set)",
    changeHeading: "Change since last time",
    noChangeAtAll: "No significant change since the last measurement (all within margin of error).",
    improved: "Improved",
    worsened: "Slightly worsened. We recommend focused care",
    footerNote: "※ This report is a simplified skin measurement based on image processing and is not a medical diagnosis. Values may vary depending on lighting and shooting distance.",
  },
  pl: {
    reportTitle: "Raport analizy skóry",
    subLine: "Be:true　ID klienta: {id}　Data: {date}",
    overallHeading: "Wynik ogólny　{score} / 100",
    overallMissing: "Zbyt mało danych pomiarowych, aby obliczyć wynik ogólny.",
    overallGreat: "Twoja skóra jest ogólnie w bardzo dobrym stanie. Utrzymuj obecną pielęgnację.",
    overallGood: "Ogólnie dobry stan, choć kilka obszarów wymaga pielęgnacji.",
    overallAverage: "Stan przeciętny. Skup pielęgnację na obszarach, które Cię niepokoją.",
    overallNeedsCare: "Kilka obszarów wymaga pielęgnacji. Zalecamy skoncentrowaną pielęgnację.",
    qualityHeading: "Uwagi dotyczące zdjęcia",
    diagnosisHeading: "Obszary diagnostyczne na zdjęciu",
    diagnosisDesc: "Na każdym obszarze twarzy widoczny jest numer pozycji pomiarowej. Kolor ramki oznacza: dobry (zielony), przeciętny (niebieski), wymaga pielęgnacji (czerwony). Numery odpowiadają kolumnie „Nr” w tabeli poniżej.",
    scoreHeading: "Wyniki wg pozycji",
    colNo: "Nr", colItem: "Pozycja", colScore: "Wynik", colJudge: "Ocena", colContent: "Opis",
    judgeUnmeasurable: "Brak danych", judgeGood: "Dobry", judgeAverage: "Przeciętny", judgeNeedsCare: "Wymaga pielęgnacji",
    recoHeading: "Zalecane zabiegi",
    colMenu: "Zabieg", colFrequency: "Zalecana częstotliwość", colHomecare: "Pielęgnacja domowa",
    noMenuSet: "(brak ustawionego zabiegu)",
    changeHeading: "Zmiana od poprzedniego pomiaru",
    noChangeAtAll: "Brak istotnej zmiany od ostatniego pomiaru (wszystko w granicach błędu).",
    improved: "Poprawa",
    worsened: "Lekkie pogorszenie. Zalecamy skoncentrowaną pielęgnację",
    footerNote: "※ Ten raport to uproszczony pomiar skóry oparty na przetwarzaniu obrazu i nie stanowi diagnozy medycznej. Wartości mogą się różnić w zależności od oświetlenia i odległości od kamery.",
  },
};

// ---------- 施術メニュー（撮影時に選択する「本日の施術」） ----------
// キーはGoogleスプレッドシート（肌診断履歴シート）にそのまま保存される正本値。
// 表示名だけを言語ごとに切り替える（カテゴリラベルと同じ設計）。

export const TREATMENT_KEYS = [
  "wodorowe",
  "peeling_chemiczny",
  "dermapen",
  "kobido",
  "mezoterapia",
  "mezoterapia_oczu",
  "other",
];

const TREATMENTS = {
  ja: {
    wodorowe: "水素洗浄（Wodorowe）",
    peeling_chemiczny: "ケミカルピーリング",
    dermapen: "ダーマペン",
    kobido: "小顔リフトマッサージ（Kobido）",
    mezoterapia: "メソセラピー",
    mezoterapia_oczu: "目元メソセラピー",
    other: "その他（自由入力）",
  },
  en: {
    wodorowe: "Hydrogen Cleansing (Wodorowe)",
    peeling_chemiczny: "Chemical Peeling",
    dermapen: "Dermapen",
    kobido: "Kobido Facial Massage",
    mezoterapia: "Mesotherapy",
    mezoterapia_oczu: "Eye Mesotherapy",
    other: "Other (free text)",
  },
  pl: {
    wodorowe: "Wodorowe oczyszczanie",
    peeling_chemiczny: "Peeling chemiczny",
    dermapen: "Dermapen",
    kobido: "Kobido",
    mezoterapia: "Mezoterapia",
    mezoterapia_oczu: "Mezoterapia oczu",
    other: "Inne (wpisz ręcznie)",
  },
};

/** 施術キー（wodorowe等）から現在言語の表示名を返す。未知のキーはそのまま返す。 */
export function treatmentLabel(key) {
  return (TREATMENTS[_lang] && TREATMENTS[_lang][key]) || TREATMENTS.ja[key] || key;
}

/** <select>の<option>群を組み立てるための { key, label } 配列（現在言語）。 */
export function treatmentOptions() {
  return TREATMENT_KEYS.map((key) => ({ key, label: treatmentLabel(key) }));
}

const NAMESPACES = { ui: UI, issues: ISSUES, regions: REGIONS, report: REPORT };

/** "ui.captureBtn" のようなドット区切りキーで文言を取得し、{name}プレースホルダをvarsで置換する。 */
export function t(key, vars) {
  const [ns, sub] = key.split(".");
  const table = NAMESPACES[ns];
  let str = (table && table[_lang] && table[_lang][sub]) ?? (table && table.ja && table.ja[sub]) ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replaceAll(`{${k}}`, v);
    }
  }
  return str;
}

/** 部位キー（forehead等）から現在言語の表示名を返す。未知のキーはそのまま返す。 */
export function regionLabel(key) {
  return REGIONS[_lang][key] || REGIONS.ja[key] || key;
}

/** 現在言語に対応する Date.toLocaleDateString 用ロケール文字列。 */
export function dateLocale() {
  return LOCALE_MAP[_lang] || "ja-JP";
}

// ---------- 静的DOMテキストの一括適用 ----------

/**
 * data-i18n="ui.xxx" を持つ要素のtextContentを、data-i18n-attr指定があれば
 * その属性値を、現在言語の文言に一括更新する。
 * 例: <button data-i18n="ui.captureBtn">📸 撮影する</button>
 *     <input data-i18n="ui.customerIdPlaceholder" data-i18n-attr="placeholder">
 */
export function applyDom(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const attr = el.getAttribute("data-i18n-attr");
    const text = t(key);
    if (attr) {
      el.setAttribute(attr, text);
    } else {
      el.textContent = text;
    }
  });
  document.documentElement.lang = _lang;
}

/** 画面上部の言語セレクター（ボタン群）をコンテナ要素内に描画し、クリックで切替できるようにする。 */
export function renderLanguageSwitcher(container) {
  if (!container) return;
  container.innerHTML = "";
  for (const lang of LANGS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = LANG_LABELS[lang];
    btn.dataset.lang = lang;
    btn.className = "lang-btn" + (lang === _lang ? " active" : "");
    btn.addEventListener("click", () => {
      setLang(lang);
      container.querySelectorAll(".lang-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.lang === lang);
      });
    });
    container.appendChild(btn);
  }
}
