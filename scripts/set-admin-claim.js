/**
 * Server-Side Admin Role Assignment Script
 * 
 * Usage:
 *   node scripts/set-admin-claim.js <TARGET_EMAIL_OR_UID>
 * 
 * Requirements:
 *   - Service account credentials set via GOOGLE_APPLICATION_CREDENTIALS
 *     or local serviceAccountKey.json file.
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';

// 1. Initialize Firebase Admin SDK
if (getApps().length === 0) {
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.resolve('./serviceAccountKey.json');
  
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    initializeApp({
      credential: cert(serviceAccount),
    });
  } else {
    // Fallback to Application Default Credentials (e.g. on Google Cloud Run / Compute Engine)
    initializeApp();
  }
}

const auth = getAuth();
const target = process.argv[2];

if (!target) {
  console.error('❌ Error: Target user UID or Email is required.');
  console.log('Usage: node scripts/set-admin-claim.js <TARGET_EMAIL_OR_UID>');
  process.exit(1);
}

async function grantAdminClaim() {
  try {
    let uid = target;

    // If target contains '@', look up by email first
    if (target.includes('@')) {
      console.log(`🔍 Looking up user by email: ${target}...`);
      const userRecord = await auth.getUserByEmail(target);
      uid = userRecord.uid;
      console.log(`✅ Found user UID: ${uid} (${userRecord.displayName || 'No display name'})`);
    } else {
      console.log(`🔍 Verifying user with UID: ${uid}...`);
      await auth.getUser(uid);
    }

    // Assign the custom claim { admin: true }
    console.log(`🔐 Setting { admin: true } custom user claim for ${uid}...`);
    await auth.setCustomUserClaims(uid, { admin: true });

    console.log('\n🎉 SUCCESS!');
    console.log(`Admin custom claim successfully granted to user: ${target} (UID: ${uid})`);
    console.log('\n⚠️ IMPORTANT NOTE:');
    console.log('The user must sign out and sign back in (or refresh their ID token with user.getIdToken(true)) for the new custom claims to reflect on their client JWT.');
  } catch (error) {
    console.error('❌ Failed to set admin claim:', error);
    process.exit(1);
  }
}

grantAdminClaim();
