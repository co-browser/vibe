import { ColumnInfo, Connection, Database, TableData } from "duckdb";

import { DuckDBSingleton } from "@/db/duckdb-singleton";
import { convertTableDataToJSON } from "@/db/duckdb-type-converter";

export class DuckDBManager {
  private db: Database | null = null;
  private connection: Connection | null = null;

  private initPromise: Promise<void>;

  constructor({
    onInitialize,
  }: {
    onInitialize?: (db: Database) => Promise<void>;
  }) {
    this.initPromise = this.initialize({ onInitialize });
  }

  /**
   * Initialize the DuckDB instance
   */
  private async initialize({
    onInitialize,
  }: {
    onInitialize?: (db: Database) => Promise<void>;
  }) {
    this.db = DuckDBSingleton.getInstance();

    await onInitialize?.(this.db);
  }

  /**
   * Get a DuckDB connection instance.
   */
  async getConnection() {
    // Ensure database is initialized before returning the connection
    await this.initPromise;

    if (!this.connection) {
      this.connection = this.db?.connect() ?? null;
    }

    return this.connection;
  }

  /**
   * Execute a query on the DuckDB connection.
   */
  async query(
    query: string,
  ): Promise<{ columns: ColumnInfo[]; data: TableData }> {
    const connection = await this.getConnection();

    return new Promise((resolve, reject) => {
      connection?.prepare(query, (err, statement) => {
        if (err) {
          reject(new Error(`Query preparation failed: ${err.message}`));
          return;
        }

        const columns = statement.columns();

        statement.all((err, data) => {
          if (err) {
            reject(new Error(`Query execution failed: ${err.message}`));
            return;
          }

          const result = convertTableDataToJSON(data, columns);

          resolve({ columns, data: result });
        });
      });
    });
  }

  /**
   * Close the DuckDB connection and cleanup resources.
   */
  async close(): Promise<void> {
    if (this.connection) {
      this.connection.close();
      this.connection = null;
    }
  }
}
