// 生成された台本テキストを Word（.docx）に変換し、ブラウザでダウンロードさせる。

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  PageBreak,
  AlignmentType,
  HeadingLevel,
  LineRuleType,
} from "docx";
import { saveAs } from "file-saver";

const FONT = "MS明朝";

// half-point 単位（pt × 2）
const SIZE_TITLE = 36; // 18pt
const SIZE_HEADING = 28; // 14pt
const SIZE_BODY = 24; // 12pt

const LINE_SPACING = 360; // 1.5倍

// 「導入」「【テーマ構成】」など、ページブレークを伴わない見出し
function isPlainHeading(line: string): boolean {
  return /^(導入|【テーマ構成】|テーマ構成)\s*/.test(line);
}

// 「テーマ1」「テーマ 12　タイトル」など、前にページブレークを入れる見出し
function isThemeHeading(line: string): boolean {
  return /^テーマ\s*\d+/.test(line);
}

function emptyParagraph(): Paragraph {
  return new Paragraph({ children: [] });
}

function headingParagraph(line: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [
      new TextRun({ text: line, font: FONT, size: SIZE_HEADING, bold: true }),
    ],
  });
}

function bodyParagraph(line: string): Paragraph {
  return new Paragraph({
    spacing: { line: LINE_SPACING, lineRule: LineRuleType.AUTO, before: 0, after: 0 },
    children: [new TextRun({ text: line, font: FONT, size: SIZE_BODY })],
  });
}

// 台本テキストを docx の段落配列に変換する。
function buildParagraphs(name: string, text: string): Paragraph[] {
  const children: Paragraph[] = [];

  // ドキュメント先頭のタイトル行
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
      children: [
        new TextRun({ text: `${name}　台本`, font: FONT, size: SIZE_TITLE, bold: true }),
      ],
    }),
  );

  const normalized = text.replace(/\r\n/g, "\n").trim();
  const blocks = normalized.split(/\n{2,}/);

  blocks.forEach((rawBlock, index) => {
    const block = rawBlock.trim();
    if (!block) return;

    const lines = block.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length === 0) return;

    const firstLine = lines[0];

    if (isThemeHeading(firstLine)) {
      // 各テーマの前にページブレークを入れる
      children.push(new Paragraph({ children: [new PageBreak()] }));
      children.push(headingParagraph(firstLine));
      lines.slice(1).forEach((l) => children.push(bodyParagraph(l)));
    } else if (isPlainHeading(firstLine)) {
      children.push(headingParagraph(firstLine));
      lines.slice(1).forEach((l) => children.push(bodyParagraph(l)));
    } else {
      lines.forEach((l) => children.push(bodyParagraph(l)));
    }

    // ブロック間のスペーサー（最後のブロックの後ろには不要）
    if (index < blocks.length - 1) {
      children.push(emptyParagraph());
    }
  });

  return children;
}

export async function generateDocx(name: string, text: string): Promise<void> {
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 }, // 約2cm
          },
        },
        children: buildParagraphs(name, text),
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  saveAs(blob, `${name}_台本_${date}.docx`);
}
