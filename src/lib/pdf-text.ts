import { extractText, getDocumentProxy } from "unpdf";

/**
 * Extracts text page by page. Runs in the browser for the UI (so large PDFs
 * never hit the host's upload size limit) and on the server for API callers
 * who post a PDF file directly.
 */
export async function extractPages(data: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: false });
  return text;
}
