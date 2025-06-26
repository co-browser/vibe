import { useContext } from "react";
import { ProfileContext } from "./ProfileContext";

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within a ProfileProvider");
  return ctx;
}
