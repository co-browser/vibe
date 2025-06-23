import { NextApiRequest, NextApiResponse } from 'next';
import { removeSessionToken } from '../../../src/lib/mock-users';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get token from Authorization header or cookies
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.replace('Bearer ', '') || req.cookies.accessToken;

    if (accessToken) {
      // Remove session token
      removeSessionToken(accessToken);
    }

    // Clear cookies
    res.setHeader('Set-Cookie', [
      'accessToken=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/',
      'refreshToken=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/',
    ]);

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}