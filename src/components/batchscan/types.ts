import type { ReceiptData } from '../../lib/ocr';

export interface VoucherDraft {
  date: string;
  description: string;
  gross: number;               // brutto inkl. moms
  vatRate: 0 | 6 | 12 | 25;
  vatDir: 'in' | 'out';
  accountId: number;           // kostnadskonto (in) eller intäktskonto (out)
}

export interface ScanItem {
  id: string;
  file: File;
  previewUrl: string;
  status: 'queued' | 'scanning' | 'done' | 'error';
  data?: ReceiptData;
  draft: VoucherDraft;
  selected: boolean;
  errorMsg?: string;
}
