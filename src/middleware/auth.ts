import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { DecodedIdToken } from 'firebase-admin/auth';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    let decodedToken: DecodedIdToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(token, true);
    } catch (checkRevokedError: any) {
      if (checkRevokedError?.code === 'auth/id-token-revoked') {
        throw checkRevokedError;
      }
      // Fallback to local token verification if checkRevoked fails due to identitytoolkit API 403 or network errors
      decodedToken = await adminAuth.verifyIdToken(token, false);
    }
    req.user = decodedToken;
    next();
  } catch (error: any) {
    console.error('Error verifying Firebase ID token:', error);
    const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
    const code = String(error?.code || '').toLowerCase();
    const infraKeywords = [
      'fetch failed',
      'enotfound',
      'econnreset',
      'etimedout',
      'eai_again',
      'timeout',
      'network',
      'loading metadata',
      'public keys',
      '500',
      '503'
    ];
    const isInfraError = infraKeywords.some(k => msg.includes(k) || code.includes(k));
    if (isInfraError) {
      return res.status(503).json({
        error: 'TEMPORARY_AUTH_INFRA',
        retryable: true,
        details: msg,
        code: error?.code
      });
    }

    return res.status(401).json({ 
      error: `Unauthorized: Invalid token - ${msg}`, 
      details: msg,
      code: error?.code
    });
  }
};
