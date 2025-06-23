#!/usr/bin/env node
/* eslint-env node */
/* eslint-disable @typescript-eslint/no-require-imports, no-undef, @typescript-eslint/no-unused-vars */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Production Testing Suite for Vibe Electron App
 * Tests packaging, protocol registration, and authentication flow
 */

class ProductionTester {
  constructor() {
    this.results = [];
    this.distPath = path.join(__dirname, 'dist');
    this.packagedPath = path.join(this.distPath, 'linux-unpacked');
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
    console.log(logMessage);
    this.results.push({ timestamp, type, message });
  }

  test(name, testFn) {
    try {
      this.log(`Starting test: ${name}`, 'test');
      testFn();
      this.log(`✅ PASSED: ${name}`, 'pass');
      return true;
    } catch (error) {
      this.log(`❌ FAILED: ${name} - ${error.message}`, 'fail');
      return false;
    }
  }

  async runAllTests() {
    this.log('🚀 Starting Production Test Suite for Vibe Electron App');
    
    let passedTests = 0;
    let totalTests = 0;

    // Test 1: Verify packaging artifacts exist
    if (this.test('Package Artifacts Exist', () => this.testPackageArtifacts())) passedTests++;
    totalTests++;

    // Test 2: Verify AppImage structure
    if (this.test('AppImage Structure', () => this.testAppImageStructure())) passedTests++;
    totalTests++;

    // Test 3: Verify protocol registration
    if (this.test('Protocol Registration', () => this.testProtocolRegistration())) passedTests++;
    totalTests++;

    // Test 4: Test deep-link URL validation
    if (this.test('Deep-link URL Validation', () => this.testDeepLinkUrls())) passedTests++;
    totalTests++;

    // Test 5: Verify authentication components
    if (this.test('Authentication Components', () => this.testAuthComponents())) passedTests++;
    totalTests++;

    // Test 6: Check environment configuration
    if (this.test('Environment Configuration', () => this.testEnvironmentConfig())) passedTests++;
    totalTests++;

    // Test 7: Verify main process services
    if (this.test('Main Process Services', () => this.testMainProcessServices())) passedTests++;
    totalTests++;

    // Test 8: Dashboard connectivity
    if (this.test('Dashboard Connectivity', () => this.testDashboardConnectivity())) passedTests++;
    totalTests++;

    this.log(`\n📊 Test Results: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
      this.log('🎉 All tests passed! Production build is ready.', 'success');
    } else {
      this.log(`⚠️ ${totalTests - passedTests} tests failed. Review issues above.`, 'warning');
    }

    return { passed: passedTests, total: totalTests, results: this.results };
  }

  testPackageArtifacts() {
    const expectedFiles = [
      'vibe-0.1.0.AppImage',
      'vibe_0.1.0_amd64.deb',
      'vibe_0.1.0_amd64.snap'
    ];

    expectedFiles.forEach(file => {
      const filePath = path.join(this.distPath, file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Missing package artifact: ${file}`);
      }
      const stats = fs.statSync(filePath);
      this.log(`✓ Found ${file} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`);
    });

    // Check AppImage is executable
    const appImagePath = path.join(this.distPath, 'vibe-0.1.0.AppImage');
    const stats = fs.statSync(appImagePath);
    if (!(stats.mode & parseInt('111', 8))) {
      throw new Error('AppImage is not executable');
    }
    this.log('✓ AppImage has executable permissions');
  }

  testAppImageStructure() {
    if (!fs.existsSync(this.packagedPath)) {
      throw new Error('linux-unpacked directory not found');
    }

    const expectedStructure = [
      'vibe',  // main executable
      'resources',
      'resources/app.asar'
    ];

    expectedStructure.forEach(item => {
      const itemPath = path.join(this.packagedPath, item);
      if (!fs.existsSync(itemPath)) {
        throw new Error(`Missing in package structure: ${item}`);
      }
      this.log(`✓ Found ${item}`);
    });

    // Check main executable permissions
    const mainExec = path.join(this.packagedPath, 'vibe');
    const stats = fs.statSync(mainExec);
    if (!(stats.mode & parseInt('111', 8))) {
      throw new Error('Main executable is not executable');
    }
    this.log('✓ Main executable has correct permissions');
  }

  testProtocolRegistration() {
    // Check electron-builder config for protocol registration
    const builderConfigPath = path.join(__dirname, 'electron-builder.js');
    if (!fs.existsSync(builderConfigPath)) {
      throw new Error('electron-builder.js not found');
    }

    const builderConfig = require(builderConfigPath);
    if (!builderConfig.protocols || !Array.isArray(builderConfig.protocols)) {
      throw new Error('Protocol registration not found in electron-builder config');
    }

    const vibeProtocol = builderConfig.protocols.find(p => 
      p.schemes && p.schemes.includes('vibe')
    );

    if (!vibeProtocol) {
      throw new Error('vibe:// protocol not registered');
    }

    this.log(`✓ Protocol registered: ${vibeProtocol.schemes.join(', ')}`);
    this.log(`✓ Protocol name: ${vibeProtocol.name}`);
  }

  testDeepLinkUrls() {
    // Test URL format validation
    const testUrls = [
      'vibe://auth?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9&userId=123&email=test@example.com',
      'vibe://open?page=chat&tabId=abc123',
      'vibe://auth?token=invalid',
      'vibe://open?page=settings'
    ];

    testUrls.forEach(url => {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'vibe:') {
          throw new Error(`Invalid protocol: ${parsed.protocol}`);
        }
        this.log(`✓ Valid deep-link URL: ${url.substring(0, 50)}...`);
      } catch (error) {
        throw new Error(`Invalid URL format: ${url} - ${error.message}`);
      }
    });
  }

  testAuthComponents() {
    // Check authentication files exist in the build
          // Source files validation passed
    const authComponents = [
      'src/renderer/src/components/auth/AuthGuard.tsx',
      'src/renderer/src/components/auth/UserProfile.tsx',
      'src/renderer/src/providers/PrivyAuthProvider.tsx',
      'src/renderer/src/hooks/useAuthSync.ts',
      'src/renderer/src/hooks/useDeepLinkAuth.ts',
      'src/main/ipc/auth/auth-verification.ts',
      'src/main/services/deep-link-service.ts'
    ];

    authComponents.forEach(component => {
      const componentPath = path.join(__dirname, component);
      if (!fs.existsSync(componentPath)) {
        throw new Error(`Missing auth component: ${component}`);
      }
      this.log(`✓ Found auth component: ${path.basename(component)}`);
    });
  }

  testEnvironmentConfig() {
    // Check .env.example exists
    const envExamplePath = path.join(__dirname, '.env.example');
    if (!fs.existsSync(envExamplePath)) {
      throw new Error('.env.example file not found');
    }

    const envContent = fs.readFileSync(envExamplePath, 'utf-8');
    const requiredVars = ['VITE_PRIVY_APP_ID'];
    
    requiredVars.forEach(varName => {
      if (!envContent.includes(varName)) {
        throw new Error(`Missing environment variable in .env.example: ${varName}`);
      }
      this.log(`✓ Found required env var: ${varName}`);
    });
  }

  testMainProcessServices() {
    const requiredServices = [
      { path: 'src/main/services/deep-link-service.ts', key: 'PROTOCOL_SCHEME' },
      { path: 'src/main/ipc/auth/auth-verification.ts', key: 'isAuthenticated' }
    ];

    requiredServices.forEach(({ path: servicePath, key }) => {
      const fullPath = path.join(__dirname, servicePath);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`Missing main process service: ${servicePath}`);
      }
      
      // Basic content validation
      const content = fs.readFileSync(fullPath, 'utf-8');
      if (!content.includes(key)) {
        throw new Error(`${servicePath} missing ${key}`);
      }
      
      this.log(`✓ Validated service: ${path.basename(servicePath)}`);
    });
  }

  testDashboardConnectivity() {
    try {
      // Test dashboard is accessible
      const dashboardUrl = 'http://localhost:3001';
      const response = execSync(`curl -s -o /dev/null -w "%{http_code}" ${dashboardUrl}`, 
        { encoding: 'utf-8', timeout: 5000 });
      
      if (response.trim() !== '200') {
        throw new Error(`Dashboard not accessible. HTTP status: ${response.trim()}`);
      }
      
      this.log('✓ Test dashboard is accessible at http://localhost:3001');

      // Test API endpoints
      const apiEndpoints = [
        '/api/auth/status',
        '/api/auth/login'
      ];

      apiEndpoints.forEach(endpoint => {
        try {
          const apiResponse = execSync(`curl -s -o /dev/null -w "%{http_code}" ${dashboardUrl}${endpoint}`, 
            { encoding: 'utf-8', timeout: 3000 });
          this.log(`✓ API endpoint accessible: ${endpoint} (${apiResponse.trim()})`);
        } catch (error) {
          this.log(`⚠️ API endpoint check failed: ${endpoint}`, 'warning');
        }
      });

    } catch (error) {
      throw new Error(`Dashboard connectivity test failed: ${error.message}`);
    }
  }

  generateTestReport() {
    const reportPath = path.join(__dirname, 'production-test-report.json');
    const report = {
      timestamp: new Date().toISOString(),
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch
      },
      results: this.results
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    this.log(`📄 Test report saved to: ${reportPath}`);
    return reportPath;
  }
}

// Run tests if called directly
if (require.main === module) {
  (async () => {
    const tester = new ProductionTester();
    const results = await tester.runAllTests();
    tester.generateTestReport();
    
    // Exit with appropriate code
    process.exit(results.passed === results.total ? 0 : 1);
  })();
}

module.exports = ProductionTester;