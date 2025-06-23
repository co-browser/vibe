import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { User } from './jwt';

// Mock user database (in-memory)
const users = new Map<string, User & { passwordHash: string }>();
const usersByEmail = new Map<string, string>(); // email -> userId
const sessionTokens = new Map<string, { userId: string; createdAt: Date }>();

// Initialize with some test users
const initializeTestUsers = async () => {
  const testUsers = [
    {
      id: uuidv4(),
      email: 'test@example.com',
      username: 'testuser',
      password: 'password123',
      role: 'user',
    },
    {
      id: uuidv4(),
      email: 'admin@example.com',
      username: 'admin',
      password: 'admin123',
      role: 'admin',
    },
    {
      id: uuidv4(),
      email: 'demo@vibe.com',
      username: 'demouser',
      password: 'demo123',
      role: 'user',
    },
  ];

  for (const userData of testUsers) {
    const passwordHash = await bcrypt.hash(userData.password, 10);
    const user = {
      id: userData.id,
      email: userData.email,
      username: userData.username,
      role: userData.role,
      createdAt: new Date(),
      passwordHash,
    };

    users.set(user.id, user);
    usersByEmail.set(user.email, user.id);
  }
};

// Initialize test users
initializeTestUsers().catch(console.error);

export interface CreateUserData {
  email: string;
  username: string;
  password: string;
  role?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * Create a new user
 */
export async function createUser(userData: CreateUserData): Promise<User | null> {
  try {
    // Check if user already exists
    if (usersByEmail.has(userData.email)) {
      return null; // User already exists
    }

    const userId = uuidv4();
    const passwordHash = await bcrypt.hash(userData.password, 10);

    const user = {
      id: userId,
      email: userData.email,
      username: userData.username,
      role: userData.role || 'user',
      createdAt: new Date(),
      passwordHash,
    };

    users.set(userId, user);
    usersByEmail.set(userData.email, userId);

    // Return user without password hash
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  } catch (error) {
    console.error('Error creating user:', error);
    return null;
  }
}

/**
 * Authenticate user with email and password
 */
export async function authenticateUser(credentials: LoginCredentials): Promise<User | null> {
  try {
    const userId = usersByEmail.get(credentials.email);
    if (!userId) {
      return null; // User not found
    }

    const user = users.get(userId);
    if (!user) {
      return null; // User not found
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(credentials.password, user.passwordHash);
    if (!isPasswordValid) {
      return null; // Invalid password
    }

    // Update last login
    user.lastLogin = new Date();

    // Return user without password hash
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  } catch (error) {
    console.error('Error authenticating user:', error);
    return null;
  }
}

/**
 * Get user by ID
 */
export function getUserById(userId: string): User | null {
  const user = users.get(userId);
  if (!user) {
    return null;
  }

  // Return user without password hash
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

/**
 * Get user by email
 */
export function getUserByEmail(email: string): User | null {
  const userId = usersByEmail.get(email);
  if (!userId) {
    return null;
  }

  return getUserById(userId);
}

/**
 * Update user
 */
export async function updateUser(userId: string, updates: Partial<CreateUserData>): Promise<User | null> {
  try {
    const user = users.get(userId);
    if (!user) {
      return null;
    }

    // Update user data
    if (updates.email && updates.email !== user.email) {
      // Check if new email is already taken
      if (usersByEmail.has(updates.email)) {
        return null;
      }

      // Update email mapping
      usersByEmail.delete(user.email);
      usersByEmail.set(updates.email, userId);
      user.email = updates.email;
    }

    if (updates.username) {
      user.username = updates.username;
    }

    if (updates.role) {
      user.role = updates.role;
    }

    if (updates.password) {
      user.passwordHash = await bcrypt.hash(updates.password, 10);
    }

    // Return user without password hash
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  } catch (error) {
    console.error('Error updating user:', error);
    return null;
  }
}

/**
 * Delete user
 */
export function deleteUser(userId: string): boolean {
  try {
    const user = users.get(userId);
    if (!user) {
      return false;
    }

    users.delete(userId);
    usersByEmail.delete(user.email);

    return true;
  } catch (error) {
    console.error('Error deleting user:', error);
    return false;
  }
}

/**
 * Get all users (admin function)
 */
export function getAllUsers(): User[] {
  const allUsers: User[] = [];

  for (const user of Array.from(users.values())) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _, ...userWithoutPassword } = user;
    allUsers.push(userWithoutPassword);
  }

  return allUsers.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

/**
 * Store session token
 */
export function storeSessionToken(token: string, userId: string): void {
  sessionTokens.set(token, {
    userId,
    createdAt: new Date(),
  });
}

/**
 * Get user by session token
 */
export function getUserBySessionToken(token: string): User | null {
  const session = sessionTokens.get(token);
  if (!session) {
    return null;
  }

  // Check if session is expired (24 hours)
  const isExpired = Date.now() - session.createdAt.getTime() > 24 * 60 * 60 * 1000;
  if (isExpired) {
    sessionTokens.delete(token);
    return null;
  }

  return getUserById(session.userId);
}

/**
 * Remove session token
 */
export function removeSessionToken(token: string): void {
  sessionTokens.delete(token);
}

/**
 * Clean up expired session tokens
 */
export function cleanupExpiredSessions(): void {
  const now = Date.now();
  const expiredTokens: string[] = [];

  for (const [token, session] of Array.from(sessionTokens.entries())) {
    const isExpired = now - session.createdAt.getTime() > 24 * 60 * 60 * 1000;
    if (isExpired) {
      expiredTokens.push(token);
    }
  }

  for (const token of expiredTokens) {
    sessionTokens.delete(token);
  }
}

// Clean up expired sessions every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);