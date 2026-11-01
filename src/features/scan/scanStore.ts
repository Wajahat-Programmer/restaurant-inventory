import { create } from 'zustand';

/** A scanned code on its way from the scan screen back to the form that asked for it. */
export const useScanStore = create<{ code: string | null; deliver: (code: string) => void; take: () => string | null }>(
  (set, get) => ({
    code: null,
    deliver: code => set({ code }),
    take: () => {
      const code = get().code;
      if (code !== null) {
        set({ code: null });
      }
      return code;
    },
  }),
);

/** What the camera should look for: the common shop barcodes, plus QR codes. */
export const CODE_TYPES = ['ean-13', 'ean-8', 'upc-a', 'upc-e', 'code-128', 'code-39', 'qr'] as const;
