import { ColumnInfo, ListTypeInfo, TableData, TypeInfo } from "duckdb";
import { isNil } from "lodash";

export const convertDuckDBValueToJS = (
  field: TypeInfo,
  value: unknown,
): unknown => {
  if (isNil(value)) return null;

  switch (field.id) {
    case "SQL_NULL":
      return null;
    case "DATE":
    case "TIME":
    case "TIMESTAMP":
      return new Date(value as string).toISOString();
    case "FLOAT":
    case "DOUBLE":
      return value;
    case "INTEGER":
    case "TINYINT":
    case "SMALLINT":
    case "BIGINT":
    case "UTINYINT":
    case "USMALLINT":
    case "UINTEGER":
    case "UBIGINT":
    case "HUGEINT":
    case "UHUGEINT":
      return parseInt((value as object).toString(), 10);
    case "DECIMAL":
      return parseFloat((value as object).toString());
    case "LIST": {
      if (!value) return [];
      const listValue = value as [];
      return listValue.map(item =>
        convertDuckDBValueToJS((field as ListTypeInfo).child, item),
      );
    }
    default:
      return value;
  }
};

export const convertTableDataToJSON = (
  data: TableData,
  columns: ColumnInfo[],
): Record<string, unknown>[] => {
  return data.map((row: Record<string, unknown>) => {
    return columns.reduce(
      (acc, column) => {
        acc[column.name] = convertDuckDBValueToJS(
          column.type,
          row[column.name],
        );
        return acc;
      },
      {} as Record<string, unknown>,
    );
  });
};
