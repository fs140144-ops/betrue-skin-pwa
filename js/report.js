/**
 * 測定結果のレポート出力（部位オーバーレイ画像＋テキストサマリー＋お客様向けHTMLレポート）。
 * Python版 report.py の役割を移植。PDF(ReportLab)の代わりに、ブラウザの印刷機能
 * （印刷 → PDFとして保存）で同等の出力を得られるHTML版レポートを生成する。
 */
import { CATEGORY_CONFIG, CUSTOMER_FRIENDLY_DESC, CATEGORY_CHECK_QUESTIONS } from "./scoring.js";

export const REGION_LABELS_JA = {
  forehead: "額",
  glabella: "眉間",
  left_cheek: "左頬",
  right_cheek: "右頬",
  nose: "鼻",
  chin: "あご",
  left_under_eye: "左目下",
  right_under_eye: "右目下",
  left_nasolabial: "左ほうれい線",
  right_nasolabial: "右ほうれい線",
  left_crow_feet: "左目尻",
  right_crow_feet: "右目尻",
};

const BOX_COLOR = "rgb(60,200,60)";

function _categoryRegions(cfg) {
  if (cfg.type === "diff") {
    return [...(cfg.base_regions || []), ...(cfg.target_regions || [])];
  }
  return cfg.regions || [];
}

function _wrapNumbers(numbers, perLine = 5) {
  const lines = [];
  for (let i = 0; i < numbers.length; i += perLine) {
    lines.push(numbers.slice(i, i + perLine).join(","));
  }
  return lines;
}

function _scoreColor(score) {
  if (score === null || score === undefined) return "rgb(150,150,150)";
  if (score >= 75) return "rgb(60,200,60)";
  if (score >= 50) return "rgb(0,200,230)";
  return "rgb(60,60,220)";
}

/** 部位の枠線＋ラベルを描画したcanvas（元画像のコピー）を返す。デバッグ・確認用。 */
export function drawRegionsOverlay(srcCanvas, regions) {
  const canvas = document.createElement("canvas");
  canvas.width = srcCanvas.width;
  canvas.height = srcCanvas.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(srcCanvas, 0, 0);
  ctx.strokeStyle = BOX_COLOR;
  ctx.fillStyle = BOX_COLOR;
  ctx.lineWidth = 2;
  ctx.font = "14px sans-serif";
  for (const [name, [x1, y1, x2, y2]] of Object.entries(regions)) {
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    const label = REGION_LABELS_JA[name] || name;
    ctx.fillText(label, x1, Math.max(10, y1 - 6));
  }
  return canvas;
}

/**
 * 顔写真の各部位に、対応するカテゴリ番号（項目別スコア表のNo.と一致）を書き込んだ
 * 診断用オーバーレイ画像(canvas)を作る。枠の色は対応カテゴリの平均スコアで3色に色分け。
 */
export function drawDiagnosisOverlay(srcCanvas, regions, categoryScores) {
  const canvas = document.createElement("canvas");
  canvas.width = srcCanvas.width;
  canvas.height = srcCanvas.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(srcCanvas, 0, 0);

  const regionHits = {};
  for (const name of Object.keys(regions)) regionHits[name] = [];

  let idx = 1;
  for (const [catKey, info] of Object.entries(categoryScores)) {
    const cfg = CATEGORY_CONFIG[catKey];
    if (cfg) {
      for (const r of _categoryRegions(cfg)) {
        if (regionHits[r]) regionHits[r].push([idx, info.score]);
      }
    }
    idx += 1;
  }

  ctx.lineWidth = 2;
  for (const [name, [x1, y1, x2, y2]] of Object.entries(regions)) {
    const hits = regionHits[name] || [];
    if (!hits.length) continue;
    const validScores = hits.map(([, s]) => s).filter((s) => s !== null && s !== undefined);
    const avgScore = validScores.length
      ? validScores.reduce((a, b) => a + b, 0) / validScores.length
      : null;
    const color = _scoreColor(avgScore);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

    const label = REGION_LABELS_JA[name] || name;
    ctx.font = "13px sans-serif";
    ctx.fillText(label, x1, Math.max(10, y1 - 6));

    const numbers = hits.map(([n]) => n);
    ctx.font = "11px sans-serif";
    _wrapNumbers(numbers, 5).forEach((line, lineI) => {
      const ty = y1 + 14 + lineI * 14;
      ctx.fillText(line, x1 + 2, ty);
    });
  }
  return canvas;
}

function _scoreJudgement(score) {
  if (score === null || score === undefined) return ["測定不可", "#888888"];
  if (score >= 75) return ["良好", "#2fa62f"];
  if (score >= 50) return ["標準", "#0090a6"];
  return ["要ケア", "#c23b3b"];
}

function _overallComment(overall) {
  if (overall === null || overall === undefined) {
    return "測定データが不足しているため、総合評価は算出できませんでした。";
  }
  if (overall >= 80) return "全体的にとても良い状態です。今の習慣を維持していきましょう。";
  if (overall >= 65) return "全体的に良好ですが、一部の項目でケアの余地があります。";
  if (overall >= 50) return "標準的な状態です。気になる項目から重点的にケアしていきましょう。";
  return "複数の項目でケアが必要な状態です。集中的なケアをおすすめします。";
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/** テキスト版サマリー（画面下部・ログ表示用）。 */
export function buildTextSummary(customerId, categoryScores, overall, recommendations, methodNote, beforeAfter, quality) {
  const lines = [
    `■ 肌測定レポート（顧客: ${customerId}）`,
    `総合スコア: ${overall !== null && overall !== undefined ? overall : "--"} / 100`,
    "",
  ];

  if (quality && quality.issues && quality.issues.length) {
    lines.push("【撮影品質に関する注意】");
    for (const issue of quality.issues) lines.push(`  ⚠ ${issue}`);
    lines.push("");
  }

  lines.push("【カテゴリ別スコア】（実測値に基づく根拠つき）");
  let i = 1;
  for (const [catKey, info] of Object.entries(categoryScores)) {
    const label = CATEGORY_CONFIG[catKey].label;
    const score = info.score;
    lines.push(`  - ${label}: ${score !== null && score !== undefined ? score : "--"} 点`);
    i += 1;
  }
  lines.push("");
  lines.push(`※ ${methodNote}`);

  if (recommendations && Object.keys(recommendations).length) {
    lines.push("");
    lines.push("【おすすめ施術（スコアが低い項目）】");
    for (const info of Object.values(recommendations)) {
      const menu = info.suggested_menu.length ? info.suggested_menu.join("、") : "（メニュー未設定）";
      lines.push(`  - ${info.label}（${info.score}点）`);
      lines.push(`      施術: ${menu}`);
      if (info.frequency) lines.push(`      目安回数: ${info.frequency}`);
      if (info.homecare) lines.push(`      ホームケア: ${info.homecare}`);
    }
  }

  if (beforeAfter) {
    lines.push("");
    lines.push("【前回からの変化】");
    for (const [catKey, d] of Object.entries(beforeAfter)) {
      if (!d) continue;
      if (d.status === "no_change") {
        lines.push(`  - ${d.label}: 誤差範囲内（変化なし）`);
      } else {
        const arrow = d.improved ? "改善" : "要注意";
        const sign = d.diff >= 0 ? "+" : "";
        lines.push(`  - ${d.label}: ${sign}${d.diff.toFixed(2)}${d.unit}（${arrow}）`);
        if (!d.improved) {
          for (const q of CATEGORY_CHECK_QUESTIONS[catKey] || []) {
            lines.push(`      ▶ ${q}`);
          }
        }
      }
    }
  }

  return lines.join("\n");
}

/**
 * お客様に見せる形式のHTMLレポートを生成する（専門用語を避けた平易な表現）。
 * ブラウザの「印刷 → PDFとして保存」でPDF化できる、印刷向けCSSを内包した完結HTML断片。
 */
export function buildHtmlReport({
  customerId, categoryScores, overall, recommendations, methodNote,
  scoreCardDataUrl, diagnosisDataUrl, beforeAfter, quality,
}) {
  const dateStr = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });

  let html = `<div class="report">`;
  html += `<h1>肌測定レポート</h1>`;
  html += `<p class="sub">Be:true　顧客ID: ${esc(customerId)}　測定日: ${dateStr}</p>`;

  const overallTxt = overall !== null && overall !== undefined ? overall.toFixed(1) : "--";
  html += `<h2>総合スコア　${overallTxt} / 100</h2>`;
  html += `<p>${esc(_overallComment(overall))}</p>`;

  if (quality && quality.issues && quality.issues.length) {
    html += `<h2>撮影時の注意点</h2>`;
    for (const issue of quality.issues) {
      html += `<p class="warn">・${esc(issue)}</p>`;
    }
  }

  if (diagnosisDataUrl) {
    html += `<h2>顔写真での診断部位</h2>`;
    html += `<p>お顔の各部位に測定項目の番号を表示しています。枠の色は良好(緑)・標準(青)・要ケア(赤)の目安です。番号は下表の「No.」列に対応しています。</p>`;
    html += `<img class="diagnosis-img" src="${diagnosisDataUrl}" alt="診断部位画像" />`;
  }

  html += `<h2>項目別スコア</h2>`;
  html += `<table class="score-table"><thead><tr><th>No.</th><th>項目</th><th>スコア</th><th>判定</th><th>内容</th></tr></thead><tbody>`;
  let i = 1;
  for (const [catKey, info] of Object.entries(categoryScores)) {
    const label = CATEGORY_CONFIG[catKey].label;
    const score = info.score;
    const [judge, judgeColor] = _scoreJudgement(score);
    const desc = CUSTOMER_FRIENDLY_DESC[catKey] || "";
    html += `<tr>`;
    html += `<td>${i}</td>`;
    html += `<td>${esc(label)}</td>`;
    html += `<td>${score !== null && score !== undefined ? score.toFixed(0) : "--"}</td>`;
    html += `<td><span style="color:${judgeColor}">${judge}</span></td>`;
    html += `<td>${esc(desc)}</td>`;
    html += `</tr>`;
    i += 1;
  }
  html += `</tbody></table>`;
  html += `<p class="small">※ ${esc(methodNote)}</p>`;

  if (recommendations && Object.keys(recommendations).length) {
    html += `<h2>おすすめ施術</h2>`;
    html += `<table class="reco-table"><thead><tr><th>項目</th><th>施術メニュー</th><th>目安の頻度</th><th>ホームケア</th></tr></thead><tbody>`;
    for (const info of Object.values(recommendations)) {
      const menu = info.suggested_menu.length ? info.suggested_menu.join("、") : "（メニュー未設定）";
      html += `<tr>`;
      html += `<td>${esc(info.label)}（${info.score.toFixed(0)}点）</td>`;
      html += `<td>${esc(menu)}</td>`;
      html += `<td>${esc(info.frequency || "")}</td>`;
      html += `<td>${esc(info.homecare || "")}</td>`;
      html += `</tr>`;
    }
    html += `</tbody></table>`;
  }

  if (beforeAfter) {
    const changed = Object.entries(beforeAfter).filter(([, d]) => d && d.status !== "no_change");
    html += `<h2>前回からの変化</h2>`;
    if (!changed.length) {
      html += `<p>前回測定時から大きな変化は見られませんでした（すべて誤差範囲内）。</p>`;
    } else {
      for (const [catKey, d] of changed) {
        const arrow = d.improved ? "改善しています" : "やや悪化しています。重点ケアをおすすめします";
        html += `<p>・${esc(d.label)}：${arrow}</p>`;
        if (!d.improved) {
          for (const q of CATEGORY_CHECK_QUESTIONS[catKey] || []) {
            html += `<p class="small indent">－ ${esc(q)}</p>`;
          }
        }
      }
    }
  }

  html += `<p class="small footer-note">※ 本レポートは画像処理による簡易的な肌測定であり、医療的診断ではありません。光の当たり方・撮影距離により数値は変動する場合があります。</p>`;
  html += `</div>`;
  return html;
}
