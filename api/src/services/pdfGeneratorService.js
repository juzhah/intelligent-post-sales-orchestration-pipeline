const PDFDocument = require("pdfkit");

// ─── Constants ────────────────────────────────────────────────────────────────

const COLORS = {
  headerBg: "#1a2744",
  sectionBlue: "#2c5282",
  high: "#c53030",
  medium: "#dd6b20",
  low: "#276749",
  cardBg: "#f5f5f5",
  bodyText: "#2d3748",
  white: "#ffffff",
  barFill: "#2c5282",
  barEmpty: "#e2e8f0",
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// ─── Validation ───────────────────────────────────────────────────────────────

function validateParams(params) {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    const err = new Error("Invalid or missing `output` payload");
    err.name = "ValidationError";
    err.details = "`params` must be a non-null object";
    throw err;
  }
}

// ─── Buffer collector ─────────────────────────────────────────────────────────

function buildPDFBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err) => reject(err));
  });
}

// ─── Page overflow guard ──────────────────────────────────────────────────────

function ensureSpace(doc, neededPts) {
  if (doc.y + neededPts > PAGE_HEIGHT - MARGIN) doc.addPage();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSeverityColor(severity) {
  /* TODO: Analizar propósito de cadena vacía */
  const s = (severity || "").toLowerCase();
  if (s === "high") return COLORS.high;
  if (s === "medium") return COLORS.medium;
  return COLORS.low;
}

function drawSectionTitle(doc, title) {
  ensureSpace(doc, 40);
  doc
    .moveDown(0.8)
    .fillColor(COLORS.sectionBlue)
    .fontSize(13)
    .font("Helvetica-Bold")
    .text(title.toUpperCase(), MARGIN, doc.y);
  doc
    .moveTo(MARGIN, doc.y + 2)
    .lineTo(MARGIN + CONTENT_WIDTH, doc.y + 2)
    .strokeColor(COLORS.sectionBlue)
    .lineWidth(1)
    .stroke();
  doc.moveDown(0.6).fillColor(COLORS.bodyText).fontSize(10).font("Helvetica");
}

function drawBulletList(doc, items, indent = 0) {
  (items || []).forEach((item) => {
    ensureSpace(doc, 18);
    doc
      .fontSize(10)
      .fillColor(COLORS.bodyText)
      .font("Helvetica")
      .text(`\u2022  ${item}`, MARGIN + indent, doc.y, {
        width: CONTENT_WIDTH - indent,
        continued: false,
      });
  });
  doc.moveDown(0.3);
}

// Draws a colored pill badge; returns the x position after the badge
function drawBadge(doc, label, color, x, y) {
  doc.save();
  const padding = 6;
  const badgeW = doc.widthOfString(label, { fontSize: 9 }) + padding * 2;
  const badgeH = 15;
  doc.roundedRect(x, y - 1, badgeW, badgeH, 3).fill(color);
  doc
    .fillColor(COLORS.white)
    .fontSize(9)
    .font("Helvetica-Bold")
    .text(label, x + padding, y + 1, { lineBreak: false });
  doc.restore();
  return x + badgeW + 8;
}

// ─── Section drawers ──────────────────────────────────────────────────────────

function drawHeader(doc) {
  doc.rect(0, 0, PAGE_WIDTH, 88).fill(COLORS.headerBg);

  doc
    .fillColor(COLORS.white)
    .fontSize(26)
    .font("Helvetica-Bold")
    .text("RevAuto", MARGIN, 20, { lineBreak: false });

  doc
    .fillColor("#90cdf4")
    .fontSize(11)
    .font("Helvetica")
    .text("Revenue Operations Autopilot", MARGIN + 136, 26, {
      lineBreak: false,
    });

  doc
    .fillColor(COLORS.white)
    .fontSize(12)
    .font("Helvetica")
    .text("Client Onboarding Briefing", MARGIN, 52);

  doc
    .fillColor("#a0aec0")
    .fontSize(9)
    .text(`Generated: ${new Date().toUTCString()}`, MARGIN, 68);

  doc.y = 108;
  doc.fillColor(COLORS.bodyText).font("Helvetica").fontSize(10);
}

function drawConfidenceScore(doc, score) {
  drawSectionTitle(doc, "AI Confidence Score");

  const pct = Math.min(Math.max(score || 0, 0), 1);
  const label = `${Math.round(pct * 100)}%`;
  const barH = 16;
  const x = MARGIN;
  const y = doc.y;

  doc.rect(x, y, CONTENT_WIDTH, barH).fill(COLORS.barEmpty);
  if (pct > 0) doc.rect(x, y, CONTENT_WIDTH * pct, barH).fill(COLORS.barFill);

  doc
    .fillColor(COLORS.bodyText)
    .fontSize(10)
    .font("Helvetica-Bold")
    .text(label, x + CONTENT_WIDTH + 8, y + 2, { lineBreak: false });

  doc.y = y + barH + 10;

  const note =
    pct >= 0.7
      ? "High confidence — sufficient data for automated delivery."
      : pct >= 0.5
        ? "Moderate confidence — review flagged items before proceeding."
        : "Low confidence — human review required before delivery actions.";

  doc
    .fillColor(COLORS.bodyText)
    .fontSize(9)
    .font("Helvetica")
    .text(note, MARGIN, doc.y, { width: CONTENT_WIDTH });

  doc.moveDown(0.8);
}

function drawRiskCard(doc, risk) {
  ensureSpace(doc, 140);

  const startY = doc.y;
  const innerX = MARGIN + 12;
  const innerW = CONTENT_WIDTH - 24;
  const color = getSeverityColor(risk.severity);

  // Severity stripe + card background (drawn again after measuring height at the end)
  doc.rect(MARGIN + 4, startY, CONTENT_WIDTH - 4, 4).fill(COLORS.cardBg);
  doc.rect(MARGIN, startY, 4, 4).fill(color);

  // Category label
  const catY = startY + 10;
  doc
    .fillColor(COLORS.bodyText)
    .fontSize(11)
    .font("Helvetica-Bold")
    .text(risk.category || "—", innerX, catY, { continued: false });

  const badgeX =
    innerX + doc.widthOfString(risk.category || "—", { fontSize: 11 }) + 10;
  drawBadge(doc, (risk.severity || "").toUpperCase(), color, badgeX, catY);

  // Description
  doc.y = catY + 18;
  doc
    .fillColor(COLORS.bodyText)
    .fontSize(10)
    .font("Helvetica")
    .text(risk.description || "", innerX, doc.y, { width: innerW });

  // Mitigation
  doc
    .moveDown(0.4)
    .fillColor(COLORS.sectionBlue)
    .fontSize(9)
    .font("Helvetica-Bold")
    .text("Mitigation:", innerX, doc.y);
  doc
    .fillColor(COLORS.bodyText)
    .font("Helvetica")
    .text(risk.mitigation || "", innerX, doc.y, { width: innerW });

  // Owner
  doc
    .moveDown(0.3)
    .fillColor(COLORS.sectionBlue)
    .fontSize(9)
    .font("Helvetica-Bold")
    .text("Owner:", innerX, doc.y, { continued: true });
  doc
    .fillColor(COLORS.bodyText)
    .font("Helvetica")
    .text(`  ${risk.owner || "—"}`, { continued: false });

  // Now that we know the final height, draw the full card background underneath
  const cardH = doc.y + 10 - startY;
  doc.rect(MARGIN + 4, startY, CONTENT_WIDTH - 4, cardH).fill(COLORS.cardBg);
  doc.rect(MARGIN, startY, 4, cardH).fill(color);

  // Re-render text on top of the filled background
  doc
    .fillColor(COLORS.bodyText)
    .fontSize(11)
    .font("Helvetica-Bold")
    .text(risk.category || "—", innerX, catY);
  drawBadge(doc, (risk.severity || "").toUpperCase(), color, badgeX, catY);

  doc.y = catY + 18;
  doc
    .fillColor(COLORS.bodyText)
    .fontSize(10)
    .font("Helvetica")
    .text(risk.description || "", innerX, doc.y, { width: innerW });

  doc
    .moveDown(0.4)
    .fillColor(COLORS.sectionBlue)
    .fontSize(9)
    .font("Helvetica-Bold")
    .text("Mitigation:", innerX, doc.y);
  doc
    .fillColor(COLORS.bodyText)
    .font("Helvetica")
    .text(risk.mitigation || "", innerX, doc.y, { width: innerW });

  doc
    .moveDown(0.3)
    .fillColor(COLORS.sectionBlue)
    .fontSize(9)
    .font("Helvetica-Bold")
    .text("Owner:", innerX, doc.y, { continued: true });
  doc
    .fillColor(COLORS.bodyText)
    .font("Helvetica")
    .text(`  ${risk.owner || "—"}`, { continued: false });

  doc.y = doc.y + 14;
}

function drawRiskAudit(doc, riskAudit) {
  drawSectionTitle(doc, "Risk Audit");

  // Overall risk level
  const levelColor = getSeverityColor(riskAudit.overallRiskLevel);
  const levelY = doc.y;
  doc
    .fillColor(COLORS.bodyText)
    .fontSize(11)
    .font("Helvetica-Bold")
    .text("Overall Risk Level:", MARGIN, levelY, { continued: false });
  drawBadge(
    doc,
    (riskAudit.overallRiskLevel || "Unknown").toUpperCase(),
    levelColor,
    MARGIN + doc.widthOfString("Overall Risk Level:", { fontSize: 11 }) + 10,
    levelY,
  );

  doc.y = levelY + 20;
  doc.moveDown(0.4);

  (riskAudit.risks || []).forEach((risk) => drawRiskCard(doc, risk));

  // Summary
  ensureSpace(doc, 60);
  doc
    .moveDown(0.5)
    .fillColor(COLORS.sectionBlue)
    .fontSize(10)
    .font("Helvetica-Bold")
    .text("Summary:", MARGIN, doc.y);
  doc
    .fillColor(COLORS.bodyText)
    .font("Helvetica")
    .text(riskAudit.summary || "", MARGIN, doc.y, { width: CONTENT_WIDTH });
  doc.moveDown(1);
}

function drawPhaseCard(doc, phase) {
  ensureSpace(doc, 180);

  const startY = doc.y;
  const headerH = 24;
  const innerX = MARGIN + 10;
  const innerW = CONTENT_WIDTH - 20;

  // Phase header bar
  doc.rect(MARGIN, startY, CONTENT_WIDTH, headerH).fill(COLORS.sectionBlue);
  doc
    .fillColor(COLORS.white)
    .fontSize(11)
    .font("Helvetica-Bold")
    .text(
      `${phase.name || "Phase"}   |   Days: ${phase.days || "—"}`,
      innerX,
      startY + 6,
      { width: innerW, lineBreak: false },
    );

  doc.y = startY + headerH + 8;

  // Objectives
  doc
    .fillColor(COLORS.sectionBlue)
    .fontSize(9)
    .font("Helvetica-Bold")
    .text("Objectives", innerX, doc.y);
  doc.fillColor(COLORS.bodyText).font("Helvetica");
  drawBulletList(doc, phase.objectives, 10);

  // Key Actions
  ensureSpace(doc, 50);
  doc
    .fillColor(COLORS.sectionBlue)
    .fontSize(9)
    .font("Helvetica-Bold")
    .text("Key Actions", innerX, doc.y + 4);
  doc.fillColor(COLORS.bodyText).font("Helvetica");
  drawBulletList(doc, phase.keyActions, 10);

  // Deliverables
  ensureSpace(doc, 50);
  doc
    .fillColor(COLORS.sectionBlue)
    .fontSize(9)
    .font("Helvetica-Bold")
    .text("Deliverables", innerX, doc.y + 4);
  doc.fillColor(COLORS.bodyText).font("Helvetica");
  drawBulletList(doc, phase.deliverables, 10);

  // Risk checkpoint
  ensureSpace(doc, 30);
  doc
    .fillColor(COLORS.sectionBlue)
    .fontSize(9)
    .font("Helvetica-Bold")
    .text("Risk Checkpoint:", innerX, doc.y + 6, { continued: true });
  doc
    .fillColor(COLORS.bodyText)
    .font("Helvetica")
    .text(`  ${phase.riskCheckpoint || "—"}`, { continued: false });

  doc.moveDown(1.2);
}

function drawDeliveryStrategy(doc, deliveryStrategy) {
  drawSectionTitle(doc, "30-Day Delivery Strategy");

  (deliveryStrategy.phases || []).forEach((phase) => drawPhaseCard(doc, phase));

  ensureSpace(doc, 50);
  doc
    .moveDown(0.5)
    .fillColor(COLORS.sectionBlue)
    .fontSize(11)
    .font("Helvetica-Bold")
    .text("Critical Milestones", MARGIN, doc.y);
  doc.fillColor(COLORS.bodyText).font("Helvetica").fontSize(10);
  drawBulletList(doc, deliveryStrategy.criticalMilestones);

  ensureSpace(doc, 50);
  doc
    .moveDown(0.5)
    .fillColor(COLORS.sectionBlue)
    .fontSize(11)
    .font("Helvetica-Bold")
    .text("Escalation Triggers", MARGIN, doc.y);
  doc.fillColor(COLORS.bodyText).font("Helvetica").fontSize(10);
  drawBulletList(doc, deliveryStrategy.escalationTriggers);

  doc.moveDown(1);
}

function drawFlaggedRisks(doc, flaggedRisks) {
  drawSectionTitle(doc, "Flagged Items for Human Review");
  drawBulletList(doc, flaggedRisks);
  doc.moveDown(1);
}

function drawFooter(doc) {
  doc
    .fillColor("#a0aec0")
    .fontSize(8)
    .font("Helvetica")
    .text(
      `RevAuto  \u2022  Autonomous Lifecycle Engine  \u2022  Generated ${new Date().toISOString()}`,
      MARGIN,
      PAGE_HEIGHT - 35,
      { width: CONTENT_WIDTH, align: "center" },
    );
}

// ─── Main export ──────────────────────────────────────────────────────────────

async function generatePDF(params) {
  validateParams(params);

  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    autoFirstPage: true,
  });
  const bufferPromise = buildPDFBuffer(doc);

  drawHeader(doc);
  drawConfidenceScore(doc, params.confidenceScore);
  drawRiskAudit(doc, params.riskAudit);
  drawDeliveryStrategy(doc, params.deliveryStrategy);
  drawFlaggedRisks(doc, params.flaggedRisks);
  drawFooter(doc);

  doc.end();
  return bufferPromise;
}

module.exports = generatePDF;
