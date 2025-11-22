/**
 * Clipboard utilities for copying text to system clipboard
 * Supports macOS (pbcopy), Linux (xclip/xsel), and Windows (clip)
 */

import { spawn } from 'node:child_process';
import { platform } from 'node:os';

export interface ClipboardResult {
  success: boolean;
  error?: string;
}

/**
 * Copy text to system clipboard using platform-specific commands
 */
export async function copyToClipboard(text: string): Promise<ClipboardResult> {
  if (!text) {
    return { success: false, error: 'No text provided' };
  }

  const os = platform();
  let command: string;
  let args: string[] = [];

  // Determine platform-specific clipboard command
  if (os === 'darwin') {
    // macOS
    command = 'pbcopy';
  } else if (os === 'win32') {
    // Windows
    command = 'clip';
  } else {
    // Linux - try xclip first, fall back to xsel
    command = 'xclip';
    args = ['-selection', 'clipboard'];
  }

  return new Promise((resolve) => {
    try {
      const proc = spawn(command, args);
      let errorOutput = '';

      proc.on('error', (err) => {
        // If xclip fails on Linux, try xsel
        if (os === 'linux' && command === 'xclip') {
          copyWithXsel(text).then(resolve);
        } else {
          resolve({
            success: false,
            error: `Failed to run ${command}: ${err.message}`,
          });
        }
      });

      proc.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({
            success: false,
            error: errorOutput || `Command exited with code ${code}`,
          });
        }
      });

      // Write the text to stdin
      proc.stdin.write(text);
      proc.stdin.end();
    } catch (error: any) {
      resolve({
        success: false,
        error: `Exception: ${error.message}`,
      });
    }
  });
}

/**
 * Fallback for Linux systems without xclip
 */
async function copyWithXsel(text: string): Promise<ClipboardResult> {
  return new Promise((resolve) => {
    try {
      const proc = spawn('xsel', ['--clipboard', '--input']);
      let errorOutput = '';

      proc.on('error', (err) => {
        resolve({
          success: false,
          error: `Clipboard utilities not found. Please install xclip or xsel: ${err.message}`,
        });
      });

      proc.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({
            success: false,
            error:
              errorOutput ||
              'Failed to copy. Please install xclip: sudo apt-get install xclip',
          });
        }
      });

      proc.stdin.write(text);
      proc.stdin.end();
    } catch (error: any) {
      resolve({
        success: false,
        error: `Exception: ${error.message}`,
      });
    }
  });
}

/**
 * Get instructions for copying to clipboard on the current platform
 */
export function getClipboardInstructions(): string {
  const os = platform();
  if (os === 'darwin') {
    return 'Use /copy to copy the last section to clipboard';
  } else if (os === 'win32') {
    return 'Use /copy to copy the last section to clipboard';
  } else {
    return 'Use /copy to copy the last section (requires xclip or xsel)';
  }
}
