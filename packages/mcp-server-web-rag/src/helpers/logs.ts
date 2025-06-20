const colors = {
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
  gray: '\x1b[90m'
};

export const logger = (namespace: string) => {
  const formatArgs = (...args: any[]) => {
    const timestamp = new Date().toISOString();
    return [timestamp, `[${namespace}]`, ...args].map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg
    );
  };

  const log = (color: string, level: string, ...args: any[]) => {
    const formatted = formatArgs(...args);
    console.log(color + level + colors.reset, colors.gray + formatted[0] + colors.reset, formatted[1], ...formatted.slice(2));
  };

  return {
    info(...args: any[]) {
      log(colors.cyan, 'INFO', ...args);
    },
    success(...args: any[]) {
      log(colors.green, 'SUCCESS', ...args);
    },
    warn(...args: any[]) {
      log(colors.yellow, 'WARN', ...args);
    },
    error(...args: any[]) {
      log(colors.red, 'ERROR', ...args);
    }
  };
}; 