import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { InvoiceAttachment, InvoiceVersion } from '../types';
import { formatRupiah, formatUSD, formatAngka, formatTanggalIndonesia, getExchangeRatesSummary } from './terbilang';

export interface PDFGenerationOptions {
  invoiceNumber: string;
  version: InvoiceVersion;
  attachments?: InvoiceAttachment[];
  paymentStatus?: string;
  documentStatus?: string;
  createdByName?: string;
}

// Helper to sanitize text for WinAnsi encoding in pdf-lib StandardFonts
export function cleanWinAnsi(str?: string): string {
  if (!str) return '';
  return String(str)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2022/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x00-\xFF]/g, '');
}

// Helper to wrap long text into lines fitting max width
function wrapText(text: string, font: any, fontSize: number, maxWidth: number): string[] {
  if (!text) return [];
  const cleaned = cleanWinAnsi(text);
  const paragraphs = cleaned.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push('');
      continue;
    }
    const words = para.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);
      if (testWidth <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
  }

  return lines;
}

export async function generateInvoicePDF({
  invoiceNumber,
  version,
  attachments: customAttachments,
  paymentStatus,
  documentStatus,
  createdByName,
}: PDFGenerationOptions): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // A4 dimensions in points (72 points per inch)
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  // Colors
  const primaryColor = rgb(0.08, 0.18, 0.36); // #142e5c dark navy
  const textColor = rgb(0.12, 0.15, 0.2); // #1f2633
  const mutedColor = rgb(0.42, 0.46, 0.52); // #6b7685
  const borderColor = rgb(0.85, 0.88, 0.92); // #d9e0eb
  const tableHeaderBg = rgb(0.95, 0.96, 0.98); // #f2f5fa

  let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const checkPageBreak = (neededHeight: number): void => {
    if (y - neededHeight < margin + 40) {
      currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
      drawHeaderAndTitle(false);
      drawTableHeader();
    }
  };

  // Embed logo if available
  let embeddedLogo: any = null;
  if (version.logo_snapshot_url) {
    try {
      if (version.logo_snapshot_url.startsWith('data:image/png;base64,')) {
        const base64Data = version.logo_snapshot_url.replace('data:image/png;base64,', '');
        const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
        embeddedLogo = await pdfDoc.embedPng(imageBytes);
      } else if (
        version.logo_snapshot_url.startsWith('data:image/jpeg;base64,') ||
        version.logo_snapshot_url.startsWith('data:image/jpg;base64,')
      ) {
        const base64Data = version.logo_snapshot_url.replace(/^data:image\/jpeg;base64,/, '').replace(/^data:image\/jpg;base64,/, '');
        const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
        embeddedLogo = await pdfDoc.embedJpg(imageBytes);
      }
    } catch {
      // If image embedding fails, logo will gracefully fall back to text
      embeddedLogo = null;
    }
  }

  // Draw Header
  const drawHeaderAndTitle = (isFirstPage: boolean) => {
    const headerTop = y;

    if (isFirstPage) {
      // Left side: Publisher info
      if (embeddedLogo) {
        const logoDims = embeddedLogo.scaleToFit(140, 50);
        currentPage.drawImage(embeddedLogo, {
          x: margin,
          y: headerTop - logoDims.height,
          width: logoDims.width,
          height: logoDims.height,
        });

        // Publisher details below logo
        const infoY = headerTop - logoDims.height - 12;
        currentPage.drawText(version.publisher_snapshot.name || 'DIGITAL / MARCOMM TEAM', {
          x: margin,
          y: infoY,
          size: 9,
          font: fontBold,
          color: primaryColor,
        });
        currentPage.drawText(`${version.publisher_snapshot.city}, ${version.publisher_snapshot.country}`, {
          x: margin,
          y: infoY - 11,
          size: 8,
          font: fontRegular,
          color: mutedColor,
        });
        currentPage.drawText(`Telp: ${version.publisher_snapshot.phone}  |  Email: ${version.publisher_snapshot.email}`, {
          x: margin,
          y: infoY - 21,
          size: 8,
          font: fontRegular,
          color: mutedColor,
        });
      } else {
        // Fallback typography branding
        currentPage.drawText(version.publisher_snapshot.name || 'DIGITAL / MARCOMM TEAM', {
          x: margin,
          y: headerTop - 14,
          size: 14,
          font: fontBold,
          color: primaryColor,
        });
        if (version.publisher_snapshot.sub_name) {
          currentPage.drawText(version.publisher_snapshot.sub_name, {
            x: margin,
            y: headerTop - 26,
            size: 9,
            font: fontRegular,
            color: mutedColor,
          });
        }
        currentPage.drawText(`${version.publisher_snapshot.city}, ${version.publisher_snapshot.country}`, {
          x: margin,
          y: headerTop - 38,
          size: 8,
          font: fontRegular,
          color: mutedColor,
        });
        currentPage.drawText(`Telp: ${version.publisher_snapshot.phone}  |  Email: ${version.publisher_snapshot.email}`, {
          x: margin,
          y: headerTop - 49,
          size: 8,
          font: fontRegular,
          color: mutedColor,
        });
      }

      // Right side: Document Title & Meta
      const rightX = pageWidth - margin;
      const titleText = 'INVOICE DIGITAL TEAM';
      const titleWidth = fontBold.widthOfTextAtSize(titleText, 16);
      currentPage.drawText(titleText, {
        x: rightX - titleWidth,
        y: headerTop - 14,
        size: 16,
        font: fontBold,
        color: primaryColor,
      });

      // Invoice metadata table on the right
      const metaStartY = headerTop - 34;
      const metaRowHeight = 12;

      const drawMetaRow = (label: string, value: string, rowIdx: number) => {
        const rowY = metaStartY - rowIdx * metaRowHeight;
        currentPage.drawText(label, {
          x: rightX - 190,
          y: rowY,
          size: 8,
          font: fontRegular,
          color: mutedColor,
        });
        currentPage.drawText(':', {
          x: rightX - 110,
          y: rowY,
          size: 8,
          font: fontRegular,
          color: mutedColor,
        });
        currentPage.drawText(cleanWinAnsi(value), {
          x: rightX - 100,
          y: rowY,
          size: 8.5,
          font: fontBold,
          color: textColor,
        });
      };

      drawMetaRow('Nomor Invoice', invoiceNumber || 'DRAFT', 0);
      drawMetaRow('Tanggal Terbit', formatTanggalIndonesia(version.issue_date), 1);
      drawMetaRow('Jatuh Tempo', formatTanggalIndonesia(version.due_date), 2);
      drawMetaRow('Periode Tagihan', version.period || '-', 3);

      y = headerTop - 85;

      // Divider line
      currentPage.drawLine({
        start: { x: margin, y },
        end: { x: pageWidth - margin, y },
        thickness: 1,
        color: borderColor,
      });

      y -= 16;

      // "Kepada" Section
      const client = version.client_snapshot;
      currentPage.drawText('DITAGIHKAN KEPADA:', {
        x: margin,
        y,
        size: 8,
        font: fontBold,
        color: mutedColor,
      });

      y -= 13;
      const clientTitle = cleanWinAnsi(`${client.sapaan || ''} ${client.pic_name || ''}`.trim());
      currentPage.drawText(clientTitle || 'Pelanggan Terhormat', {
        x: margin,
        y,
        size: 10.5,
        font: fontBold,
        color: textColor,
      });

      if (client.company_name) {
        y -= 12;
        currentPage.drawText(cleanWinAnsi(client.company_name), {
          x: margin,
          y,
          size: 9.5,
          font: fontRegular,
          color: textColor,
        });
      }

      if (client.billing_address) {
        y -= 11;
        const addressLines = wrapText(client.billing_address, fontRegular, 8, contentWidth * 0.6);
        for (const line of addressLines) {
          currentPage.drawText(line, {
            x: margin,
            y,
            size: 8,
            font: fontRegular,
            color: mutedColor,
          });
          y -= 10;
        }
      }

      if (client.whatsapp || client.email) {
        y -= 1;
        const contactInfo = [client.whatsapp ? `WA: ${client.whatsapp}` : '', client.email ? `Email: ${client.email}` : '']
          .filter(Boolean)
          .join('  |  ');
        currentPage.drawText(contactInfo, {
          x: margin,
          y,
          size: 8,
          font: fontRegular,
          color: mutedColor,
        });
      }

      y -= 18;
    } else {
      // Continuation page header
      currentPage.drawText(`INVOICE: ${invoiceNumber} (Lanjutan)`, {
        x: margin,
        y: y - 10,
        size: 8.5,
        font: fontBold,
        color: mutedColor,
      });
      currentPage.drawLine({
        start: { x: margin, y: y - 16 },
        end: { x: pageWidth - margin, y: y - 16 },
        thickness: 0.5,
        color: borderColor,
      });
      y -= 26;
    }
  };

  // Table Column Coordinates
  // Width: contentWidth = 515.28
  // No: 30, Deskripsi: 215, Qty: 45, Satuan: 55, Harga Satuan: 85, Total: 85
  const colX = {
    no: margin,
    desc: margin + 30,
    qty: margin + 245,
    unit: margin + 290,
    price: margin + 345,
    total: margin + 430,
    end: pageWidth - margin,
  };

  const drawTableHeader = () => {
    const hHeight = 22;
    // Header background
    currentPage.drawRectangle({
      x: margin,
      y: y - hHeight + 4,
      width: contentWidth,
      height: hHeight,
      color: tableHeaderBg,
      borderColor: borderColor,
      borderWidth: 0.75,
    });

    const headerY = y - 10;
    currentPage.drawText('No.', { x: colX.no + 8, y: headerY, size: 8, font: fontBold, color: primaryColor });
    currentPage.drawText('Deskripsi Pekerjaan', { x: colX.desc + 6, y: headerY, size: 8, font: fontBold, color: primaryColor });
    currentPage.drawText('Qty', { x: colX.qty + 6, y: headerY, size: 8, font: fontBold, color: primaryColor });
    currentPage.drawText('Satuan', { x: colX.unit + 6, y: headerY, size: 8, font: fontBold, color: primaryColor });
    currentPage.drawText('Harga Satuan', { x: colX.price + 6, y: headerY, size: 8, font: fontBold, color: primaryColor });
    currentPage.drawText('Total', { x: colX.total + 6, y: headerY, size: 8, font: fontBold, color: primaryColor });

    y -= hHeight + 4;
  };

  // Draw First Page Header
  drawHeaderAndTitle(true);
  drawTableHeader();

  // Draw Items
  version.items.forEach((item, index) => {
    const isUSD = item.currency === 'USD' || (item.unit_price_usd !== undefined && item.unit_price_usd > 0);
    const rawDescLines = wrapText(item.description, fontRegular, 8.5, colX.qty - colX.desc - 12);
    const descLines = [...rawDescLines];
    if (isUSD) {
      const customRate = item.custom_exchange_rate || version.custom_exchange_rate || 16250;
      descLines.push(`* USD $${formatAngka(item.unit_price_usd || 0)} @ Kurs: Rp ${formatAngka(customRate)}`);
    }

    const minRowHeight = isUSD ? 28 : 20;
    const rowHeight = Math.max(minRowHeight, descLines.length * 11 + 8);

    checkPageBreak(rowHeight);

    // Row top border
    currentPage.drawLine({
      start: { x: margin, y: y + 4 },
      end: { x: pageWidth - margin, y: y + 4 },
      thickness: 0.5,
      color: borderColor,
    });

    const itemY = y - 6;

    // No.
    currentPage.drawText(String(index + 1), {
      x: colX.no + 8,
      y: itemY,
      size: 8.5,
      font: fontRegular,
      color: textColor,
    });

    // Description (multi-line)
    descLines.forEach((line, lIdx) => {
      const isRateLine = isUSD && lIdx === descLines.length - 1;
      currentPage.drawText(line, {
        x: colX.desc + 6,
        y: itemY - lIdx * 11,
        size: isRateLine ? 7.5 : 8.5,
        font: isRateLine ? fontOblique : fontRegular,
        color: isRateLine ? rgb(0.08, 0.45, 0.25) : textColor,
      });
    });

    // Qty
    currentPage.drawText(formatAngka(item.quantity), {
      x: colX.qty + 6,
      y: itemY,
      size: 8.5,
      font: fontRegular,
      color: textColor,
    });

    // Unit
    currentPage.drawText(cleanWinAnsi(item.unit) || '-', {
      x: colX.unit + 6,
      y: itemY,
      size: 8.5,
      font: fontRegular,
      color: textColor,
    });

    // Unit Price
    if (isUSD) {
      currentPage.drawText(`$ ${formatAngka(item.unit_price_usd || 0)}`, {
        x: colX.price + 6,
        y: itemY,
        size: 8.5,
        font: fontBold,
        color: textColor,
      });
      currentPage.drawText(`(${formatRupiah(item.unit_price)})`, {
        x: colX.price + 6,
        y: itemY - 11,
        size: 7,
        font: fontRegular,
        color: mutedColor,
      });
    } else {
      currentPage.drawText(formatRupiah(item.unit_price), {
        x: colX.price + 6,
        y: itemY,
        size: 8.5,
        font: fontRegular,
        color: textColor,
      });
    }

    // Item Total
    if (isUSD) {
      currentPage.drawText(formatRupiah(item.total), {
        x: colX.total + 6,
        y: itemY,
        size: 8.5,
        font: fontBold,
        color: textColor,
      });
      const totUsd = item.total_usd || (item.quantity * (item.unit_price_usd || 0));
      currentPage.drawText(`($ ${formatAngka(totUsd)})`, {
        x: colX.total + 6,
        y: itemY - 11,
        size: 7,
        font: fontBold,
        color: rgb(0.08, 0.45, 0.25),
      });
    } else {
      currentPage.drawText(formatRupiah(item.total), {
        x: colX.total + 6,
        y: itemY,
        size: 8.5,
        font: fontBold,
        color: textColor,
      });
    }

    y -= rowHeight;
  });

  // Bottom table line
  currentPage.drawLine({
    start: { x: margin, y: y + 4 },
    end: { x: pageWidth - margin, y: y + 4 },
    thickness: 1,
    color: borderColor,
  });

  y -= 12;

  // Check break for Totals & Terbilang section
  checkPageBreak(160);

  // Terbilang box on left, Summary numbers on right
  const summaryTop = y;
  const leftBoxWidth = contentWidth * 0.56;
  const rightBoxX = margin + leftBoxWidth + 10;
  const rightBoxWidth = contentWidth - leftBoxWidth - 10;

  // Terbilang box
  currentPage.drawRectangle({
    x: margin,
    y: summaryTop - 52,
    width: leftBoxWidth,
    height: 52,
    color: rgb(0.98, 0.98, 0.99),
    borderColor: borderColor,
    borderWidth: 0.5,
  });

  currentPage.drawText('TERBILANG:', {
    x: margin + 8,
    y: summaryTop - 12,
    size: 7.5,
    font: fontBold,
    color: primaryColor,
  });

  const terbilangLines = wrapText(version.terbilang || 'Nol Rupiah', fontOblique, 8.5, leftBoxWidth - 16);
  terbilangLines.slice(0, 3).forEach((line, idx) => {
    currentPage.drawText(line, {
      x: margin + 8,
      y: summaryTop - 24 - idx * 10,
      size: 8.5,
      font: fontOblique,
      color: textColor,
    });
  });

  // If USD items exist, draw an informative exchange rate note box below Terbilang
  const hasUsdItemsInDoc = version.items.some(
    (i) => i.currency === 'USD' || (i.unit_price_usd !== undefined && i.unit_price_usd > 0)
  );
  if (hasUsdItemsInDoc) {
    const totalUsdInDoc = version.items.reduce(
      (s, i) => s + (i.currency === 'USD' ? (Number(i.total_usd) || 0) : 0),
      0
    );
    const kursNoticeY = summaryTop - 52 - 24;

    currentPage.drawRectangle({
      x: margin,
      y: kursNoticeY,
      width: leftBoxWidth,
      height: 20,
      color: rgb(0.96, 0.98, 0.96),
      borderColor: rgb(0.75, 0.88, 0.78),
      borderWidth: 0.5,
    });

    const ratesSummary = getExchangeRatesSummary(version.items, version.custom_exchange_rate);
    currentPage.drawText(
      cleanWinAnsi(`* Kurs Valas: ${ratesSummary} | Komponen Valas: $ ${formatAngka(totalUsdInDoc)}`),
      {
        x: margin + 8,
        y: kursNoticeY + 6,
        size: 7.2,
        font: fontBold,
        color: rgb(0.08, 0.45, 0.25),
      }
    );
  }

  // Right side: Subtotal, Discount, Tax, Grand Total
  let rightY = summaryTop - 4;
  const drawSummaryLine = (label: string, value: string, isBold: boolean = false, isHighlight: boolean = false) => {
    if (isHighlight) {
      currentPage.drawRectangle({
        x: rightBoxX - 4,
        y: rightY - 4,
        width: rightBoxWidth + 4,
        height: 18,
        color: rgb(0.94, 0.96, 1.0),
      });
    }

    currentPage.drawText(label, {
      x: rightBoxX,
      y: rightY,
      size: isHighlight ? 9 : 8.5,
      font: isBold ? fontBold : fontRegular,
      color: isHighlight ? primaryColor : mutedColor,
    });

    const valWidth = (isBold ? fontBold : fontRegular).widthOfTextAtSize(value, isHighlight ? 9.5 : 8.5);
    currentPage.drawText(value, {
      x: pageWidth - margin - valWidth,
      y: rightY,
      size: isHighlight ? 9.5 : 8.5,
      font: isBold ? fontBold : fontRegular,
      color: isHighlight ? primaryColor : textColor,
    });

    rightY -= 15;
  };

  drawSummaryLine('Subtotal', formatRupiah(version.subtotal));

  if (version.discount_amount > 0) {
    const label =
      version.discount_type === 'percent'
        ? `Diskon (${version.discount_value}%)`
        : 'Diskon (Nominal)';
    drawSummaryLine(label, `- ${formatRupiah(version.discount_amount)}`);
  }

  if (version.tax_enabled) {
    drawSummaryLine(`Pajak (${version.tax_rate}%)`, `+ ${formatRupiah(version.tax_amount)}`);
  }

  rightY -= 2;
  drawSummaryLine('Grand Total', formatRupiah(version.grand_total), true, true);

  // Exact bottom coordinate of the summary section (accounts for Kurs Valas notice if USD exists)
  const leftSummaryBottom = hasUsdItemsInDoc ? summaryTop - 52 - 26 : summaryTop - 52;
  const totalsSectionBottom = Math.min(leftSummaryBottom, rightY - 8);
  y = totalsSectionBottom - 10;

  // Divider line after summary
  currentPage.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 0.5,
    color: borderColor,
  });
  y -= 14;

  // General Clause / Klausul Umum Section (Rendered UTUH / Complete)
  let rawClauses = version.general_clauses || [];
  if (rawClauses.length === 0 && version.client_notes && version.client_notes.includes('Item tambahan akan dikenakan biaya tambahan')) {
    rawClauses = [
      {
        id: 'clause-default-1',
        title: 'General Clause',
        content: '1. Item tambahan akan dikenakan biaya tambahan\n2. Biaya Tambahan akan ditagih langsung, di luar tagihan utama',
        is_active: true,
      },
    ];
  }
  const activeClauses = rawClauses.filter((c) => c.is_active !== false);

  if (activeClauses.length > 0) {
    checkPageBreak(45);

    currentPage.drawText('GENERAL CLAUSE:', {
      x: margin,
      y,
      size: 8.5,
      font: fontBold,
      color: primaryColor,
    });
    y -= 12;

    for (let cIdx = 0; cIdx < activeClauses.length; cIdx++) {
      const clause = activeClauses[cIdx];
      const isDefaultFirst = cIdx === 0 && (!clause.title || clause.title.toLowerCase().includes('general clause'));
      const cTitle = cleanWinAnsi(isDefaultFirst ? '' : (clause.title ? `${cIdx + 1}. ${clause.title}:` : `${cIdx + 1}.`));
      const cLines = wrapText(clause.content, fontRegular, 8, contentWidth - 28);
      const clauseNeededHeight = (cTitle ? 12 : 0) + cLines.length * 10 + 4;
      checkPageBreak(clauseNeededHeight);

      if (cTitle) {
        currentPage.drawText(cTitle, {
          x: margin + 6,
          y,
          size: 8,
          font: fontBold,
          color: textColor,
        });
        y -= 11;
      }

      for (const cLine of cLines) {
        currentPage.drawText(cLine, {
          x: margin + 6,
          y,
          size: 8,
          font: fontRegular,
          color: textColor,
        });
        y -= 10;
      }
      y -= 3;
    }

    y -= 4;
    currentPage.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.5,
      color: borderColor,
    });
    y -= 14;
  }

  // Payment Info (Left Column) & Hormat Kami / Creator Signature (Right Column)
  const leftColWidth = contentWidth * 0.55;
  const rightColX = margin + leftColWidth + 20;
  const rightColWidth = contentWidth - leftColWidth - 20;

  const termsLines = version.payment_terms
    ? wrapText(version.payment_terms, fontRegular, 7.5, leftColWidth)
    : [];

  const isNotesDuplicateOfClause = Boolean(
    version.client_notes &&
      (version.client_notes.includes('Item tambahan akan dikenakan biaya tambahan') ||
        version.client_notes.trim().toLowerCase() === 'general clause')
  );

  const notesLines = version.client_notes && !isNotesDuplicateOfClause
    ? wrapText(version.client_notes, fontRegular, 7.5, leftColWidth)
    : [];

  const neededLeftHeight = 55 + (termsLines.length > 0 ? 12 + termsLines.length * 9 : 0) + (notesLines.length > 0 ? 12 + notesLines.length * 9 : 0);
  const neededRightHeight = 65;
  checkPageBreak(Math.max(neededLeftHeight, neededRightHeight));

  const sectionStartY = y;

  // --- Left Column: Bank Account & Payment Terms / Full Notes ---
  let lY = sectionStartY;
  const bank = version.bank_snapshot;
  currentPage.drawText('REKENING PEMBAYARAN RESMI:', {
    x: margin,
    y: lY,
    size: 8,
    font: fontBold,
    color: primaryColor,
  });
  lY -= 12;

  currentPage.drawText(cleanWinAnsi(`Bank: ${bank?.bank_name || '-'}`), {
    x: margin,
    y: lY,
    size: 8.5,
    font: fontRegular,
    color: textColor,
  });
  lY -= 11;

  currentPage.drawText(cleanWinAnsi(`Nomor Rekening: ${bank?.account_number || '-'}`), {
    x: margin,
    y: lY,
    size: 9,
    font: fontBold,
    color: primaryColor,
  });
  lY -= 11;

  currentPage.drawText(cleanWinAnsi(`Atas Nama: ${bank?.account_name || '-'}`), {
    x: margin,
    y: lY,
    size: 8.5,
    font: fontRegular,
    color: textColor,
  });

  if (version.payment_terms && termsLines.length > 0) {
    lY -= 11;
    currentPage.drawText('Ketentuan Pembayaran:', {
      x: margin,
      y: lY,
      size: 7.5,
      font: fontBold,
      color: mutedColor,
    });
    for (const tLine of termsLines) {
      lY -= 9;
      currentPage.drawText(tLine, { x: margin, y: lY, size: 7.5, font: fontRegular, color: mutedColor });
    }
  }

  if (version.client_notes && notesLines.length > 0) {
    lY -= 11;
    currentPage.drawText('Catatan:', {
      x: margin,
      y: lY,
      size: 7.5,
      font: fontBold,
      color: mutedColor,
    });
    for (const nLine of notesLines) {
      lY -= 9;
      currentPage.drawText(nLine, { x: margin, y: lY, size: 7.5, font: fontRegular, color: mutedColor });
    }
  }

  // --- Right Column: Hormat Kami & Creator Signature Alone (No Digital/Marcomm, No Pembuat Invoice caption) ---
  let rY = sectionStartY;

  currentPage.drawText('Hormat Kami,', {
    x: rightColX,
    y: rY,
    size: 8.5,
    font: fontRegular,
    color: mutedColor,
  });
  rY -= 45; // Space for signature / stamp

  const rawCreator = createdByName || version.created_by_name || 'Riskha Ziaulhusna';
  const cleanCreator = cleanWinAnsi(
    rawCreator.replace(/\s*\((Owner|Admin|Staff|Viewer)\)/gi, '').trim()
  );

  currentPage.drawText(`( ${cleanCreator} )`, {
    x: rightColX,
    y: rY,
    size: 8.5,
    font: fontBold,
    color: textColor,
  });
  rY -= 8;

  // Move y to the bottom of the lowest column
  y = Math.min(lY, rY) - 16;

  // Lampiran Dokumen Resmi (Attachments) on Invoice PDF
  const attachments = customAttachments || version.attachments || [];
  if (attachments.length > 0) {
    const neededAttHeight = 35 + Math.min(attachments.length, 6) * 16;
    checkPageBreak(neededAttHeight);

    y -= 4;
    currentPage.drawText(`LAMPIRAN DOKUMEN PENDUKUNG (${attachments.length} BERKAS):`, {
      x: margin,
      y,
      size: 8,
      font: fontBold,
      color: primaryColor,
    });
    y -= 10;

    const attBoxX = margin;
    const attBoxWidth = contentWidth;

    // Table Header
    currentPage.drawRectangle({
      x: attBoxX,
      y: y - 14,
      width: attBoxWidth,
      height: 14,
      color: rgb(0.95, 0.96, 0.98),
      borderColor: borderColor,
      borderWidth: 0.5,
    });

    currentPage.drawText('NO', { x: attBoxX + 6, y: y - 10, size: 7, font: fontBold, color: mutedColor });
    currentPage.drawText('KATEGORI', { x: attBoxX + 26, y: y - 10, size: 7, font: fontBold, color: mutedColor });
    currentPage.drawText('NAMA DOKUMEN / BERKAS', { x: attBoxX + 115, y: y - 10, size: 7, font: fontBold, color: mutedColor });
    currentPage.drawText('UKURAN / KETERANGAN', { x: attBoxX + attBoxWidth - 140, y: y - 10, size: 7, font: fontBold, color: mutedColor });
    y -= 14;

    attachments.forEach((att, idx) => {
      checkPageBreak(16);
      const isEven = idx % 2 === 0;
      currentPage.drawRectangle({
        x: attBoxX,
        y: y - 15,
        width: attBoxWidth,
        height: 15,
        color: isEven ? rgb(1, 1, 1) : rgb(0.985, 0.985, 0.99),
        borderColor: borderColor,
        borderWidth: 0.5,
      });

      // No
      currentPage.drawText(`${idx + 1}.`, {
        x: attBoxX + 6,
        y: y - 11,
        size: 7.5,
        font: fontRegular,
        color: textColor,
      });

      // Category
      const catLabel = att.category ? `[${att.category}]` : '[BERKAS]';
      currentPage.drawText(cleanWinAnsi(catLabel), {
        x: attBoxX + 26,
        y: y - 11,
        size: 7,
        font: fontBold,
        color: primaryColor,
      });

      // Name
      const fileNameTrunc = att.name.length > 40 ? att.name.substring(0, 37) + '...' : att.name;
      currentPage.drawText(cleanWinAnsi(fileNameTrunc), {
        x: attBoxX + 115,
        y: y - 11,
        size: 7.5,
        font: fontRegular,
        color: textColor,
      });

      // Description / Size
      const sizeStr = att.size ? `${(att.size / 1024).toFixed(0)} KB` : '';
      const descStr = att.description ? `${att.description} ${sizeStr ? `(${sizeStr})` : ''}` : sizeStr || 'Terlampir resmi';
      const descTrunc = descStr.length > 28 ? descStr.substring(0, 25) + '...' : descStr;
      currentPage.drawText(cleanWinAnsi(descTrunc), {
        x: attBoxX + attBoxWidth - 140,
        y: y - 11,
        size: 7,
        font: fontOblique,
        color: mutedColor,
      });

      y -= 15;
    });
  } else {
    y -= 4;
    currentPage.drawText('Lampiran Dokumen: - (Tidak ada berkas pendukung terlampir)', {
      x: margin,
      y,
      size: 7.5,
      font: fontOblique,
      color: mutedColor,
    });
    y -= 10;
  }

  // Footer on all pages
  const totalPages = pdfDoc.getPageCount();
  pdfDoc.getPages().forEach((page, index) => {
    page.drawText(
      `Dokumen resmi dibuat secara digital. Halaman ${index + 1} dari ${totalPages}`,
      {
        x: margin,
        y: 18,
        size: 7.5,
        font: fontRegular,
        color: rgb(0.55, 0.6, 0.65),
      }
    );
  });

  return pdfDoc.save();
}
