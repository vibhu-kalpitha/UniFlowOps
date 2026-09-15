type ScanCallback = (barcode: string) => void;

class ScannerService {
  private listeners: Set<ScanCallback> = new Set();
  private keyBuffer: string = '';
  private lastKeyTime: number = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.handleKeyDown.bind(this));
    }
  }

  public subscribe(callback: ScanCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  public emitScan(barcode: string): void {
    this.listeners.forEach(cb => cb(barcode));
  }

  public generateMockItemQR(): string {
    const randomDigits = Math.floor(100000000 + Math.random() * 900000000);
    return `PNFLS09${randomDigits.toString().substring(0, 8)}`;
  }

  public generateMockBoxQR(): string {
    const num = Math.floor(200 + Math.random() * 100);
    return `BX-000${num}`;
  }

  private handleKeyDown(e: KeyboardEvent): void {
    // Ignore input events inside form inputs unless barcode scanner prefix
    const target = e.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
      return;
    }

    const now = Date.now();
    // If typing fast (< 80ms between keys), assume barcode scanner keyboard wedge
    if (now - this.lastKeyTime > 150) {
      this.keyBuffer = '';
    }
    this.lastKeyTime = now;

    if (e.key === 'Enter') {
      if (this.keyBuffer.trim().length > 3) {
        this.emitScan(this.keyBuffer.trim());
        this.keyBuffer = '';
      }
    } else if (e.key.length === 1) {
      this.keyBuffer += e.key;
    }
  }
}

export const scannerService = new ScannerService();
