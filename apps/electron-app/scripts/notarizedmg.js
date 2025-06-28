import { notarize } from "@electron/notarize";
import fs from 'fs';
import path from 'path';

/*
*if this fails the manual way to notarize is (as of 2025) =>
*
*    xcrun notarytool submit --verbose  --wait  --team-id "team_id" --apple-id "dev_email" --password "app_specific_pw" vibe.dmg
*    xcrun stapler staple vibe.dmg  
*/

async function retryNotarize(options, retries = 5, delay = 5000) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`[cobrowser-sign]: Attempt ${i + 1} to notarize...`);
      await notarize(options);
      console.log('[cobrowser-sign]: Notarization successful');
      return;
    } catch (error) {
      console.error(`[cobrowser-sign]: Notarization attempt ${i + 1} failed:`, error);
      if (i < retries - 1) {
        console.log(`[cobrowser-sign]: Retrying in ${delay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      } else {
        console.log('[cobrowser-sign]: All notarization attempts failed...');

        throw error;
      }
    }
  }
}


function findDmgFile(directoryPath) {
  try {
    const files = fs.readdirSync(directoryPath);
    for (const file of files) {
      const fullPath = path.join(directoryPath, file);
      const stats = fs.statSync(fullPath);
      if (stats.isFile() && file.toLowerCase().endsWith('.dmg')) {

        return fullPath;
      }
    }
    return null;
  } catch (error) {
    console.error(`[cobrowser-sign]: Error reading directory "${directoryPath}":`, error.message);
    return null;
  }
}


export default async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName !== 'darwin') {
    console.log('[cobrowser-sign]: Skipping notarization: Not a macOS build.');
    return;
  }

  if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD || !process.env.APPLE_TEAM_ID) {
    console.warn('[cobrowser-sign]: Skipping notarization: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID environment variables must be set.');
    return;
  }

  const dmgFilePath = findDmgFile(appOutDir);
  if (dmgFilePath) {
    console.log(`Found .dmg file: ${dmgFilePath}`);
    try {
      await retryNotarize({
        tool: 'notarytool',
        appBundleId: 'xyz.cobrowser.vibe',
        appPath: dmgFilePath,
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID
      });
      console.log('[cobrowser-sign]: Notarization complete!');
    } catch (error) {
      console.error('[cobrowser-sign]: notarization failed:', error);
      throw error;
    }
  } else {
    console.error(`[cobrowser-sign]: No .dmg file found in ${appOutDir}`);
  }



}
