/** Word documents, parsed in the browser with mammoth. */
export async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
