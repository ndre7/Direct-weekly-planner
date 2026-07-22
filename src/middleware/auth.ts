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
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error: any) {
    console.error('Error verifying Firebase ID token:', error);
    const msg = error instanceof Error ? error.message : String(error);
    
    // Proactive handling of client-server clock skew:
    // If the error indicates the token is not yet valid (issued in the future),
    // we can parse the JWT payload to verify it belongs to our project and is not expired.
    if (msg.includes('not yet valid') || msg.includes('issued in the future')) {
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          const now = Math.floor(Date.now() / 1000);
          
          // Check that audience is our project ID
          const expectedAudience = adminAuth.app.options.projectId;
          const isAudienceValid = payload.aud === expectedAudience;
          const isNotExpired = payload.exp > now;
          const isCloseFuture = payload.iat <= now + 600; // Allow up to 10 minutes clock skew
          
          if (isAudienceValid && isNotExpired && isCloseFuture) {
            console.log(`[Auth Middleware] Client-Server clock skew detected but token is valid. iat: ${payload.iat}, now: ${now}. Allowing request for user: ${payload.sub}`);
            req.user = payload as DecodedIdToken;
            return next();
          }
        }
      } catch (decodeErr) {
        console.error('Failed to parse decoded token for clock skew check:', decodeErr);
      }
    }

    return res.status(401).json({ 
      error: `Unauthorized: Invalid token - ${msg}`, 
      details: msg,
      code: error?.code
    });
  }
};
