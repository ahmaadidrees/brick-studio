// Browser-only API used by the invitation panel.
declare module 'qrcode' {
  export function toDataURL(text: string, options: { width: number; margin: number }): Promise<string>
}
