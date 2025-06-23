import React, { useState, useEffect } from 'react';
import Head from 'next/head';

interface User {
  id: string;
  email: string;
  username: string;
  role: string;
  lastLogin?: string;
}

interface AuthState {
  authenticated: boolean;
  user: User | null;
  loading: boolean;
}

interface DeepLinkData {
  deepLinkUrl: string;
  token: string;
  expiresIn: string;
  generatedAt: string;
}

export default function Dashboard() {
  const [auth, setAuth] = useState<AuthState>({
    authenticated: false,
    user: null,
    loading: true,
  });

  const [loginForm, setLoginForm] = useState({
    email: '',
    password: '',
    loading: false,
    error: '',
  });

  const [deepLinkData, setDeepLinkData] = useState<DeepLinkData | null>(null);
  const [deepLinkForm, setDeepLinkForm] = useState({
    page: 'chat',
    tabId: '',
    url: '',
    loading: false,
  });

  // Check authentication status on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/auth/status');
      const data = await response.json();

      if (data.authenticated) {
        setAuth({
          authenticated: true,
          user: data.user,
          loading: false,
        });
      } else {
        setAuth({
          authenticated: false,
          user: null,
          loading: false,
        });
      }
    } catch (error) {
      console.error('Auth status check failed:', error);
      setAuth({
        authenticated: false,
        user: null,
        loading: false,
      });
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginForm(prev => ({ ...prev, loading: true, error: '' }));

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: loginForm.email,
          password: loginForm.password,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setAuth({
          authenticated: true,
          user: data.user,
          loading: false,
        });
        setLoginForm({
          email: '',
          password: '',
          loading: false,
          error: '',
        });
      } else {
        setLoginForm(prev => ({
          ...prev,
          loading: false,
          error: data.error || 'Login failed',
        }));
      }
    } catch (error) {
      setLoginForm(prev => ({
        ...prev,
        loading: false,
        error: 'Network error. Please try again.',
      }));
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setAuth({
        authenticated: false,
        user: null,
        loading: false,
      });
      setDeepLinkData(null);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const generateDeepLink = async () => {
    setDeepLinkForm(prev => ({ ...prev, loading: true }));

    try {
      const response = await fetch('/api/auth/generate-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          page: deepLinkForm.page || undefined,
          tabId: deepLinkForm.tabId || undefined,
          url: deepLinkForm.url || undefined,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setDeepLinkData(data);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      alert('Failed to generate deep-link');
    } finally {
      setDeepLinkForm(prev => ({ ...prev, loading: false }));
    }
  };

  const openDesktopApp = () => {
    if (deepLinkData) {
      window.location.href = deepLinkData.deepLinkUrl;
    }
  };

  if (auth.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Vibe Test Dashboard - Authentication & Deep-Link Testing</title>
        <meta name="description" content="Test dashboard for Vibe desktop app authentication" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="max-w-4xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Vibe Test Dashboard
          </h1>
          <p className="text-lg text-gray-600">
            Authentication & Deep-Link Testing Platform
          </p>
        </div>

        {!auth.authenticated ? (
          /* Login Form */
          <div className="max-w-md mx-auto">
            <div className="card">
              <h2 className="text-2xl font-semibold text-gray-900 mb-6 text-center">
                Login to Test Dashboard
              </h2>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="label">Email</label>
                  <input
                    type="email"
                    className="input"
                    value={loginForm.email}
                    onChange={(e) => setLoginForm(prev => ({ ...prev, email: e.target.value }))}
                    required
                    disabled={loginForm.loading}
                    placeholder="Enter your email"
                  />
                </div>

                <div>
                  <label className="label">Password</label>
                  <input
                    type="password"
                    className="input"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm(prev => ({ ...prev, password: e.target.value }))}
                    required
                    disabled={loginForm.loading}
                    placeholder="Enter your password"
                  />
                </div>

                {loginForm.error && (
                  <div className="text-error-600 text-sm bg-error-50 p-3 rounded-md">
                    {loginForm.error}
                  </div>
                )}

                <button
                  type="submit"
                  className="btn-primary w-full"
                  disabled={loginForm.loading}
                >
                  {loginForm.loading ? 'Logging in...' : 'Login'}
                </button>
              </form>

              <div className="mt-6 text-sm text-gray-600">
                <p className="font-medium mb-2">Test Accounts:</p>
                <div className="space-y-1 text-xs">
                  <p>• test@example.com / password123</p>
                  <p>• admin@example.com / admin123</p>
                  <p>• demo@vibe.com / demo123</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Dashboard Content */
          <div className="space-y-8">
            {/* User Info */}
            <div className="card">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                    Welcome, {auth.user?.username}!
                  </h2>
                  <div className="space-y-1 text-gray-600">
                    <p>Email: {auth.user?.email}</p>
                    <p>Role: <span className="badge-info">{auth.user?.role}</span></p>
                    <p>User ID: <code className="text-xs bg-gray-100 px-2 py-1 rounded">{auth.user?.id}</code></p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="btn-secondary"
                >
                  Logout
                </button>
              </div>
            </div>

            {/* Deep-Link Generator */}
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Desktop App Deep-Link Generator
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div>
                  <label className="label">Page (optional)</label>
                  <select
                    className="input"
                    value={deepLinkForm.page}
                    onChange={(e) => setDeepLinkForm(prev => ({ ...prev, page: e.target.value }))}
                  >
                    <option value="">Default</option>
                    <option value="chat">Chat</option>
                    <option value="browser">Browser</option>
                    <option value="settings">Settings</option>
                  </select>
                </div>

                <div>
                  <label className="label">Tab ID (optional)</label>
                  <input
                    type="text"
                    className="input"
                    value={deepLinkForm.tabId}
                    onChange={(e) => setDeepLinkForm(prev => ({ ...prev, tabId: e.target.value }))}
                    placeholder="e.g., abc123"
                  />
                </div>

                <div>
                  <label className="label">URL (optional)</label>
                  <input
                    type="url"
                    className="input"
                    value={deepLinkForm.url}
                    onChange={(e) => setDeepLinkForm(prev => ({ ...prev, url: e.target.value }))}
                    placeholder="https://example.com"
                  />
                </div>
              </div>

              <button
                onClick={generateDeepLink}
                className="btn-primary"
                disabled={deepLinkForm.loading}
              >
                {deepLinkForm.loading ? 'Generating...' : 'Generate Deep-Link'}
              </button>

              {deepLinkData && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-semibold text-gray-900">Generated Deep-Link</h3>
                    <span className="badge-success">Valid for {deepLinkData.expiresIn}</span>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Deep-Link URL:</label>
                      <div className="mt-1 p-2 bg-white border rounded text-xs font-mono break-all">
                        {deepLinkData.deepLinkUrl}
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700">JWT Token:</label>
                      <div className="mt-1 p-2 bg-white border rounded text-xs font-mono break-all">
                        {deepLinkData.token}
                      </div>
                    </div>

                    <div className="flex space-x-3">
                      <button
                        onClick={openDesktopApp}
                        className="btn-success"
                      >
                        🚀 Open Desktop App
                      </button>
                      
                      <button
                        onClick={() => navigator.clipboard.writeText(deepLinkData.deepLinkUrl)}
                        className="btn-secondary"
                      >
                        📋 Copy URL
                      </button>
                    </div>

                    <p className="text-xs text-gray-500">
                      Generated at: {new Date(deepLinkData.generatedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Testing Instructions */}
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Testing Instructions
              </h2>

              <div className="space-y-4 text-gray-700">
                <div>
                  <h3 className="font-semibold text-gray-900">1. Generate Deep-Link</h3>
                  <p>Use the form above to generate a secure deep-link with optional navigation parameters.</p>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900">2. Test Across Platforms</h3>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Windows: Should register <code>vibe://</code> protocol</li>
                    <li>macOS: Should handle protocol in dock/applications</li>
                    <li>Linux: Should register protocol handler</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900">3. Security Features</h3>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>JWT tokens expire in 1 hour</li>
                    <li>Rate limiting: 10 tokens/minute, 5 auth attempts/15min</li>
                    <li>Secure token validation with issuer/audience checks</li>
                    <li>Session management with automatic cleanup</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900">4. Production Checklist</h3>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>✅ JWT secret configured</li>
                    <li>✅ Token expiration (1-24 hours)</li>
                    <li>✅ Rate limiting implemented</li>
                    <li>✅ Cross-platform testing ready</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}