export interface PasswordEntry {
  id: string;
  url: string;
  username: string;
  password: string;
  source: "chrome" | "safari" | "csv" | "manual";
  dateCreated?: Date;
  lastModified?: Date;
}
