declare module '@novnc/novnc' {
  export default class RFB extends EventTarget {
    constructor(
      target: HTMLElement,
      url: string,
      options?: {
        credentials?: { username?: string; password?: string; target?: string };
        shared?: boolean;
        wsProtocols?: string[];
      },
    );
    viewOnly: boolean;
    scaleViewport: boolean;
    resizeSession: boolean;
    qualityLevel: number;
    compressionLevel: number;
    showDotCursor: boolean;
    background: string;
    readonly capabilities: { power: boolean; clipboard: boolean; resize: boolean };
    disconnect(): void;
    sendCredentials(creds: { username?: string; password?: string; target?: string }): void;
    sendCtrlAltDel(): void;
    machineReboot(): void;
    machineShutdown(): void;
    clipboardPasteFrom(text: string): void;
  }
}
