// Import necessary modules
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { google, gmail_v1 } from 'googleapis';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { TokenProvider } from './token-provider.js';

// Configuration paths
const HOME_DIR = os.homedir();
const CONFIG_DIR = path.join(HOME_DIR, '.gmail-mcp');

// Ensure config directory exists
try {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
} catch (error) {
  console.error('Failed to create config directory:', error);
}

const OAUTH_PATH = path.join(os.homedir(), '.gmail-mcp', 'gcp-oauth.keys.json');
const OAUTH_REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';
const CREDENTIALS_PATH = path.join(os.homedir(), '.gmail-mcp', 'credentials.json');

// Helper functions for file-based auth
async function readOAuthKeys() {
  const keysContent = JSON.parse(await fs.promises.readFile(OAUTH_PATH, 'utf8'));
  const keys = keysContent.installed || keysContent.web;
  return {
    client_id: keys.client_id,
    client_secret: keys.client_secret,
    redirect_uris: keys.redirect_uris || [OAUTH_REDIRECT_URI]
  };
}

async function readTokens() {
  const credentials = JSON.parse(await fs.promises.readFile(CREDENTIALS_PATH, 'utf8'));
  return credentials;
}

async function saveTokens(tokens: any) {
  await fs.promises.writeFile(CREDENTIALS_PATH, JSON.stringify(tokens, null, 2));
  console.log('OAuth tokens saved (file-based)');
}

// Initialize Gmail API
let gmailClient: gmail_v1.Gmail | null = null;
let cachedTokenExpiry: number | null = null;

async function getGmailClient(): Promise<gmail_v1.Gmail> {
  // Check if we have a cached client and if the token is still valid
  if (gmailClient && cachedTokenExpiry) {
    // Check if token will expire in the next 5 minutes
    const now = Date.now();
    const fiveMinutesFromNow = now + (5 * 60 * 1000);

    if (cachedTokenExpiry < fiveMinutesFromNow) {
      console.log('[mcp-gmail] Cached token is expired or expiring soon, clearing client');
      gmailClient = null;
      cachedTokenExpiry = null;
    }
  }

  if (gmailClient) {
    return gmailClient;
  }

  try {
    // Try to get tokens from TokenProvider (supports both cloud and local)
    const tokenProvider = new TokenProvider();
    const tokens = await tokenProvider.getTokens();

    if (!tokens) {
      throw new Error('No Gmail credentials available. Please sign in with Gmail.');
    }

    // Store the token expiry for later checks
    cachedTokenExpiry = tokens.expiry_date;

    // Set up OAuth2 client
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date
    });

    // Handle token refresh
    oauth2Client.on('tokens', async (newTokens) => {
      console.log('[mcp-gmail] Tokens refreshed, updating stored tokens');
      // Update the cached expiry date
      if (newTokens.expiry_date) {
        cachedTokenExpiry = newTokens.expiry_date;
      }
      await tokenProvider.updateTokens(newTokens);
    });

    gmailClient = google.gmail({ version: 'v1', auth: oauth2Client });
    return gmailClient;
  } catch (error) {
    // Only fallback to file-based approach if USE_LOCAL_GMAIL_AUTH is true
    const useLocalAuth = process.env.USE_LOCAL_GMAIL_AUTH === 'true';
    if (!useLocalAuth) {
      throw new Error('Gmail authentication failed. Please sign in with Gmail through the app.');
    }

    // Fallback to original file-based approach if TokenProvider fails
    console.log('TokenProvider failed, trying file-based approach:', error.message);

    try {
      const oauthKeys = await readOAuthKeys();
      const existingTokens = await readTokens();

      const oauth2Client = new google.auth.OAuth2(
        oauthKeys.client_id,
        oauthKeys.client_secret,
        oauthKeys.redirect_uris[0]
      );

      oauth2Client.setCredentials(existingTokens);

      oauth2Client.on('tokens', async (tokens) => {
        const updatedTokens = { ...existingTokens, ...tokens };
        await saveTokens(updatedTokens);
      });

      gmailClient = google.gmail({ version: 'v1', auth: oauth2Client });
      return gmailClient;
    } catch (fileError) {
      console.error('File-based approach also failed:', fileError);
      throw new Error('Gmail authentication failed. Please ensure you have valid credentials.');
    }
  }
}

// Email helpers
function createEmailMessage(args: any): string {
  const headers = [
    'From: me',
    `To: ${args.to.join(', ')}`,
    `Subject: ${args.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
  ];

  // Add CC header only if CC recipients exist
  if (args.cc && args.cc.length > 0) {
    headers.push(`Cc: ${args.cc.join(', ')}`);
  }

  // Add empty line separator between headers and body
  headers.push('');

  return [...headers, args.body].join('\r\n');
}

function encodeBase64Url(data: string): string {
  return Buffer.from(data).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function handleGmailError(error: any): never {
  // Clear the cached client on authentication errors
  if (error.code === 401 || error.message?.includes('invalid authentication credentials')) {
    console.log('[mcp-gmail] Authentication error detected, clearing cached Gmail client');
    gmailClient = null;
    cachedTokenExpiry = null;
  }

  if (error.code === 401) {
    throw new Error('Gmail authentication failed. Please re-authenticate.');
  }
  if (error.response?.data?.error?.message) {
    throw new Error(error.response.data.error.message);
  }
  throw error;
}

// Schemas
const SendEmailSchema = z.object({
  to: z.array(z.string()).describe("Recipient email addresses"),
  subject: z.string().describe("Email subject"),
  body: z.string().describe("Email body"),
  cc: z.array(z.string()).optional().describe("CC recipients"),
});

const SearchEmailsSchema = z.object({
  query: z.string().describe("Gmail search query"),
  maxResults: z.number().optional().default(10).describe("Maximum results"),
});

const ReadEmailSchema = z.object({
  messageId: z.string().describe("Email message ID"),
});

const DeleteEmailSchema = z.object({
  messageId: z.string().describe("Email message ID to delete"),
});

// Tools
export const GmailTools: Tool[] = [
  {
    name: "send_email",
    description: "Send an email using Gmail",
    inputSchema: zodToJsonSchema(SendEmailSchema) as any,
    zodSchema: SendEmailSchema,
    execute: async (args: z.infer<typeof SendEmailSchema>) => {
      try {
        // Validate required fields
        if (!args.to || args.to.length === 0) {
          throw new Error('At least one recipient email address is required');
        }

        const gmail = await getGmailClient();
        const message = createEmailMessage(args);
        const encodedMessage = encodeBase64Url(message);

        const response = await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw: encodedMessage },
        });

        return `Email sent successfully with ID: ${response.data.id}`;
      } catch (error: any) {
        handleGmailError(error);
      }
    },
  },
  {
    name: "draft_email",
    description: "Create a draft email in Gmail",
    inputSchema: zodToJsonSchema(SendEmailSchema) as any,
    zodSchema: SendEmailSchema,
    execute: async (args: z.infer<typeof SendEmailSchema>) => {
      try {
        // Validate required fields
        if (!args.to || args.to.length === 0) {
          throw new Error('At least one recipient email address is required');
        }

        const gmail = await getGmailClient();
        const message = createEmailMessage(args);
        const encodedMessage = encodeBase64Url(message);

        const response = await gmail.users.drafts.create({
          userId: 'me',
          requestBody: {
            message: { raw: encodedMessage },
          },
        });

        return `Email draft created successfully with ID: ${response.data.id}`;
      } catch (error: any) {
        handleGmailError(error);
      }
    },
  },
  {
    name: "search_emails",
    description: "Search for emails in Gmail with flexible filters",
    inputSchema: zodToJsonSchema(SearchEmailsSchema) as any,
    zodSchema: SearchEmailsSchema,
    execute: async (args: z.infer<typeof SearchEmailsSchema>) => {
      try {
        const gmail = await getGmailClient();
        const response = await gmail.users.messages.list({
          userId: 'me',
          q: args.query,
          maxResults: args.maxResults,
        });

        const messages = response.data.messages || [];
        const results = await Promise.all(
          messages.map(async (msg: any) => {
            const detail = await gmail.users.messages.get({
              userId: 'me',
              id: msg.id,
              format: 'metadata',
              metadataHeaders: ['Subject', 'From', 'Date'],
            });
            const headers = detail.data.payload?.headers || [];
            return {
              id: msg.id,
              subject: headers.find((h: any) => h.name === 'Subject')?.value || '',
              from: headers.find((h: any) => h.name === 'From')?.value || '',
              date: headers.find((h: any) => h.name === 'Date')?.value || '',
              snippet: detail.data.snippet || '',
            };
          })
        );

        return JSON.stringify(results, null, 2);
      } catch (error: any) {
        handleGmailError(error);
      }
    },
  },
  {
    name: "read_email",
    description: "Read the full content of a specific email including its body and attachments",
    inputSchema: zodToJsonSchema(ReadEmailSchema) as any,
    zodSchema: ReadEmailSchema,
    execute: async (args: z.infer<typeof ReadEmailSchema>) => {
      try {
        const gmail = await getGmailClient();
        const response = await gmail.users.messages.get({
          userId: 'me',
          id: args.messageId,
          format: 'full',
        });

        const headers = response.data.payload?.headers || [];
        const subject = headers.find((h: any) => h.name?.toLowerCase() === 'subject')?.value || '';
        const from = headers.find((h: any) => h.name?.toLowerCase() === 'from')?.value || '';
        const to = headers.find((h: any) => h.name?.toLowerCase() === 'to')?.value || '';
        const date = headers.find((h: any) => h.name?.toLowerCase() === 'date')?.value || '';

        // Extract body
        let body = '';
        const extractBody = (payload: any, depth = 0): string => {
          if (depth > 10) {
            console.warn('Maximum MIME parsing depth reached');
            return '';
          }

          if (payload.body?.data) {
            return Buffer.from(payload.body.data, 'base64').toString('utf8');
          }
          if (payload.parts) {
            for (const part of payload.parts) {
              if (part.mimeType === 'text/plain') {
                return extractBody(part, depth + 1);
              }
            }
            // If no plain text, try HTML
            for (const part of payload.parts) {
              if (part.mimeType === 'text/html') {
                return extractBody(part, depth + 1);
              }
            }
          }
          return '';
        };

        body = extractBody(response.data.payload);

        return JSON.stringify({
          id: response.data.id,
          subject,
          from,
          to,
          date,
          body,
        }, null, 2);
      } catch (error: any) {
        handleGmailError(error);
      }
    },
  },
  {
    name: "delete_email",
    description: "Delete an email from Gmail (moves to trash)",
    inputSchema: zodToJsonSchema(DeleteEmailSchema) as any,
    zodSchema: DeleteEmailSchema,
    execute: async (args: z.infer<typeof DeleteEmailSchema>) => {
      try {
        const gmail = await getGmailClient();
        await gmail.users.messages.delete({
          userId: 'me',
          id: args.messageId,
        });

        return `Email ${args.messageId} deleted successfully`;
      } catch (error: any) {
        handleGmailError(error);
      }
    },
  },
]; 