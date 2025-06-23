import jwt from 'jsonwebtoken';

const JWT_SECRET: string = process.env.JWT_SECRET || 'fallback-secret-key';
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '24h';

export interface JWTPayload {
  userId: string;
  email?: string;
  username?: string;
  role?: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export interface User {
  id: string;
  email: string;
  username: string;
  role: string;
  createdAt: Date;
  lastLogin?: Date;
}

/**
 * Generate a JWT token for authentication
 */
export function generateAuthToken(user: User): string {
  const payload = {
    userId: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'vibe-test-dashboard',
    audience: 'vibe-desktop-app',
  } as jwt.SignOptions);
}

/**
 * Validate and decode a JWT token
 */
export function validateAuthToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'vibe-test-dashboard',
      audience: 'vibe-desktop-app',
    }) as JWTPayload;

    return decoded;
  } catch {
    return null;
  }
}

/**
 * Generate a refresh token
 */
export function generateRefreshToken(userId: string): string {
  return jwt.sign(
    { userId, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * Validate refresh token
 */
export function validateRefreshToken(token: string): { userId: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    if (decoded.type !== 'refresh') {
      return null;
    }

    return { userId: decoded.userId };
  } catch {
    return null;
  }
}

/**
 * Decode token without verification (for debugging)
 */
export function decodeToken(token: string): any {
  try {
    return jwt.decode(token);
  } catch (error) {
    console.error('Token decode failed:', error);
    return null;
  }
}

/**
 * Check if token is expired
 */
export function isTokenExpired(token: string): boolean {
  try {
    const decoded = jwt.decode(token) as any;
    if (!decoded || !decoded.exp) {
      return true;
    }

    const currentTime = Math.floor(Date.now() / 1000);
    return decoded.exp < currentTime;
  } catch {
    return true;
  }
}

/**
 * Get token expiration time
 */
export function getTokenExpiration(token: string): Date | null {
  try {
    const decoded = jwt.decode(token) as any;
    if (!decoded || !decoded.exp) {
      return null;
    }

    return new Date(decoded.exp * 1000);
  } catch {
    return null;
  }
}

/**
 * Generate a secure deep-link token for desktop app authentication
 */
export function generateDeepLinkToken(user: User): string {
  const payload = {
    userId: user.id,
    email: user.email,
    username: user.username,
    type: 'deep-link',
  };

  // Shorter expiration for deep-link tokens (1 hour)
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '1h',
    issuer: 'vibe-test-dashboard',
    audience: 'vibe-desktop-app',
  });
}