export class Logger {
  private static enabled: boolean = false;
  private static logs: { timestamp: string; level: string; message: string; data?: any }[] = [];

  static setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  static isEnabled(): boolean {
    return this.enabled;
  }

  static debug(message: string, data?: any) {
    this.log("DEBUG", message, data);
  }

  static info(message: string, data?: any) {
    this.log("INFO", message, data);
  }

  static warn(message: string, data?: any) {
    this.log("WARN", message, data);
    console.warn(`[CitationManager:WARN] ${message}`, data !== undefined ? data : "");
  }

  static error(message: string, data?: any) {
    this.log("ERROR", message, data);
    console.error(`[CitationManager:ERROR] ${message}`, data !== undefined ? data : "");
  }

  private static log(level: string, message: string, data?: any) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data: data !== undefined ? (typeof data === 'object' ? JSON.parse(JSON.stringify(data, this.getCircularReplacer())) : data) : undefined,
    };
    this.logs.push(entry);
    if (this.logs.length > 500) this.logs.shift();

    if (this.enabled) {
      console.log(`[CitationManager:${level}] ${message}`, data !== undefined ? data : "");
    }
  }

  static getRecentLogs(): string {
    return this.logs.map(l => `[${l.timestamp}] [${l.level}] ${l.message} ${l.data ? JSON.stringify(l.data) : ""}`).join("\n");
  }

  private static getCircularReplacer() {
    const seen = new WeakSet();
    return (key: string, value: any) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) {
          return "[Circular]";
        }
        seen.add(value);
      }
      return value;
    };
  }
}
