import { NextApiRequest, NextApiResponse } from 'next';
import { createAdvancedRateLimit } from '../../../src/lib/rate-limit';
import { getUserBySessionToken } from '../../../src/lib/mock-users';
import { generateDeepLinkToken, validateAuthToken } from '../../../src/lib/jwt';

const rateLimits = createAdvancedRateLimit();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Apply rate limiting
  if (!rateLimits.token(req, res)) {
    return; // Rate limit response already sent
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get token from Authorization header or cookies
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.replace('Bearer ', '') || req.cookies.accessToken;

    if (!accessToken) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Validate the access token
    const tokenPayload = validateAuthToken(accessToken);
    if (!tokenPayload) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Get user from session or token
    let user = getUserBySessionToken(accessToken);
    if (!user) {
      // Fallback to token payload data
      user = {
        id: tokenPayload.userId,
        email: tokenPayload.email || '',
        username: tokenPayload.username || '',
        role: tokenPayload.role || 'user',
        createdAt: new Date(),
      };
    }

    // Generate deep-link token
    const deepLinkToken = generateDeepLinkToken(user);

    // Get optional navigation parameters
    const { page, tabId, url } = req.body || {};

    // Generate the deep-link URL
    const protocol = process.env.NEXT_PUBLIC_DESKTOP_PROTOCOL || 'vibe';
    let deepLinkUrl = `${protocol}://auth?token=${deepLinkToken}&userId=${user.id}&email=${encodeURIComponent(user.email)}`;

    // Add navigation parameters if provided
    if (page) {
      deepLinkUrl += `&page=${encodeURIComponent(page)}`;
    }
    if (tabId) {
      deepLinkUrl += `&tabId=${encodeURIComponent(tabId)}`;
    }
    if (url) {
      deepLinkUrl += `&url=${encodeURIComponent(url)}`;
    }

    // Log token generation for audit
    console.log(`Deep-link token generated for user ${user.id} (${user.email})`);

    // Return success response
    res.status(200).json({
      success: true,
      deepLinkUrl,
      token: deepLinkToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
      expiresIn: '1h',
      generatedAt: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Token generation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}