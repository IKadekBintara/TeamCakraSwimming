import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";

import type { defaultLayout, Letter } from './dispensasi';

const dateFormat = new Intl.DateTimeFormat("id-ID", {
  timeZone: "UTC", day: "numeric", month: "long", year: "numeric",
});
const weekdayFormat = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", weekday: "long" });

function dateAtUtc(date: string) {
  return new Date(`${date}T00:00:00Z`);
}

const listFormat = new Intl.ListFormat("id", { type: "conjunction" });
const monthFormat = new Intl.DateTimeFormat("id-ID", {
  timeZone: "UTC", month: "long", year: "numeric",
});

function describeDates(dates: string[]) {
  const values = dates.map(dateAtUtc);
  if (values.length > 1 && dates.every((date) => date.slice(0, 7) === dates[0].slice(0, 7))) {
    const days = listFormat.format(values.map((value) => String(value.getUTCDate())));
    return `${listFormat.format(values.map((value) => weekdayFormat.format(value)))}, ${days} ${monthFormat.format(values[0])}`;
  }
  return listFormat.format(values.map((value) => `${weekdayFormat.format(value)}, ${dateFormat.format(value)}`));
}

function describeEvent(start: string, end: string) {
  if (!end || start === end) return describeDates([start]);
  const first = dateAtUtc(start);
  const last = dateAtUtc(end);
  if (start.slice(0, 7) === end.slice(0, 7)) {
    return `${weekdayFormat.format(first)} sampai ${weekdayFormat.format(last)}, ${first.getUTCDate()}-${last.getUTCDate()} ${monthFormat.format(first)}`;
  }
  return `${describeDates([start])} sampai ${describeDates([end])}`;
}

export async function buildDispensasiPdf(
  letter: Letter,
  layout: typeof defaultLayout,
  header: { bytes: ArrayBuffer; type: "image/png" | "image/jpeg" },
) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const plain = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const image = await (header.type === "image/jpeg" ? pdf.embedJpg(header.bytes) : pdf.embedPng(header.bytes));
  pdf.setTitle(`Surat Dispensasi - ${letter.athlete}`);
  page.drawImage(image, { x: 0, y: height - layout.headerHeight, width, height: layout.headerHeight });

  const { margin, fontSize, leading } = layout;
  const lineWidth = width - 2 * margin;
  const text = (value: string, x: number, y: number, font = plain) => {
    if (y < 30) throw new Error("Isi melebihi satu halaman. Ringkas teks atau sesuaikan ukuran dan jarak.");
    page.drawText(value, { x, y, font, size: fontSize });
  };
  const tokens = new Map([
    ["{atlet}", letter.athlete],
    ["{acara}", letter.event],
    ["{izin}", describeDates(letter.leaveDates)],
  ]);

  function paragraph(value: string, x: number, y: number, maxWidth: number, justify = false, base = plain) {
    for (const line of value.split("\n")) {
      const emphasis: { start: number; end: number }[] = [];
      let shift = 0;
      const expanded = line.replace(/\{atlet\}|\{acara\}|\{izin\}/g, (token: string, index: number) => {
        const replacement = tokens.get(token) ?? token;
        emphasis.push({ start: index + shift, end: index + shift + replacement.length });
        shift += replacement.length - token.length;
        return replacement;
      });
      const words = Array.from(expanded.matchAll(/\S+/g), (match) => {
        const word = match[0];
        const index = match.index ?? 0;
        const font = emphasis.some(({ start, end }) => index < end && index + word.length > start) ? bold : base;
        return { word, font, width: font.widthOfTextAtSize(word, fontSize) };
      });
      let used = 0;
      let row: { word: string; font: PDFFont; width: number }[] = [];
      const gap = plain.widthOfTextAtSize(" ", fontSize);
      const drawRow = (spacing: number) => {
        let cursor = x;
        for (const word of row) {
          text(word.word, cursor, y, word.font);
          cursor += word.width + spacing;
        }
        y -= leading;
        row = [];
        used = 0;
      };
      for (const word of words) {
        if (word.width > maxWidth) throw new Error("Ada kata yang terlalu panjang untuk lebar surat.");
        if (row.length > 0 && used + gap + word.width > maxWidth) {
          drawRow(justify && row.length > 1 ? (maxWidth - used) / (row.length - 1) + gap : gap);
        }
        used += (row.length ? gap : 0) + word.width;
        row.push(word);
      }
      drawRow(gap);
    }
    return y;
  }

  function field(label: string, value: string, x: number, y: number, offset: number, font = plain) {
    text(label, x, y, font);
    text(":", x + offset, y, font);
    return paragraph(value, x + offset + 9, y, width - margin - x - offset - 9, false, font) - 2;
  }

  let y = height - layout.headerHeight - 18;
  y = field("No.", letter.number || "-", margin, y, 49);
  y = field("Lamp.", letter.attachment || "-", margin, y, 49);
  y = field("Hal", letter.subject, margin, y, 49, bold) - 16;
  const issued = `${letter.city}, ${dateFormat.format(dateAtUtc(letter.issueDate))}`;
  const issueWidth = plain.widthOfTextAtSize(issued, fontSize);
  if (issueWidth > lineWidth - 75) throw new Error("Tempat atau tanggal surat terlalu panjang.");
  text(issued, width - margin - issueWidth, y);
  text("Kepada", margin, y);
  text("Yth. Bapak/Ibu Kepala Sekolah", margin, y - leading - 2);
  y = paragraph(letter.school.toLocaleUpperCase("id"), margin, y - 2 * (leading + 2), lineWidth, false, bold);
  text("di tempat", margin, y - 2);
  y -= leading + 16;
  text("Dengan hormat,", margin, y);
  y = paragraph(letter.opening, margin, y - leading - 5, lineWidth, true) - 8;
  y = field("Acara", letter.event, margin + 26, y, 81);
  y = field("Jadwal lomba", describeEvent(letter.eventDate, letter.eventEnd), margin + 26, y, 81);
  y = field("Tempat", letter.venue, margin + 26, y, 81) - 4;
  y = paragraph(letter.closing, margin, y, lineWidth, true) - 15;

  const center = margin + lineWidth * layout.signatureX / 100;
  for (const [value, baseline] of [
    [letter.position, y],
    [letter.organization, y - leading - 2],
    [letter.signer, y - leading - 2 - layout.signatureGap],
  ] as const) {
    const valueWidth = plain.widthOfTextAtSize(value, fontSize);
    if (center - valueWidth / 2 < margin || center + valueWidth / 2 > width - margin) {
      throw new Error("Teks penandatangan terlalu lebar untuk posisinya.");
    }
    text(value, center - valueWidth / 2, baseline);
  }
  return pdf.save();
}
