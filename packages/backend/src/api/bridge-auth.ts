// Bridge API Authentication Middleware
// Simple Bearer token authentication for agent-to-bridge communication

import type { Request, Response, NextFunction } from 'express';

// Bridge API token (should be set via environment variable in production)
const BRIDGE_API_TOKEN = process.env.BRIDGE_API_TOKEN || 'dev-bridge-token';

export interface AuthenticatedRequest extends Request {
  bridgeAuth?: {
    token: string;
    authenticated: boolean;
  };
}

/**
 * Middleware to authenticate Bridge API requests using Bearer token
 */
export function bridgeAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing Authorization header',
      },
    });
    return;
  }

  const [scheme, token] = authHeader.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid Authorization header format. Expected: Bearer <token>',
      },
    });
    return;
  }

  if (token !== BRIDGE_API_TOKEN) {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Invalid API token',
      },
    });
    return;
  }

  req.bridgeAuth = {
    token,
    authenticated: true,
  };

  next();
}

/**
 * Optional auth - allows requests without token but marks them as unauthenticated
 */
export function bridgeAuthOptional(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const [scheme, token] = authHeader.split(' ');
    if (scheme?.toLowerCase() === 'bearer' && token === BRIDGE_API_TOKEN) {
      req.bridgeAuth = {
        token,
        authenticated: true,
      };
    }
  }

  if (!req.bridgeAuth) {
    req.bridgeAuth = {
      token: '',
      authenticated: false,
    };
  }

  next();
}
