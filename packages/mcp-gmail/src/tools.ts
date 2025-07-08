import dotenv from 'dotenv';

// Only load .env in development or when not running as subprocess
if (process.env.NODE_ENV === 'development' || !process.env.ELECTRON_RUN_AS_NODE) {
  dotenv.config();
}

import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { TokenProvider } from './token-provider.js';

// Tool type definition
interface GmailTool {
  name: string;
  description: string;
  inputSchema: any;
  zodSchema: z.ZodSchema<any>;
  execute: (args: any) => Promise<string>;
}

// Configuration
const CONFIG_DIR = path.join(os.homedir(), '.gmail-mcp');

function validatePath(envPath: string | undefined, defaultPath: string): string {
  if (envPath) {
    // Ensure the path is within allowed directories
    const resolved = path.resolve(envPath);
    if (!resolved.startsWith(os.homedir()) && !resolved.startsWith(CONFIG_DIR)) {
      throw new Error(`Invalid path: ${envPath}`);
    }
    return resolved;
  }
  return defaultPath;
}

const OAUTH_PATH = validatePath(
  process.env.GMAIL_OAUTH_PATH,
  path.join(CONFIG_DIR, 'gcp-oauth.keys.json'),
);
const CREDENTIALS_PATH = validatePath(
  process.env.GMAIL_CREDENTIALS_PATH,
  path.join(CONFIG_DIR, 'credentials.json'),
);
const OAUTH_REDIRECT_URI =
  process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/oauth2callback';

// Initialize Gmail API
let gmailClient: gmail_v1.Gmail | null = null;
let tokenProvider: TokenProvider | null = null;

async function getGmailClient() {
  if (gmailClient) return gmailClient;

  // Initialize token provider if not already done
  if (!tokenProvider) {
    tokenProvider = new TokenProvider();
  }

  try {
    // Get tokens from TokenProvider (cloud or local)
    const tokens = await tokenProvider.getTokens();
    
    // Create OAuth2Client with tokens
    const oauth2Client = new OAuth2Client();
    oauth2Client.setCredentials(tokens);
    
    // Set up automatic token refresh
    oauth2Client.on('tokens', async (newTokens) => {
      if (newTokens.access_token) {
        try {
          // Update tokens via TokenProvider
          await tokenProvider!.updateTokens(newTokens);
          console.log('OAuth tokens refreshed and saved');
        } catch (error) {
          console.error('Failed to save refreshed tokens:', error);
        }
      }
    });
    
    gmailClient = google.gmail({ version: 'v1', auth: oauth2Client });
    return gmailClient;
  } catch (error) {
    // Fallback to original file-based approach if TokenProvider fails
    console.log('TokenProvider failed, trying file-based approach:', error.message);
    
    try {
      // Load OAuth keys
      const keysContent = JSON.parse(await fs.promises.readFile(OAUTH_PATH, 'utf8'));
      const keys = keysContent.installed || keysContent.web;

      const oauth2Client = new OAuth2Client(
        keys.client_id,
        keys.client_secret,
        OAUTH_REDIRECT_URI
      );

      // Set up automatic token refresh for file-based approach
      oauth2Client.on('tokens', (tokens) => {
        if (tokens.access_token) {
          try {
            // Update stored credentials with new tokens
            const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
            credentials.access_token = tokens.access_token;
            if (tokens.refresh_token) {
              credentials.refresh_token = tokens.refresh_token;
            }
            if (tokens.expiry_date) {
              credentials.expiry_date = tokens.expiry_date;
            }
            fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(credentials, null, 2));
            console.log('OAuth tokens refreshed and saved (file-based)');
          } catch (error) {
            console.error('Failed to save refreshed tokens (file-based):', error);
          }
        }
      });

      // Load existing credentials
      await fs.promises.access(CREDENTIALS_PATH);
      const credentials = JSON.parse(await fs.promises.readFile(CREDENTIALS_PATH, 'utf8'));
      oauth2Client.setCredentials(credentials);
      
      gmailClient = google.gmail({ version: 'v1', auth: oauth2Client });
      return gmailClient;
    } catch {
      throw new Error('No credentials found. Please authenticate through the Electron app first.');
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

function handleGmailError(error: any, _context: string): never {
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
export const GmailTools: GmailTool[] = [
  {
    name: "send_email",
    description: "Send an email via Gmail",
    inputSchema: zodToJsonSchema(SendEmailSchema),
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
        handleGmailError(error, 'send_email');
      }
    },
  },
  {
    name: "draft_email",
    description: "Draft a new email",
    inputSchema: zodToJsonSchema(SendEmailSchema),
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
        handleGmailError(error, 'draft_email');
      }
    },
  },
  {
    name: "search_emails",
    description: "Search emails using Gmail query syntax",
    inputSchema: zodToJsonSchema(SearchEmailsSchema),
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
        handleGmailError(error, 'search_emails');
      }
    },
  },
  {
    name: "read_email",
    description: "Read the content of an email",
    inputSchema: zodToJsonSchema(ReadEmailSchema),
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
        handleGmailError(error, 'read_email');
      }
    },
  },
  {
    name: "delete_email",
    description: "Permanently delete an email",
    inputSchema: zodToJsonSchema(DeleteEmailSchema),
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
        handleGmailError(error, 'delete_email');
      }
    },
  },
]; 