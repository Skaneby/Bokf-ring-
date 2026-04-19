import { GoogleGenerativeAI } from '@google/generative-ai';

export interface ReceiptData {
  date?: string;        // YYYY-MM-DD
  amount?: number;      // inkl. moms
  vatRate?: 0 | 6 | 12 | 25;
  vendor?: string;
}

export async function scanReceipt(file: File): Promise<ReceiptData> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY saknas');

  const base64 = await toBase64(file);
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `Du är en assistent som läser kvitton och fakturor.
Analysera bilden och extrahera följande information i JSON-format:
{
  "date": "YYYY-MM-DD eller null",
  "amount": totalbelopp inklusive moms som nummer eller null,
  "vatRate": momssats i procent (0, 6, 12 eller 25) eller null,
  "vendor": leverantörens namn eller null
}
Svara ENBART med giltig JSON, ingen annan text.`;

  const result = await model.generateContent([
    prompt,
    { inlineData: { mimeType: file.type as any, data: base64 } },
  ]);

  const text = result.response.text().trim().replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(text);

  return {
    date:    isValidDate(parsed.date) ? parsed.date : undefined,
    amount:  typeof parsed.amount === 'number' ? parsed.amount : undefined,
    vatRate: [0, 6, 12, 25].includes(parsed.vatRate) ? parsed.vatRate : undefined,
    vendor:  typeof parsed.vendor === 'string' ? parsed.vendor : undefined,
  };
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isValidDate(val: unknown): val is string {
  return typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val);
}
