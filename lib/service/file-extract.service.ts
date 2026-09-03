import { extractTextFromBuffer } from "@/lib/jd/extract-document-text";

export const fileExtractService = {
  parseTextFromFile: async (
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> => {
    return extractTextFromBuffer(buffer, mimeType);
  },
};
