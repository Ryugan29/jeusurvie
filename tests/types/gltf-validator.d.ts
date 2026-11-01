// Types minimaux du paquet gltf-validator (qui n'en fournit pas), pour le test des assets.
declare module 'gltf-validator' {
  export interface ValidationReport {
    readonly issues: {
      readonly numErrors: number;
      readonly numWarnings: number;
      readonly messages: readonly { readonly code: string; readonly message: string; readonly severity: number; readonly pointer?: string }[];
    };
    readonly info?: { readonly totalTriangleCount?: number };
  }
  export function validateBytes(
    data: Uint8Array,
    options?: {
      readonly uri?: string;
      readonly maxIssues?: number;
      readonly externalResourceFunction?: (uri: string) => Promise<Uint8Array>;
    },
  ): Promise<ValidationReport>;
}
