import dotenv from 'dotenv';
dotenv.config();

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Configuration
const CONFIG_DIR = path.join(os.homedir(), '.gmail-mcp');
const OAUTH_PATH = process.env.GMAIL_OAUTH_PATH || path.join(CONFIG_DIR, 'gcp-oauth.keys.json');
const CREDENTIALS_PATH = process.env.GMAIL_CREDENTIALS_PATH || path.join(CONFIG_DIR, 'credentials.json');

// Initialize Gmail API
let gmailClient: any = null;

async function getGmailClient() {
  if (gmailClient) return gmailClient;

  // Load OAuth keys
  const keysContent = JSON.parse(fs.readFileSync(OAUTH_PATH, 'utf8'));
  const keys = keysContent.installed || keysContent.web;

  const oauth2Client = new OAuth2Client(
    keys.client_id,
    keys.client_secret,
    'http://localhost:3000/oauth2callback'
  );

  // Load existing credentials - these should already exist from your Electron app
  if (fs.existsSync(CREDENTIALS_PATH)) {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    oauth2Client.setCredentials(credentials);
  } else {
    throw new Error('No credentials found. Please authenticate through the Electron app first.');
  }

  gmailClient = google.gmail({ version: 'v1', auth: oauth2Client });
  return gmailClient;
}

// Email helper
function createEmailMessage(args: any): string {
  const headers = [
    'From: me',
    `To: ${args.to.join(', ')}`,
    args.cc ? `Cc: ${args.cc.join(', ')}` : '',
    `Subject: ${args.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
  ].filter(Boolean);

  return [...headers, args.body].join('\r\n');
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
export const GmailTools = [
  {
    name: "send_email",
    description: "Send an email via Gmail",
    inputSchema: zodToJsonSchema(SendEmailSchema),
    execute: async (args: z.infer<typeof SendEmailSchema>) => {
      try {
        // Validate required fields
        if (!args.to || args.to.length === 0) {
          throw new Error('At least one recipient email address is required');
        }

        const gmail = await getGmailClient();
        const message = createEmailMessage(args);
        const encodedMessage = Buffer.from(message).toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        const response = await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw: encodedMessage },
        });

        return `Email sent successfully with ID: ${response.data.id}`;
      } catch (error: any) {
        // Re-throw with a cleaner message
        if (error.response?.data?.error?.message) {
          throw new Error(error.response.data.error.message);
        }
        throw error;
      }
    },
  },
  {
    name: "draft_email",
    description: "Draft a new email",
    inputSchema: zodToJsonSchema(SendEmailSchema),
    execute: async (args: z.infer<typeof SendEmailSchema>) => {
      try {
        // Validate required fields
        if (!args.to || args.to.length === 0) {
          throw new Error('At least one recipient email address is required');
        }

        const gmail = await getGmailClient();
        const message = createEmailMessage(args);
        const encodedMessage = Buffer.from(message).toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        const response = await gmail.users.drafts.create({
          userId: 'me',
          requestBody: {
            message: { raw: encodedMessage },
          },
        });

        return `Email draft created successfully with ID: ${response.data.id}`;
      } catch (error: any) {
        // Re-throw with a cleaner message
        if (error.response?.data?.error?.message) {
          throw new Error(error.response.data.error.message);
        }
        throw error;
      }
    },
  },
  {
    name: "search_emails",
    description: "Search emails using Gmail query syntax",
    inputSchema: zodToJsonSchema(SearchEmailsSchema),
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
        if (error.response?.data?.error?.message) {
          throw new Error(error.response.data.error.message);
        }
        throw error;
      }
    },
  },
  {
    name: "read_email",
    description: "Read the content of an email",
    inputSchema: zodToJsonSchema(ReadEmailSchema),
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
        const extractBody = (payload: any): string => {
          if (payload.body?.data) {
            return Buffer.from(payload.body.data, 'base64').toString('utf8');
          }
          if (payload.parts) {
            for (const part of payload.parts) {
              if (part.mimeType === 'text/plain') {
                return extractBody(part);
              }
            }
            // If no plain text, try HTML
            for (const part of payload.parts) {
              if (part.mimeType === 'text/html') {
                return extractBody(part);
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
        if (error.response?.data?.error?.message) {
          throw new Error(error.response.data.error.message);
        }
        throw error;
      }
    },
  },
  {
    name: "delete_email",
    description: "Permanently delete an email",
    inputSchema: zodToJsonSchema(DeleteEmailSchema),
    execute: async (args: z.infer<typeof DeleteEmailSchema>) => {
      try {
        const gmail = await getGmailClient();
        await gmail.users.messages.delete({
          userId: 'me',
          id: args.messageId,
        });

        return `Email ${args.messageId} deleted successfully`;
      } catch (error: any) {
        if (error.response?.data?.error?.message) {
          throw new Error(error.response.data.error.message);
        }
        throw error;
      }
    },
  },
]; 