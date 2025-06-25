import { ipcMain } from "electron";
import { DuckDBManager } from "@//db/duckdb-manager";

const duckDB = new DuckDBManager({});

ipcMain.handle("query", async (_event, query: string) => {
  const result = await duckDB.query(query);

  return result;
});
