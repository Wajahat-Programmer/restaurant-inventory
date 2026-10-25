import { generatePDF } from 'react-native-html-to-pdf';
import { shareFile } from '../files/fileTools';

/** Turns a report page into a PDF on the phone and opens the share sheet for it. */
export async function sharePdf(html: string, fileName: string): Promise<string> {
  const { filePath } = await generatePDF({
    html,
    fileName: fileName.replace(/\.pdf$/i, ''),
    width: 595, // A4 at 72 dpi
    height: 842,
    padding: 24,
    shouldPrintBackgrounds: true,
  });
  await shareFile(filePath, 'application/pdf');
  return filePath;
}
