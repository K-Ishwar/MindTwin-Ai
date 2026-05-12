const admin = require('firebase-admin');

// FIREBASE_SERVICE_ACCOUNT env var must contain the full service account JSON as a string.
// In development, set it to '{}' to skip initialization (FCM calls will be no-ops).
let serviceAccount = {};
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
} catch (e) {
  console.warn('[firebase] Failed to parse FIREBASE_SERVICE_ACCOUNT — FCM disabled:', e.message);
}

const hasCredentials =
  serviceAccount.project_id &&
  serviceAccount.private_key &&
  serviceAccount.client_email;

if (!admin.apps.length) {
  if (hasCredentials) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('[firebase] Initialized with service account for project:', serviceAccount.project_id);
  } else {
    // Initialize without credentials — messaging() calls will fail gracefully
    admin.initializeApp();
    console.warn('[firebase] No valid service account found — FCM push notifications disabled.');
  }
}

module.exports = admin;
