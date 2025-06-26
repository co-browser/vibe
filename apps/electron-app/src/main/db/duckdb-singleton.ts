import { Database } from "duckdb";

export class DuckDBSingleton {
  private static instance: Database;

  private constructor() {
    // dont
  }

  static getInstance(): Database {
    if (!DuckDBSingleton.instance) {
      DuckDBSingleton.instance = new Database(":memory:");
    }
    return DuckDBSingleton.instance;
  }
}
