import { createContext } from "react";
import type { ProfileData, ProfileStatus } from "@vibe/shared-types";

export type ProfileContextType = {
  status: ProfileStatus;
  profile: ProfileData | null;
  loading: boolean;
  error: string | null;
  createProfile: (profileData: Omit<ProfileData, "id" | "createdAt" | "updatedAt">) => Promise<ProfileData>;
  updateProfile: (updates: Partial<ProfileData>) => Promise<ProfileData>;
  clearProfile: () => Promise<void>;
  setApiKey: (service: string, key: string) => Promise<void>;
  getApiKey: (service: string) => Promise<string | undefined>;
  deleteApiKey: (service: string) => Promise<void>;
  setPassword: (domain: string, password: string) => Promise<void>;
  getPassword: (domain: string) => Promise<string | undefined>;
  addBrowsingHistory: (url: string, title: string) => Promise<void>;
  getBrowsingHistory: (limit?: number) => Promise<Array<{ url: string; title: string; timestamp: number }>>;
  setPreference: (key: string, value: any) => Promise<void>;
  getPreference: (key: string) => Promise<any>;
  refreshProfile: () => Promise<void>;
};

export const ProfileContext = createContext<ProfileContextType | undefined>(undefined);
