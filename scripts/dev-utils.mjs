#!/usr/bin/env node

/**
 * Development Utilities for Bo CLI
 * Provides automated development workflows and quality checks
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

class DevUtils {
  constructor() {
    this.packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));
  }

  /**
   * Run comprehensive development workflow
   */
  async runDevWorkflow() {
    console.log('🚀 Starting Bo CLI Development Workflow\n');

    try {
      // 1. Clean
      console.log('🧹 Cleaning build artifacts...');
      this.runCommand('npm run clean');

      // 2. Type check
      console.log('🔍 Type checking...');
      this.runCommand('npm run type-check');

      // 3. Lint
      console.log('📝 Linting...');
      this.runCommand('npm run lint');

      // 4. Build
      console.log('🔨 Building...');
      this.runCommand('npm run build');

      // 5. Health check
      console.log('🏥 Health check...');
      this.runCommand('npm run health-check');

      // 6. Test
      console.log('🧪 Testing...');
      this.runCommand('npm test');

      console.log('\n✅ Development workflow completed successfully!');
    } catch (error) {
      console.error('\n❌ Development workflow failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Analyze code complexity and quality
   */
  analyzeCodeQuality() {
    console.log('📊 Analyzing Code Quality\n');

    const metrics = {
      files: 0,
      lines: 0,
      functions: 0,
      complexity: 0
    };

    // Simple complexity analysis
    const srcFiles = this.findFiles('./src', '.ts');
    metrics.files = srcFiles.length;

    for (const file of srcFiles) {
      const content = readFileSync(file, 'utf8');
      const lines = content.split('\n').length;
      metrics.lines += lines;
      
      // Count functions
      const functionMatches = content.match(/(?:function|=>|class)\s+\w+/g) || [];
      metrics.functions += functionMatches.length;
      
      // Simple complexity estimation
      const complexityIndicators = content.match(/(?:if|for|while|case|catch)\s*\(/g) || [];
      metrics.complexity += complexityIndicators.length;
    }

    console.log('📈 Code Quality Metrics:');
    console.log(`   Files: ${metrics.files}`);
    console.log(`   Lines: ${metrics.lines}`);
    console.log(`   Functions: ${metrics.functions}`);
    console.log(`   Complexity Score: ${metrics.complexity}`);
    console.log(`   Avg Complexity/File: ${(metrics.complexity / metrics.files).toFixed(1)}`);

    // Quality assessment
    const avgComplexity = metrics.complexity / metrics.files;
    if (avgComplexity > 20) {
      console.log('\n⚠️  High complexity detected - consider refactoring');
    } else if (avgComplexity > 10) {
      console.log('\nℹ️  Moderate complexity - monitor for improvements');
    } else {
      console.log('\n✅ Good complexity levels maintained');
    }

    return metrics;
  }

  /**
   * Generate development report
   */
  generateDevReport() {
    const report = {
      timestamp: new Date().toISOString(),
      version: this.packageJson.version,
      nodeVersion: process.version,
      platform: process.platform,
      qualityMetrics: {},
      buildStatus: 'unknown',
      testStatus: 'unknown'
    };

    try {
      report.qualityMetrics = this.analyzeCodeQuality();
      
      // Check build status
      this.runCommand('npm run type-check', true);
      report.buildStatus = 'success';
      
      // Check test status
      this.runCommand('npm test', true);
      report.testStatus = 'success';
      
    } catch (error) {
      report.buildStatus = 'failed';
      report.testStatus = 'failed';
    }

    const reportFile = './dev-report.json';
    writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(`\n📄 Development report saved to: ${reportFile}`);

    return report;
  }

  /**
   * Find files by extension
   */
  findFiles(dir, ext) {
    const files = [];
    
    try {
      const { readdirSync, statSync } = await import('node:fs');
      const { join } = await import('node:path');
      
      const entries = readdirSync(dir);
      
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        
        if (stat.isDirectory()) {
          files.push(...this.findFiles(fullPath, ext));
        } else if (entry.endsWith(ext)) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Directory might not exist
    }
    
    return files;
  }

  /**
   * Run command with error handling
   */
  runCommand(command, silent = false) {
    try {
      const output = execSync(command, { encoding: 'utf8' });
      if (!silent && output.trim()) {
        console.log(output);
      }
      return output;
    } catch (error) {
      if (!silent) {
        console.error(`Command failed: ${command}`);
        console.error(error.stdout || error.message);
      }
      throw error;
    }
  }
}

// CLI interface
const devUtils = new DevUtils();
const command = process.argv[2];

switch (command) {
  case 'workflow':
    await devUtils.runDevWorkflow();
    break;
  case 'analyze':
    devUtils.analyzeCodeQuality();
    break;
  case 'report':
    devUtils.generateDevReport();
    break;
  default:
    console.log(`
Bo CLI Development Utilities

Usage:
  node scripts/dev-utils.mjs <command>

Commands:
  workflow    Run complete development workflow
  analyze     Analyze code quality and complexity
  report      Generate development status report

Examples:
  node scripts/dev-utils.mjs workflow
  node scripts/dev-utils.mjs analyze
  node scripts/dev-utils.mjs report
    `);
    break;
}