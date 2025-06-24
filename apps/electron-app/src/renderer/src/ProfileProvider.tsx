import { useEffect, useState, ReactNode } from "react";
import { ProfileContext } from "./ProfileContext";
import type { ProfileData, ProfileStatus } from "@vibe/shared-types";

type Props = { children: ReactNode };

export function ProfileProvider({ children }: Props) {
  const [status, setStatus] = useState<ProfileStatus>({
    initialized: false,
    authenticated: false,
    hasProfile: false,
    lastActivity: 0,
  });
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await window.vibe.profile.initialize();
      setStatus(s);
      if (s.hasProfile) setProfile(await window.vibe.profile.getProfile());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to initialize profile");
      setStatus(prev => ({
        ...prev,
        error: e instanceof Error ? e.message : "Failed to initialize profile",
      }));
    } finally {
      setLoading(false);
    }
  };

  const createProfile = async (
    data: Omit<ProfileData, "id" | "createdAt" | "updatedAt">,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const p = await window.vibe.profile.createProfile(data);
      setProfile(p);
      setStatus(prev => ({
        ...prev,
        authenticated: true,
        hasProfile: true,
        profileId: p.id,
        lastActivity: Date.now(),
      }));
      return p;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create profile");
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (updates: Partial<ProfileData>) => {
    const p = await window.vibe.profile.updateProfile(updates);
    setProfile(p);
    setStatus(prev => ({ ...prev, lastActivity: Date.now() }));
    return p;
  };

  const clearProfile = async () => {
    await window.vibe.profile.clearProfile();
    setProfile(null);
    setStatus({
      initialized: true,
      authenticated: false,
      hasProfile: false,
      lastActivity: Date.now(),
    });
  };

  const setApiKey = (service: string, key: string) =>
    window.vibe.profile.setApiKey(service, key);
  const getApiKey = (service: string) => window.vibe.profile.getApiKey(service);
  const deleteApiKey = (service: string) => window.vibe.profile.deleteApiKey(service);
  const setPassword = (domain: string, password: string) =>
    window.vibe.profile.setPassword(domain, password);
  const getPassword = (domain: string) =>
    window.vibe.profile.getPassword(domain);
  const addBrowsingHistory = (url: string, title: string) =>
    window.vibe.profile.addBrowsingHistory(url, title);
  const getBrowsingHistory = (limit?: number) =>
    window.vibe.profile.getBrowsingHistory(limit);
  const setPreference = (key: string, value: any) =>
    window.vibe.profile.setPreference(key, value);
  const getPreference = (key: string) => window.vibe.profile.getPreference(key);
  const refreshProfile = async () => {
    const s = await window.vibe.profile.getStatus();
    setStatus(s);
    if (s.hasProfile) setProfile(await window.vibe.profile.getProfile());
  };

  useEffect(() => {
    const unsubscribe = window.vibe.profile.onApiKeyChanged(({ service, key }) => {
      if (profile) {
        setProfile({
          ...profile,
          apiKeys: { ...profile.apiKeys, [service]: key },
          updatedAt: Date.now(),
        });
      }
    });
    return unsubscribe;
  }, [profile]);

  return (
    <ProfileContext.Provider
      value={{
        status,
        profile,
        loading,
        error,
        createProfile,
        updateProfile,
        clearProfile,
        setApiKey,
        getApiKey,
        deleteApiKey,
        setPassword,
        getPassword,
        addBrowsingHistory,
        getBrowsingHistory,
        setPreference,
        getPreference,
        refreshProfile,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}
