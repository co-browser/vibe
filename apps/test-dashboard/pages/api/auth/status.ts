import { NextApiRequest, NextApiResponse } from 'next';
import { validateAuthToken } from '../../../src/lib/jwt';
import { getUserBySessionToken } from '../../../src/lib/mock-users';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get token from Authorization header or cookies
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.replace('Bearer ', '') || req.cookies.accessToken;

    if (!accessToken) {
      return res.status(401).json({ 
        authenticated: false,
        error: 'No authentication token provided' 
      });
    }

    // Validate the access token
    const tokenPayload = validateAuthToken(accessToken);
    if (!tokenPayload) {
      return res.status(401).json({ 
        authenticated: false,
        error: 'Invalid or expired token' 
      });
    }

    // Get user from session
    const user = getUserBySessionToken(accessToken);
    if (!user) {
      return res.status(401).json({ 
        authenticated: false,
        error: 'Session not found' 
      });
    }

    // Return user status
    res.status(200).json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        lastLogin: user.lastLogin,
      },
      tokenExpiry: new Date(tokenPayload.exp * 1000).toISOString(),
    });

  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ 
      authenticated: false,
      error: 'Internal server error' 
    });
  }
}