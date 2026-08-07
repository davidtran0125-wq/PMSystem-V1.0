import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PurchaseOrderStatus } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import type { AuthUser } from '../../common/decorators';

/**
 * PDFKit's built-in fonts are WinAnsi and drop Vietnamese diacritics silently,
 * so the document embeds Roboto (Apache-2.0) shipped under assets/fonts.
 * `__dirname` points at dist/ at runtime and src/ under ts-node, hence the
 * two candidate paths.
 */
const FONT_DIRS = [
  join(__dirname, '..', '..', '..', 'assets', 'fonts'),
  join(process.cwd(), 'assets', 'fonts'),
];

function fontPath(file: string): string {
  for (const dir of FONT_DIRS) {
    const candidate = join(dir, file);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Không tìm thấy font ${file}. Kiểm tra thư mục apps/api/assets/fonts.`,
  );
}

/** dd/MM/yyyy — toLocaleDateString('vi-VN') bỏ số 0 đứng đầu. */
function viDate(value: Date): string {
  const d = String(value.getDate()).padStart(2, '0');
  const m = String(value.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${value.getFullYear()}`;
}

const MARGIN = 40;
const PAGE_WIDTH = 595.28; // A4 portrait
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

@Injectable()
export class PurchaseOrderPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Nhà cung cấp chỉ được tải PDF đơn hàng của chính mình, và chỉ sau khi đơn
   * đã phát hành — cùng ràng buộc như khi xem chi tiết đơn hàng.
   */
  async render(
    id: string,
    user: AuthUser,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, deletedAt: null },
      include: {
        supplier: true,
        buyer: { select: { fullName: true, email: true, phone: true } },
        purchaseRequest: { select: { code: true, title: true } },
        rfq: { select: { code: true } },
        items: { orderBy: { lineNo: 'asc' } },
      },
    });
    if (!po) throw new NotFoundException('Không tìm thấy đơn hàng');

    if (user.supplierId) {
      if (po.supplierId !== user.supplierId) {
        throw new ForbiddenException('Bạn không xem được đơn hàng này');
      }
      if (po.status === PurchaseOrderStatus.DRAFT) {
        throw new ForbiddenException('Đơn hàng này chưa được phát hành');
      }
    }

    const company = await this.settings.company();
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      bufferPages: true,
    });

    doc.registerFont('body', fontPath('Roboto-Regular.ttf'));
    doc.registerFont('bold', fontPath('Roboto-Bold.ttf'));
    doc.font('body');

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve) =>
      doc.on('end', () => resolve(Buffer.concat(chunks))),
    );

    this.header(doc, company, po);
    this.parties(doc, company, po);
    this.itemsTable(doc, po);
    this.totals(doc, po);
    this.terms(doc, po);
    this.signatures(doc, company, po);
    this.pageNumbers(doc);

    doc.end();
    return { buffer: await done, filename: `${po.code}.pdf` };
  }

  // ---------------------------------------------------------------- sections

  private header(
    doc: PDFKit.PDFDocument,
    company: {
      name: string;
      taxCode: string;
      address: string;
      phone: string;
      email: string;
    },
    po: { code: string; createdAt: Date; issuedAt: Date | null },
  ) {
    doc
      .font('bold')
      .fontSize(14)
      .text(company.name.toUpperCase(), MARGIN, MARGIN);
    doc.font('body').fontSize(8.5);
    const lines = [
      company.address,
      [
        company.phone && `ĐT: ${company.phone}`,
        company.email && `Email: ${company.email}`,
      ]
        .filter(Boolean)
        .join('   '),
      company.taxCode && `MST: ${company.taxCode}`,
    ].filter(Boolean);
    lines.forEach((line) => doc.text(line, { width: CONTENT_WIDTH * 0.6 }));

    doc
      .font('bold')
      .fontSize(18)
      .text('ĐƠN ĐẶT HÀNG', MARGIN, MARGIN + 8, {
        width: CONTENT_WIDTH,
        align: 'right',
      });
    doc.font('body').fontSize(9);
    doc.text(`Số: ${po.code}`, { width: CONTENT_WIDTH, align: 'right' });
    doc.text(`Ngày: ${viDate(po.issuedAt ?? po.createdAt)}`, {
      width: CONTENT_WIDTH,
      align: 'right',
    });

    doc.moveDown(0.8);
    const y = doc.y;
    doc
      .moveTo(MARGIN, y)
      .lineTo(PAGE_WIDTH - MARGIN, y)
      .lineWidth(1)
      .stroke('#0f766e');
    doc.moveDown(0.8);
  }

  private parties(
    doc: PDFKit.PDFDocument,
    company: { name: string },
    po: {
      supplier: {
        companyName: string;
        taxCode: string | null;
        address: string | null;
        contactPerson: string | null;
        phone: string | null;
        email: string;
      };
      buyer: { fullName: string; email: string; phone: string | null };
      deliveryAddress: string | null;
      deliveryDate: Date | null;
      purchaseRequest: { code: string };
      rfq: { code: string } | null;
    },
  ) {
    const top = doc.y;
    const colWidth = CONTENT_WIDTH / 2 - 10;

    doc.font('bold').fontSize(9.5).text('NHÀ CUNG CẤP', MARGIN, top);
    doc.font('body').fontSize(9);
    [
      po.supplier.companyName,
      po.supplier.address,
      po.supplier.taxCode && `MST: ${po.supplier.taxCode}`,
      po.supplier.contactPerson && `Liên hệ: ${po.supplier.contactPerson}`,
      [po.supplier.phone, po.supplier.email].filter(Boolean).join(' · '),
    ]
      .filter(Boolean)
      .forEach((line) =>
        doc.text(String(line), MARGIN, doc.y, { width: colWidth }),
      );

    const leftBottom = doc.y;

    const rightX = MARGIN + CONTENT_WIDTH / 2 + 10;
    doc.font('bold').fontSize(9.5).text('GIAO HÀNG ĐẾN', rightX, top);
    doc.font('body').fontSize(9);
    [
      company.name,
      po.deliveryAddress,
      po.deliveryDate && `Ngày giao: ${viDate(po.deliveryDate)}`,
      `Người phụ trách: ${po.buyer.fullName}`,
      [po.buyer.phone, po.buyer.email].filter(Boolean).join(' · '),
      `Từ yêu cầu: ${po.purchaseRequest.code}${po.rfq ? ` · ${po.rfq.code}` : ''}`,
    ]
      .filter(Boolean)
      .forEach((line) =>
        doc.text(String(line), rightX, doc.y, { width: colWidth }),
      );

    doc.y = Math.max(leftBottom, doc.y) + 14;
  }

  private itemsTable(
    doc: PDFKit.PDFDocument,
    po: {
      currency: string;
      items: {
        lineNo: number;
        name: string;
        specification: string | null;
        quantity: unknown;
        unit: string;
        unitPrice: unknown;
        lineTotal: unknown;
      }[];
    },
  ) {
    const cols = [
      { key: 'no', label: 'STT', width: 30, align: 'center' as const },
      {
        key: 'name',
        label: 'Hàng hóa / dịch vụ',
        width: 215,
        align: 'left' as const,
      },
      { key: 'qty', label: 'SL', width: 55, align: 'right' as const },
      { key: 'unit', label: 'ĐVT', width: 42, align: 'center' as const },
      { key: 'price', label: 'Đơn giá', width: 90, align: 'right' as const },
      { key: 'total', label: 'Thành tiền', width: 83, align: 'right' as const },
    ];

    const drawHead = () => {
      const y = doc.y;
      doc.rect(MARGIN, y, CONTENT_WIDTH, 20).fill('#e2e8f0');
      doc.fillColor('#000').font('bold').fontSize(8.5);
      let x = MARGIN;
      for (const col of cols) {
        doc.text(col.label, x + 4, y + 6, {
          width: col.width - 8,
          align: col.align,
        });
        x += col.width;
      }
      doc.y = y + 20;
      doc.font('body').fontSize(9);
    };

    drawHead();

    for (const item of po.items) {
      const label = item.specification
        ? `${item.name}\n${item.specification}`
        : item.name;
      const nameHeight = doc.heightOfString(label, {
        width: cols[1].width - 8,
      });
      const rowHeight = Math.max(22, nameHeight + 10);

      // Start a new page before a row that would run off the bottom.
      if (doc.y + rowHeight > doc.page.height - 150) {
        doc.addPage();
        drawHead();
      }

      const y = doc.y;
      const values = [
        String(item.lineNo),
        label,
        this.number(item.quantity),
        item.unit,
        this.number(item.unitPrice),
        this.number(item.lineTotal),
      ];

      let x = MARGIN;
      cols.forEach((col, i) => {
        doc.text(values[i], x + 4, y + 5, {
          width: col.width - 8,
          align: col.align,
        });
        x += col.width;
      });

      doc
        .moveTo(MARGIN, y + rowHeight)
        .lineTo(PAGE_WIDTH - MARGIN, y + rowHeight)
        .lineWidth(0.5)
        .stroke('#cbd5e1');
      doc.y = y + rowHeight;
    }
  }

  private totals(
    doc: PDFKit.PDFDocument,
    po: {
      currency: string;
      subtotal: unknown;
      taxRate: unknown;
      taxAmount: unknown;
      totalAmount: unknown;
    },
  ) {
    doc.moveDown(0.6);
    const labelX = MARGIN + CONTENT_WIDTH - 240;
    const valueWidth = 120;

    const row = (label: string, value: string, bold = false) => {
      doc.font(bold ? 'bold' : 'body').fontSize(bold ? 10.5 : 9);
      const y = doc.y;
      doc.text(label, labelX, y, { width: 120, align: 'right' });
      doc.text(value, labelX + 120, y, { width: valueWidth, align: 'right' });
      doc.moveDown(0.35);
    };

    row('Tạm tính:', `${this.number(po.subtotal)} ${po.currency}`);
    row(
      `Thuế VAT (${this.number(po.taxRate)}%):`,
      `${this.number(po.taxAmount)} ${po.currency}`,
    );
    row('TỔNG CỘNG:', `${this.number(po.totalAmount)} ${po.currency}`, true);
  }

  private terms(
    doc: PDFKit.PDFDocument,
    po: {
      paymentTerm: string | null;
      incoterm: string | null;
      deliveryTerm: string | null;
      warranty: string | null;
      note: string | null;
    },
  ) {
    const entries = [
      ['Điều khoản thanh toán', po.paymentTerm],
      ['Incoterm', po.incoterm],
      ['Điều kiện giao hàng', po.deliveryTerm],
      ['Bảo hành', po.warranty],
      ['Ghi chú', po.note],
    ].filter(([, value]) => Boolean(value)) as [string, string][];

    if (!entries.length) return;

    doc.moveDown(0.8);
    doc.font('bold').fontSize(9.5).text('ĐIỀU KHOẢN', MARGIN, doc.y);
    doc.font('body').fontSize(9).moveDown(0.2);
    for (const [label, value] of entries) {
      doc.text(`• ${label}: ${value}`, MARGIN, doc.y, { width: CONTENT_WIDTH });
    }
  }

  private signatures(
    doc: PDFKit.PDFDocument,
    company: { representative: string; representativeTitle: string },
    po: { supplier: { companyName: string } },
  ) {
    // Keep the signature block whole rather than split across a page break.
    if (doc.y > doc.page.height - 150) doc.addPage();

    const y = Math.max(doc.y + 26, doc.page.height - 150);
    const colWidth = CONTENT_WIDTH / 2;

    doc.font('bold').fontSize(9.5);
    doc.text('ĐẠI DIỆN BÊN MUA', MARGIN, y, {
      width: colWidth,
      align: 'center',
    });
    doc.text('ĐẠI DIỆN NHÀ CUNG CẤP', MARGIN + colWidth, y, {
      width: colWidth,
      align: 'center',
    });

    doc.font('body').fontSize(8).fillColor('#64748b');
    doc.text('(Ký, ghi rõ họ tên)', MARGIN, y + 15, {
      width: colWidth,
      align: 'center',
    });
    doc.text('(Ký, ghi rõ họ tên)', MARGIN + colWidth, y + 15, {
      width: colWidth,
      align: 'center',
    });
    doc.fillColor('#000');

    if (company.representative) {
      doc.font('bold').fontSize(9.5);
      doc.text(company.representative, MARGIN, y + 68, {
        width: colWidth,
        align: 'center',
      });
      if (company.representativeTitle) {
        doc
          .font('body')
          .fontSize(8)
          .text(company.representativeTitle, MARGIN, y + 82, {
            width: colWidth,
            align: 'center',
          });
      }
    }
    doc
      .font('body')
      .fontSize(8)
      .text(po.supplier.companyName, MARGIN + colWidth, y + 68, {
        width: colWidth,
        align: 'center',
      });
  }

  private pageNumbers(doc: PDFKit.PDFDocument) {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc
        .font('body')
        .fontSize(8)
        .fillColor('#64748b')
        .text(
          `Trang ${i - range.start + 1}/${range.count}`,
          MARGIN,
          doc.page.height - 28,
          { width: CONTENT_WIDTH, align: 'center' },
        );
    }
  }

  private number(value: unknown): string {
    return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(
      Number(value ?? 0),
    );
  }
}
