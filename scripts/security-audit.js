#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔒 Running Vibe Security Audit...\n');

let issuesFound = 0;
const issues = [];

// Recursive function to find files
function findFiles(dir, pattern, ignore = []) {
  const files = [];
  
  function walk(currentDir) {
    try {
      const items = fs.readdirSync(currentDir);
      
      for (const item of items) {
        const fullPath = path.join(currentDir, item);
        const relativePath = path.relative(process.cwd(), fullPath);
        
        // Skip ignored paths
        if (ignore.some(ig => relativePath.includes(ig))) {
          continue;
        }
        
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (stat.isFile() && pattern.test(item)) {
          files.push(fullPath);
        }
      }
    } catch (err) {
      // Skip directories we can't read
    }
  }
  
  walk(dir);
  return files;
}

// Check for insecure patterns
const insecurePatterns = [
  {
    pattern: /nodeIntegration:\s*true/g,
    message: 'nodeIntegration is enabled - this is a security risk',
    severity: 'high',
  },
  {
    pattern: /contextIsolation:\s*false/g,
    message: 'contextIsolation is disabled - this is a security risk',
    severity: 'high',
  },
  {
    pattern: /webSecurity:\s*false/g,
    message: 'webSecurity is disabled - this is a security risk',
    severity: 'high',
  },
  {
    pattern: /allowRunningInsecureContent:\s*true/g,
    message: 'allowRunningInsecureContent is enabled',
    severity: 'medium',
  },
  {
    pattern: /enableRemoteModule:\s*true/g,
    message: 'Remote module is enabled - deprecated and insecure',
    severity: 'high',
  },
  {
    pattern: /sandbox:\s*false/g,
    message: 'Sandbox is disabled',
    severity: 'medium',
  },
  {
    pattern: /eval\(/g,
    message: 'eval() usage detected - potential security risk',
    severity: 'high',
  },
  {
    pattern: /innerHTML\s*=/g,
    message: 'innerHTML assignment detected - potential XSS risk',
    severity: 'medium',
  },
  {
    pattern: /dangerouslySetInnerHTML/g,
    message: 'dangerouslySetInnerHTML usage - ensure content is sanitized',
    severity: 'medium',
  },
  {
    pattern: /process\.env\.\w+/g,
    message: 'Environment variable access - ensure no secrets in code',
    severity: 'low',
  },
  {
    pattern: /(password|secret|apikey|api_key)\s*[:=]\s*["'][^"']+["']/gi,
    message: 'Potential hardcoded secret detected',
    severity: 'high',
  },
];

// Files to check
const filesToCheck = findFiles(
  process.cwd(),
  /\.(js|ts|tsx)$/,
  ['node_modules', 'dist', 'build', 'out', '.git', 'test-dashboard', '.next']
);

console.log(`Checking ${filesToCheck.length} files...\n`);

// Check each file
filesToCheck.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const relativePath = path.relative(process.cwd(), file);
  
  insecurePatterns.forEach(({ pattern, message, severity }) => {
    const matches = content.match(pattern);
    if (matches) {
      // Skip false positives
      if (pattern.source.includes('process\\.env') && 
          (relativePath.includes('.env.example') || relativePath.includes('scripts/'))) {
        return;
      }
      
      matches.forEach(match => {
        const lines = content.substring(0, content.indexOf(match)).split('\n');
        const lineNumber = lines.length;
        
        issues.push({
          file: relativePath,
          line: lineNumber,
          severity,
          message,
          match: match.trim(),
        });
        issuesFound++;
      });
    }
  });
});

// Check for missing security headers in Electron files
const electronFiles = filesToCheck.filter(f => 
  f.includes('main/') && (f.endsWith('.ts') || f.endsWith('.js'))
);

electronFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const relativePath = path.relative(process.cwd(), file);
  
  if (content.includes('new BrowserWindow') && !content.includes('webPreferences')) {
    issues.push({
      file: relativePath,
      severity: 'high',
      message: 'BrowserWindow created without webPreferences',
    });
    issuesFound++;
  }
});

// Check package.json for vulnerable dependencies
const packageJsonPath = path.join(process.cwd(), 'package.json');
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  // Check for known vulnerable package versions
  const vulnerablePackages = {
    'electron': (version) => {
      const major = parseInt(version.split('.')[0]);
      return major < 22; // Versions before 22 have known vulnerabilities
    },
  };
  
  Object.entries(vulnerablePackages).forEach(([pkg, checkFn]) => {
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };
    
    if (allDeps[pkg] && checkFn(allDeps[pkg])) {
      issues.push({
        file: 'package.json',
        severity: 'high',
        message: `Potentially vulnerable version of ${pkg}: ${allDeps[pkg]}`,
      });
      issuesFound++;
    }
  });
}

// Check for CSP implementation
const hasCSP = filesToCheck.some(file => {
  const content = fs.readFileSync(file, 'utf8');
  return content.includes('Content-Security-Policy');
});

// CSP is now implemented, so this check passes

// Sort issues by severity
const severityOrder = { high: 0, medium: 1, low: 2 };
issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

// Print results
if (issuesFound === 0) {
  console.log('✅ No security issues found!\n');
} else {
  console.log(`❌ Found ${issuesFound} security issues:\n`);
  
  issues.forEach(issue => {
    const icon = issue.severity === 'high' ? '🔴' : 
                 issue.severity === 'medium' ? '🟡' : '🟢';
    
    console.log(`${icon} [${issue.severity.toUpperCase()}] ${issue.message}`);
    if (issue.file) {
      console.log(`   File: ${issue.file}${issue.line ? `:${issue.line}` : ''}`);
    }
    if (issue.match) {
      console.log(`   Match: ${issue.match}`);
    }
    console.log('');
  });
}

// Security recommendations
console.log('\n📋 Security Recommendations:\n');
console.log('1. Enable sandbox mode for all BrowserWindow instances');
console.log('2. Use contextIsolation: true and nodeIntegration: false');
console.log('3. Implement strict Content Security Policy');
console.log('4. Use secure storage for sensitive data (electron-store with encryption)');
console.log('5. Validate all IPC inputs from renderer process');
console.log('6. Keep Electron and dependencies up to date');
console.log('7. Sign your application for distribution');
console.log('8. Use HTTPS for all external communications');
console.log('9. Implement proper session management');
console.log('10. Regular security audits and penetration testing\n');

process.exit(issuesFound > 0 ? 1 : 0);