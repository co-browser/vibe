import { NextApiRequest, NextApiResponse } from 'next';
import { createAdvancedRateLimit } from '../../../src/lib/rate-limit';
import { authenticateUser, storeSessionToken } from '../../../src/lib/mock-users';
import { generateAuthToken, generateRefreshToken } from '../../../src/lib/jwt';

const rateLimits = createAdvancedRateLimit();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Apply rate limiting
  if (!rateLimits.auth(req, res)) {
    return; // Rate limit response already sent
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Invalid input format' });
    }

    // Authenticate user
    const user = await authenticateUser({ email, password });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate tokens
    const accessToken = generateAuthToken(user);
    const refreshToken = generateRefreshToken(user.id);

    // Store session token for tracking
    storeSessionToken(accessToken, user.id);

    // Set secure cookies
    const isProduction = process.env.NODE_ENV === 'production';
    
    res.setHeader('Set-Cookie', [
      `accessToken=${accessToken}; HttpOnly; Secure=${isProduction}; SameSite=Strict; Max-Age=86400; Path=/`,
      `refreshToken=${refreshToken}; HttpOnly; Secure=${isProduction}; SameSite=Strict; Max-Age=604800; Path=/`,
    ]);

    // Return success response
    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
      accessToken,
      refreshToken,
      expiresIn: '24h',
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}