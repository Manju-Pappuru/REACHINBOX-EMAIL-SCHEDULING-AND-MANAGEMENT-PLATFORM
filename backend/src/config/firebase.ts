import { cert, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

export const firebaseAdminAvailable = Boolean(projectId && clientEmail && privateKey);

if (firebaseAdminAvailable) {
  const serviceAccount: ServiceAccount = {
    projectId,
    clientEmail,
    privateKey,
  };
  initializeApp({
    credential: cert(serviceAccount),
  });
}

export { getAuth };
