/** Text extraction for submission files, reusing the ingest parsers directly. */
export async function readSubmissionText(file: File): Promise<string> {
  const e = (file.name.split(".").pop() ?? "").toLowerCase();
  if (e === "docx") {
    const { extractDocxText } = await import("@lib/ingest/docx");
    return (await extractDocxText(file)).trim();
  }
  if (e === "pdf") {
    const { extractPdfText } = await import("@lib/ingest/pdf");
    return (await extractPdfText(file)).trim();
  }
  if (!["txt", "md", "markdown", "text", ""].includes(e)) throw new Error(`Unsupported file type .${e}`);
  return (await file.text()).replace(/\r\n/g, "\n").trim();
}

export const SUBMISSION_ACCEPT = ".docx,.pdf,.txt,.md";
