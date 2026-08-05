/**
 * 生の測定値 → 0-100点スコアへの変換、および施術レコメンド。
 * Python版 scoring.py の1:1移植（データ・ロジックとも変更なし）。
 */
import * as history from "./history.js";

// category_key -> 設定
// type:
//   "avg"  … regionsの対象metricを平均（デフォルト）
//   "diff" … base_regionsの平均 - target_regionsの平均（例: クマ = 頬の明るさ - 目の下の明るさ）
export const CATEGORY_CONFIG = {
  pore_cheek: {
    label: "毛穴の目立ち（頬）",
    regions: ["left_cheek", "right_cheek"],
    metric: "texture",
    lower_is_better: true,
    fallback_range: [5.0, 200.0],
  },
  pore_nose: {
    label: "毛穴の目立ち（鼻）",
    regions: ["nose"],
    metric: "texture",
    lower_is_better: true,
    fallback_range: [5.0, 250.0],
  },
  blackhead_nose: {
    label: "毛穴の黒ずみ（鼻）",
    regions: ["nose"],
    metric: "blackheads_area_ratio",
    lower_is_better: true,
    fallback_range: [0.0, 0.015],
  },
  blackhead_cheek: {
    label: "毛穴の黒ずみ（頬）",
    regions: ["left_cheek", "right_cheek"],
    metric: "blackheads_area_ratio",
    lower_is_better: true,
    fallback_range: [0.0, 0.008],
  },
  texture_uniformity: {
    label: "キメの均一性",
    regions: ["forehead", "left_cheek", "right_cheek"],
    metric: "texture_uniformity",
    lower_is_better: true,
    fallback_range: [5.0, 80.0],
  },
  spots: {
    label: "シミ・色素沈着",
    regions: ["forehead", "left_cheek", "right_cheek", "nose", "chin"],
    metric: "spots_area_ratio",
    lower_is_better: true,
    fallback_range: [0.0, 0.06],
  },
  dullness: {
    label: "色ムラ・くすみ",
    regions: ["forehead", "left_cheek", "right_cheek", "nose", "chin"],
    metric: "color_evenness",
    lower_is_better: true,
    fallback_range: [2.0, 22.0],
  },
  redness_cheek: {
    label: "赤み（頬）",
    regions: ["left_cheek", "right_cheek"],
    metric: "redness",
    lower_is_better: true,
    fallback_range: [0.0, 18.0],
  },
  redness_tzone: {
    label: "赤み（Tゾーン）",
    regions: ["forehead", "nose", "glabella"],
    metric: "redness",
    lower_is_better: true,
    fallback_range: [0.0, 16.0],
  },
  acne: {
    label: "ニキビ・炎症性トラブル",
    regions: ["forehead", "left_cheek", "right_cheek", "nose", "chin"],
    metric: "acne_area_ratio",
    lower_is_better: true,
    fallback_range: [0.0, 0.03],
  },
  wrinkle_forehead: {
    label: "おでこのシワ",
    regions: ["forehead"],
    metric: "wrinkle_density",
    lower_is_better: true,
    fallback_range: [0.01, 0.15],
  },
  wrinkle_glabella: {
    label: "眉間のシワ",
    regions: ["glabella"],
    metric: "wrinkle_density",
    lower_is_better: true,
    fallback_range: [0.005, 0.12],
  },
  wrinkle_crowfeet: {
    label: "目尻のシワ",
    regions: ["left_crow_feet", "right_crow_feet"],
    metric: "wrinkle_density",
    lower_is_better: true,
    fallback_range: [0.01, 0.15],
  },
  wrinkle_nasolabial: {
    label: "ほうれい線",
    regions: ["left_nasolabial", "right_nasolabial"],
    metric: "wrinkle_density",
    lower_is_better: true,
    fallback_range: [0.01, 0.18],
  },
  dark_circle: {
    label: "目の下のクマ",
    type: "diff",
    base_regions: ["left_cheek", "right_cheek"],
    target_regions: ["left_under_eye", "right_under_eye"],
    metric: "brightness",
    lower_is_better: true,
    fallback_range: [0.0, 15.0],
  },
  brightness: {
    label: "明るさ・透明感",
    regions: ["forehead", "left_cheek", "right_cheek", "nose", "chin"],
    metric: "brightness",
    lower_is_better: false,
    fallback_range: [40.0, 70.0],
  },
  shine: {
    label: "テカリ・皮脂バランス",
    regions: ["forehead", "nose", "chin"],
    metric: "shine",
    lower_is_better: true,
    fallback_range: [0.0, 0.15],
  },
};

export const MIN_HISTORY_FOR_PERCENTILE = 5;
export const FULL_CONFIDENCE_HISTORY = 20;

// おすすめ施術メニュー（サロンの実際のメニュー名に合わせて要調整）
export const TREATMENT_MENU = {
  pore_cheek: ["毛穴洗浄コース", "ダーマペン", "ハイドラフェイシャル"],
  pore_nose: ["鼻用毛穴パック", "毛穴洗浄コース", "ダーマペン"],
  blackhead_nose: ["毛穴洗浄コース", "ダーマペン", "ハイドラフェイシャル"],
  blackhead_cheek: ["毛穴洗浄コース", "ダーマペン", "ハイドラフェイシャル"],
  texture_uniformity: ["ピーリング", "ビタミンC導入コース"],
  spots: ["美白イオン導入", "ダーマペン", "ピーリング＋美白パック"],
  dullness: ["ハイドラフェイシャル", "ビタミンC導入コース"],
  redness_cheek: ["鎮静パック（カーミングケア）", "赤み専用イオン導入"],
  redness_tzone: ["鎮静パック（カーミングケア）", "皮脂コントロールケア"],
  acne: ["ニキビケアコース", "サリチル酸ピーリング"],
  wrinkle_forehead: ["メゾセラピー（mezoterapy）", "EMS/RFリフトケア", "コラーゲン導入コース"],
  wrinkle_glabella: ["メゾセラピー（mezoterapy）", "EMS/RFリフトケア", "コラーゲン導入コース"],
  wrinkle_crowfeet: ["メゾセラピー（mezoterapy）", "アイケア美容鍼", "コラーゲン導入コース"],
  wrinkle_nasolabial: ["メゾセラピー（mezoterapy）", "リフトアップフェイシャル", "EMS/RFリフトケア"],
  dark_circle: ["メゾセラピー（mezoterapy）", "アイケア美容鍼", "血行促進マッサージ"],
  brightness: ["ハイドラフェイシャル", "ビタミンC導入コース"],
  shine: ["皮脂コントロールケア", "クレイパック"],
};

// おすすめ施術の目安回数（業界一般のテンプレート。サロン独自の実績値に置き換え可）
export const TREATMENT_FREQUENCY = {
  pore_cheek: "毛穴洗浄コース: 2〜4週間に1回目安／ダーマペン: 3〜4週間に1回目安",
  pore_nose: "毛穴洗浄コース: 2〜4週間に1回目安／ダーマペン: 3〜4週間に1回目安",
  blackhead_nose: "毛穴洗浄コース: 2〜4週間に1回目安／ダーマペン: 3〜4週間に1回目安",
  blackhead_cheek: "毛穴洗浄コース: 2〜4週間に1回目安／ダーマペン: 3〜4週間に1回目安",
  texture_uniformity: "2〜4週間に1回×4~6回コース目安",
  spots: "美白イオン導入: 2〜4週間に1回×6~10回コース目安（美白ケアは継続が鍵）／ダーマペン: 3〜4週間に1回目安",
  dullness: "2〜4週間に1回×4~6回コース目安",
  redness_cheek: "2〜4週間に1回×4~6回コース目安（鎮静ケア中心）",
  redness_tzone: "2〜4週間に1回×4~6回コース目安",
  acne: "2〜4週間に1回×4~6回コース目安（炎症が強い場合は皮膚科と併用を推奨）",
  wrinkle_forehead: "メゾセラピー（mezoterapy）: 3〜4週間に1回×計4回以上を目安",
  wrinkle_glabella: "メゾセラピー（mezoterapy）: 3〜4週間に1回×計4回以上を目安",
  wrinkle_crowfeet: "メゾセラピー（mezoterapy）: 3〜4週間に1回×計4回以上を目安",
  wrinkle_nasolabial: "メゾセラピー（mezoterapy）: 3〜4週間に1回×計4回以上を目安",
  dark_circle: "メゾセラピー（mezoterapy）: 3〜4週間に1回×計4回以上を目安",
  brightness: "2〜4週間に1回×4~6回コース目安",
  shine: "2〜4週間に1回×4~6回コース目安（皮脂コントロール）",
};

// 前回計測から悪化した項目について、原因を振り返るための確認質問（お客様への問いかけ用）
export const CATEGORY_CHECK_QUESTIONS = {
  pore_cheek: ["最近、メイクや皮脂の落とし残しはありませんか？", "保湿は十分にできていますか？"],
  pore_nose: ["鼻まわりの皮脂・毛穴ケアは継続できていますか？"],
  blackhead_nose: ["毛穴パックを使いすぎたり、洗顔で強くこすったりしていませんか？"],
  blackhead_cheek: ["洗顔時にゴシゴシこすっていませんか？"],
  texture_uniformity: ["睡眠不足や乾燥が続いていませんか？"],
  spots: ["紫外線対策（日焼け止め）はできていますか？"],
  dullness: ["睡眠不足や乾燥が続いていませんか？"],
  redness_cheek: ["洗顔は大丈夫ですか？（こすりすぎ・熱いお湯に注意）", "新しい化粧品で刺激を感じていませんか？"],
  redness_tzone: ["洗顔時にこすりすぎていませんか？"],
  acne: ["洗顔は大丈夫ですか？", "睡眠不足や食生活の乱れ、枕カバーの清潔さに変化はありませんか？"],
  wrinkle_forehead: ["紫外線対策・保湿は継続できていますか？", "おでこにシワが寄る表情のクセはありませんか？"],
  wrinkle_glabella: ["眉間に力が入る表情のクセはありませんか？", "保湿はできていますか？"],
  wrinkle_crowfeet: ["紫外線対策・保湿は継続できていますか？"],
  wrinkle_nasolabial: ["急激な体重変化や乾燥はありませんでしたか？"],
  dark_circle: ["睡眠不足やスマホ・PCによる目の疲れが続いていませんか？"],
  brightness: ["紫外線対策・保湿は継続できていますか？"],
  shine: ["洗顔・保湿のバランスは崩れていませんか？（皮脂の落としすぎ・乾燥どちらも原因になります）"],
};

// ホームケアの一般的なアドバイス（成分・商品名は指定せず、生活習慣ベースの内容に限定）
export const TREATMENT_HOMECARE = {
  pore_cheek: "熱すぎないぬるま湯洗顔で毛穴を開き、洗顔後は収れん化粧水でキュッと引き締める習慣を。",
  pore_nose: "皮脂が溜まりやすいTゾーンは、週1~2回の毛穴パックや酵素洗顔を取り入れると◎。",
  blackhead_nose: "毛穴の黒ずみは摩擦NG。オイルクレンジングで優しく毛穴汚れをオフする習慣を。",
  blackhead_cheek: "強くこすらず、週1~2回の酵素洗顔で優しくオフを。摩擦は色素沈着の原因にも。",
  texture_uniformity: "週1回のピーリングケアと、朝晩の保湿でキメを整える習慣を。",
  spots: "日中は日焼け止めを必ず塗布し、紫外線対策を徹底することが第一。",
  dullness: "十分な保湿と睡眠、ビタミンC系スキンケアの継続使用がくすみ改善の近道。",
  redness_cheek: "低刺激処方のスキンケアに切り替え、こすらないケアを徹底。",
  redness_tzone: "皮脂と乾燥のバランスが崩れやすいので、保湿重視のスキンケアに切り替えを。",
  acne: "枕カバーやスマホ画面など肌に触れるものを清潔に保ち、油分の多いスキンケアは控えめに。",
  wrinkle_forehead: "表情筋のこわばりをほぐすマッサージと、朝晩の保湿ケアを習慣に。",
  wrinkle_glabella: "眉間に力が入りやすい方は意識的にリラックスを。保湿クリームでのケアも継続を。",
  wrinkle_crowfeet: "目元は皮膚が薄くデリケートなので、専用のアイクリームで優しく保湿を。",
  wrinkle_nasolabial: "表情筋トレーニングと保湿、姿勢改善（猫背はほうれい線を目立たせる）も意識を。",
  dark_circle: "睡眠不足・血行不良が主な原因。十分な睡眠と、蒸しタオルでの目元温めを習慣に。",
  brightness: "十分な保湿とターンオーバーを整える生活習慣（睡眠・栄養）を意識。",
  shine: "皮脂を取りすぎない優しい洗顔と、油分控えめの保湿でバランスケアを。",
};

// お客様向け・専門用語を使わない一言説明
export const CUSTOMER_FRIENDLY_DESC = {
  pore_cheek: "頬まわりの毛穴の開き・目立ちやすさ",
  pore_nose: "小鼻まわりの毛穴の開き・目立ちやすさ",
  blackhead_nose: "鼻の毛穴の黒ずみ（角栓・皮脂汚れ）",
  blackhead_cheek: "頬の毛穴の黒ずみ",
  texture_uniformity: "肌のキメの整い方・なめらかさ",
  spots: "シミ・色素沈着の目立ち方",
  dullness: "肌全体の色ムラ・くすみ",
  redness_cheek: "頬の赤みの強さ",
  redness_tzone: "額・鼻まわり（Tゾーン）の赤みの強さ",
  acne: "ニキビ・炎症性トラブルの状態",
  wrinkle_forehead: "おでこのシワの目立ち方",
  wrinkle_glabella: "眉間のシワの目立ち方",
  wrinkle_crowfeet: "目尻のシワ（笑いジワ）の目立ち方",
  wrinkle_nasolabial: "ほうれい線の目立ち方",
  dark_circle: "目の下のクマの目立ち方",
  brightness: "肌の明るさ・透明感",
  shine: "肌のテカリ・皮脂バランス",
};

// カテゴリごとの測定方法の説明テンプレート（{value}に実測値を差し込む）
export const RATIONALE_TEMPLATES = {
  pore_cheek: "頬のROI画像の局所的な凹凸量（Laplacian分散）を測定。実測値{value}（相対値。値が大きいほど毛穴・凹凸が目立つ）。",
  pore_nose: "鼻のROI画像の局所的な凹凸量（Laplacian分散）を測定。実測値{value}（相対値。値が大きいほど毛穴・凹凸が目立つ）。",
  blackhead_nose: "鼻のROIから周囲より暗い小領域（黒ずみ毛穴相当）を検出し、面積比率を算出。実測値{value}（値が大きいほど黒ずみが目立つ）。",
  blackhead_cheek: "頬のROIから周囲より暗い小領域（黒ずみ毛穴相当）を検出し、面積比率を算出。実測値{value}（値が大きいほど黒ずみが目立つ）。",
  texture_uniformity: "額・頬のROIを20×20ブロックに分割し、ブロックごとのテクスチャ量のばらつきを算出。実測値{value}（値が大きいほど部分的にキメが粗い箇所がある）。",
  spots: "額・頬・鼻・あごのROIから周囲より暗く比較的大きめの色素沈着ブロブを検出し、面積比率を算出。実測値{value}（値が大きいほどシミが目立つ）。",
  dullness: "LAB色空間の明度(L)の標準偏差を算出し、肌表面の色ムラの度合いを測定。実測値{value}（値が大きいほどムラが大きい）。",
  redness_cheek: "頬のLAB色空間a*値（緑〜赤軸）の平均を算出。実測値{value}（値が大きいほど赤みが強い）。",
  redness_tzone: "Tゾーン（額・鼻・眉間）のLAB色空間a*値の平均を算出。実測値{value}（値が大きいほど赤みが強い）。",
  acne: "LAB色空間のa*値が周囲より高い小領域（炎症を伴う部位）を検出し、面積比率を算出。実測値{value}（値が大きいほど炎症性トラブルが目立つ）。",
  wrinkle_forehead: "額のROIで、写真の明るさに応じて自動調整したエッジ検出により線状のエッジ密度を算出。実測値{value}（値が大きいほどシワ・線が多い）。",
  wrinkle_glabella: "眉間のROIで同様にエッジ密度を算出。実測値{value}（値が大きいほどシワ・線が多い）。",
  wrinkle_crowfeet: "目尻のROIで同様にエッジ密度を算出。実測値{value}（値が大きいほどシワ・線が多い）。",
  wrinkle_nasolabial: "ほうれい線周辺のROIで同様にエッジ密度を算出。実測値{value}（値が大きいほどシワ・線が多い）。",
  dark_circle: "頬の明るさ(L)と目の下の明るさ(L)の差を算出。実測値{value}（値が大きいほど目の下が暗く、クマが目立つ）。",
  brightness: "LAB色空間の明度(L)平均を0-100スケールで算出。実測値{value}（値が大きいほど明るく透明感がある）。",
  shine: "HSV色空間で高輝度・低彩度のハイライト画素（テカリ・反射光）の比率を算出。実測値{value}（値が大きいほどテカリが強い）。",
};

const _PERCENT_CATEGORIES = new Set([
  "blackhead_nose", "blackhead_cheek", "spots", "acne", "shine",
  "wrinkle_forehead", "wrinkle_glabella", "wrinkle_crowfeet", "wrinkle_nasolabial",
]);
const _SIGNED_CATEGORIES = new Set(["redness_cheek", "redness_tzone", "dark_circle"]);

function _formatRaw(catKey, rawValue) {
  if (_PERCENT_CATEGORIES.has(catKey)) return `${(rawValue * 100).toFixed(2)}%`;
  if (_SIGNED_CATEGORIES.has(catKey)) return `${rawValue >= 0 ? "+" : ""}${rawValue.toFixed(1)}`;
  return rawValue.toFixed(1);
}

/** カテゴリのスコアの算出根拠（何をどう測定したか）を1文で説明する。 */
export function explainCategory(catKey, rawValue) {
  if (rawValue === null || rawValue === undefined) return "この写真では測定できませんでした。";
  const template = RATIONALE_TEMPLATES[catKey];
  if (!template) return `実測値${_formatRaw(catKey, rawValue)}。`;
  return template.replace("{value}", _formatRaw(catKey, rawValue));
}

function _extractFlatValue(regionMetrics, region, metricKey) {
  const m = regionMetrics[region];
  if (!m) return null;
  if (metricKey === "spots_area_ratio") return m.spots ? m.spots.area_ratio : null;
  if (metricKey === "blackheads_area_ratio") return m.blackheads ? m.blackheads.area_ratio : null;
  if (metricKey === "acne_area_ratio") return m.acne ? m.acne.area_ratio : null;
  const v = m[metricKey];
  return v === undefined ? null : v;
}

function mean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * region_metrics（部位別・生の測定値）から、カテゴリごとの生値を算出。
 */
export function aggregateCategoryRaw(regionMetrics) {
  const raw = {};
  for (const [catKey, cfg] of Object.entries(CATEGORY_CONFIG)) {
    const catType = cfg.type || "avg";
    if (catType === "avg") {
      const values = cfg.regions
        .map((r) => _extractFlatValue(regionMetrics, r, cfg.metric))
        .filter((v) => v !== null);
      raw[catKey] = values.length ? mean(values) : null;
    } else if (catType === "diff") {
      const baseVals = cfg.base_regions
        .map((r) => _extractFlatValue(regionMetrics, r, cfg.metric))
        .filter((v) => v !== null);
      const targetVals = cfg.target_regions
        .map((r) => _extractFlatValue(regionMetrics, r, cfg.metric))
        .filter((v) => v !== null);
      raw[catKey] = baseVals.length && targetVals.length ? mean(baseVals) - mean(targetVals) : null;
    }
  }
  return raw;
}

/**
 * 順位ベースのパーセンタイルスコア。+0.5のラプラス平滑化により、
 * 少数データで0%/100%に張り付くのを防ぐ。
 */
function _percentileScore(rawValue, historical, lowerIsBetter) {
  const n = historical.length;
  let betterOrEqual = 0;
  for (const h of historical) {
    if (lowerIsBetter ? h >= rawValue : h <= rawValue) betterOrEqual += 1;
  }
  const score = ((betterOrEqual + 0.5) / (n + 1.0)) * 100.0;
  return Math.min(100, Math.max(0, score));
}

/**
 * 暫定レンジ方式のスコア化。シグモイド曲線でレンジ境界=約12点/88点、極端な外れ値のみ0点/100点に漸近。
 */
function _sigmoidScore(rawValue, valueRange, lowerIsBetter) {
  const [lo, hi] = valueRange;
  const span = hi - lo;
  if (span <= 0) return 50.0;
  const center = (lo + hi) / 2.0;
  const scale = span / 4.0;
  let z = (rawValue - center) / scale;
  if (lowerIsBetter) z = -z;
  return 100.0 / (1.0 + Math.exp(-z));
}

/**
 * カテゴリごとのスコア(0-100)と、算出方式（相対/暫定/ブレンド）を返す。
 * customerId を除外して過去データを集計する（IndexedDBアクセスのためasync）。
 */
export async function scoreCategories(categoryRaw, customerId = null) {
  const scores = {};
  for (const [catKey, rawValue] of Object.entries(categoryRaw)) {
    const cfg = CATEGORY_CONFIG[catKey];
    if (rawValue === null || rawValue === undefined) {
      scores[catKey] = { score: null, method: "no_data", raw: null };
      continue;
    }
    const historical = await history.collectHistoricalRawValues(catKey, customerId);
    const n = historical.length;
    const sigmoidScore = _sigmoidScore(rawValue, cfg.fallback_range, cfg.lower_is_better);
    let score, method;
    if (n < MIN_HISTORY_FOR_PERCENTILE) {
      score = sigmoidScore;
      method = "provisional_fixed_range";
    } else {
      const percentileScore = _percentileScore(rawValue, historical, cfg.lower_is_better);
      const weight = Math.min(n / FULL_CONFIDENCE_HISTORY, 1.0);
      score = weight * percentileScore + (1 - weight) * sigmoidScore;
      method = n >= FULL_CONFIDENCE_HISTORY ? "percentile" : "blended";
    }
    scores[catKey] = { score: Math.round(score * 10) / 10, method, raw: rawValue };
  }
  return scores;
}

export function overallScore(categoryScores, weights = null) {
  const w = weights || Object.fromEntries(Object.keys(categoryScores).map((k) => [k, 1.0]));
  let totalW = 0.0;
  let total = 0.0;
  for (const [catKey, info] of Object.entries(categoryScores)) {
    if (info.score === null || info.score === undefined) continue;
    const weight = w[catKey] !== undefined ? w[catKey] : 1.0;
    total += info.score * weight;
    totalW += weight;
  }
  if (totalW === 0) return null;
  return Math.round((total / totalW) * 10) / 10;
}

/** スコアがthreshold未満のカテゴリに対して、根拠・施術メニュー・目安回数・ホームケアを返す。 */
export function recommendTreatments(categoryScores, threshold = 60.0) {
  const recs = {};
  for (const [catKey, info] of Object.entries(categoryScores)) {
    if (info.score !== null && info.score !== undefined && info.score < threshold) {
      recs[catKey] = {
        label: CATEGORY_CONFIG[catKey].label,
        score: info.score,
        rationale: explainCategory(catKey, info.raw),
        suggested_menu: TREATMENT_MENU[catKey] || [],
        frequency: TREATMENT_FREQUENCY[catKey] || "",
        homecare: TREATMENT_HOMECARE[catKey] || "",
      };
    }
  }
  return recs;
}

// Before/After比較でのノイズ許容幅（無施術での撮影ばらつきをもとにした暫定値）
export const NOISE_THRESHOLD = {
  pore_cheek: 1.0,
  pore_nose: 1.2,
  blackhead_nose: 0.003,
  blackhead_cheek: 0.003,
  texture_uniformity: 3.0,
  spots: 0.01,
  dullness: 2.0,
  redness_cheek: 1.0,
  redness_tzone: 1.0,
  acne: 0.005,
  wrinkle_forehead: 0.01,
  wrinkle_glabella: 0.008,
  wrinkle_crowfeet: 0.01,
  wrinkle_nasolabial: 0.01,
  dark_circle: 3.0,
  brightness: 2.0,
  shine: 0.005,
};

/** 同一顧客の2時点の生測定値を比較。 */
export function compareBeforeAfter(beforeRaw, afterRaw) {
  const diffs = {};
  for (const [catKey, cfg] of Object.entries(CATEGORY_CONFIG)) {
    const b = beforeRaw[catKey];
    const a = afterRaw[catKey];
    if (b === null || b === undefined || a === null || a === undefined) {
      diffs[catKey] = null;
      continue;
    }

    const isPercent = _PERCENT_CATEGORIES.has(catKey);
    let diff, unit;
    if (isPercent) {
      diff = (a - b) * 100.0;
      unit = "pt";
    } else {
      diff = a - b;
      unit = "";
    }

    const threshold = NOISE_THRESHOLD[catKey] || 0.0;
    const significant = Math.abs(diff) > threshold;
    let status, improved;
    if (!significant) {
      status = "no_change";
      improved = null;
    } else if (cfg.lower_is_better) {
      improved = diff < 0;
      status = improved ? "improved" : "worsened";
    } else {
      improved = diff > 0;
      status = improved ? "improved" : "worsened";
    }

    diffs[catKey] = {
      label: cfg.label,
      before: b,
      after: a,
      diff: Math.round(diff * 100) / 100,
      unit,
      improved,
      status,
    };
  }
  return diffs;
}
