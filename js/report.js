/**
 * 測定結果のレポート出力（部位オーバーレイ画像＋テキストサマリー＋お客様向けHTMLレポート）。
 * Python版 report.py の役割を移植。PDF(ReportLab)の代わりに、ブラウザの印刷機能
 * （印刷 → PDFとして保存）で同等の出力を得られるHTML版レポートを生成する。
 */
import { CATEGORY_CONFIG } from "./scoring.js";
import * as i18n from "./i18n.js";
import { categoryLabel, categoryDesc, treatmentMenu, treatmentFrequency, treatmentHomecare, checkQuestions } from "./i18n-categories.js";

// 部位ラベルは i18n.regionLabel(name) で現在言語の文言を取得する
// （旧 REGION_LABELS_JA は i18n.js の REGIONS テーブルに統合済み）。

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
    const label = i18n.regionLabel(name);
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

    const label = i18n.regionLabel(name);
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
  if (score === null || score === undefined) return [i18n.t("report.judgeUnmeasurable"), "#888888"];
  if (score >= 75) return [i18n.t("report.judgeGood"), "#2fa62f"];
  if (score >= 50) return [i18n.t("report.judgeAverage"), "#0090a6"];
  return [i18n.t("report.judgeNeedsCare"), "#c23b3b"];
}

function _overallComment(overall) {
  if (overall === null || overall === undefined) {
    return i18n.t("report.overallMissing");
  }
  if (overall >= 80) return i18n.t("report.overallGreat");
  if (overall >= 65) return i18n.t("report.overallGood");
  if (overall >= 50) return i18n.t("report.overallAverage");
  return i18n.t("report.overallNeedsCare");
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
    const label = categoryLabel(catKey);
    const score = info.score;
    lines.push(`  - ${label}: ${score !== null && score !== undefined ? score : "--"} 点`);
    i += 1;
  }
  lines.push("");
  lines.push(`※ ${methodNote}`);

  if (recommendations && Object.keys(recommendations).length) {
    lines.push("");
    lines.push("【おすすめ施術（スコアが低い項目）】");
    for (const [catKey, info] of Object.entries(recommendations)) {
      const menuList = treatmentMenu(catKey);
      const menu = menuList.length ? menuList.join("、") : i18n.t("report.noMenuSet");
      lines.push(`  - ${categoryLabel(catKey)}（${info.score}点）`);
      lines.push(`      施術: ${menu}`);
      const frequency = treatmentFrequency(catKey);
      const homecare = treatmentHomecare(catKey);
      if (frequency) lines.push(`      目安回数: ${frequency}`);
      if (homecare) lines.push(`      ホームケア: ${homecare}`);
    }
  }

  if (beforeAfter) {
    lines.push("");
    lines.push("【前回からの変化】");
    for (const [catKey, d] of Object.entries(beforeAfter)) {
      if (!d) continue;
      if (d.status === "no_change") {
        lines.push(`  - ${categoryLabel(catKey)}: 誤差範囲内（変化なし）`);
      } else {
        const arrow = d.improved ? "改善" : "要注意";
        const sign = d.diff >= 0 ? "+" : "";
        lines.push(`  - ${categoryLabel(catKey)}: ${sign}${d.diff.toFixed(2)}${d.unit}（${arrow}）`);
        if (!d.improved) {
          for (const q of checkQuestions(catKey)) {
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
  const dateStr = new Date().toLocaleDateString(i18n.dateLocale(), { year: "numeric", month: "long", day: "numeric" });

  let html = `<div class="report">`;
  html += `<h1>${esc(i18n.t("report.reportTitle"))}</h1>`;
  html += `<p class="sub">${esc(i18n.t("report.subLine", { id: customerId, date: dateStr }))}</p>`;

  const overallTxt = overall !== null && overall !== undefined ? overall.toFixed(1) : "--";
  html += `<h2>${esc(i18n.t("report.overallHeading", { score: overallTxt }))}</h2>`;
  html += `<p>${esc(_overallComment(overall))}</p>`;

  if (quality && quality.issues && quality.issues.length) {
    html += `<h2>${esc(i18n.t("report.qualityHeading"))}</h2>`;
    for (const issue of quality.issues) {
      html += `<p class="warn">・${esc(issue)}</p>`;
    }
  }

  if (diagnosisDataUrl) {
    html += `<h2>${esc(i18n.t("report.diagnosisHeading"))}</h2>`;
    html += `<p>${esc(i18n.t("report.diagnosisDesc"))}</p>`;
    html += `<img class="diagnosis-img" src="${diagnosisDataUrl}" alt="${esc(i18n.t("report.diagnosisHeading"))}" />`;
  }

  html += `<h2>${esc(i18n.t("report.scoreHeading"))}</h2>`;
  html += `<table class="score-table"><thead><tr><th>${esc(i18n.t("report.colNo"))}</th><th>${esc(i18n.t("report.colItem"))}</th><th>${esc(i18n.t("report.colScore"))}</th><th>${esc(i18n.t("report.colJudge"))}</th><th>${esc(i18n.t("report.colContent"))}</th></tr></thead><tbody>`;
  let i = 1;
  for (const [catKey, info] of Object.entries(categoryScores)) {
    const label = categoryLabel(catKey);
    const score = info.score;
    const [judge, judgeColor] = _scoreJudgement(score);
    const desc = categoryDesc(catKey);
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
    html += `<h2>${esc(i18n.t("report.recoHeading"))}</h2>`;
    html += `<table class="reco-table"><thead><tr><th>${esc(i18n.t("report.colItem"))}</th><th>${esc(i18n.t("report.colMenu"))}</th><th>${esc(i18n.t("report.colFrequency"))}</th><th>${esc(i18n.t("report.colHomecare"))}</th></tr></thead><tbody>`;
    for (const [catKey, info] of Object.entries(recommendations)) {
      const menuList = treatmentMenu(catKey);
      const menu = menuList.length ? menuList.join("、") : i18n.t("report.noMenuSet");
      html += `<tr>`;
      html += `<td>${esc(categoryLabel(catKey))}（${info.score.toFixed(0)}点）</td>`;
      html += `<td>${esc(menu)}</td>`;
      html += `<td>${esc(treatmentFrequency(catKey) || "")}</td>`;
      html += `<td>${esc(treatmentHomecare(catKey) || "")}</td>`;
      html += `</tr>`;
    }
    html += `</tbody></table>`;
  }

  if (beforeAfter) {
    const changed = Object.entries(beforeAfter).filter(([, d]) => d && d.status !== "no_change");
    html += `<h2>${esc(i18n.t("report.changeHeading"))}</h2>`;
    if (!changed.length) {
      html += `<p>${esc(i18n.t("report.noChangeAtAll"))}</p>`;
    } else {
      for (const [catKey, d] of changed) {
        const arrow = d.improved ? i18n.t("report.improved") : i18n.t("report.worsened");
        html += `<p>・${esc(categoryLabel(catKey))}：${esc(arrow)}</p>`;
        if (!d.improved) {
          for (const q of checkQuestions(catKey)) {
            html += `<p class="small indent">－ ${esc(q)}</p>`;
          }
        }
      }
    }
  }

  html += `<p class="small footer-note">${esc(i18n.t("report.footerNote"))}</p>`;
  html += `</div>`;
  return html;
}
