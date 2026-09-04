import { describe, expect, it } from "vitest";
import { mysqlAffectedRows, mysqlClaimSucceeded } from "./mysql-result";

describe("mysql affectedRows parsing (fail-closed)", () => {
  it("reads drizzle/mysql2 tuple [ResultSetHeader, fields]", () => {
    expect(mysqlAffectedRows([{ affectedRows: 1 }, []])).toBe(1);
    expect(mysqlClaimSucceeded([{ affectedRows: 1 }, []])).toBe(true);
  });

  it("reads a bare ResultSetHeader", () => {
    expect(mysqlAffectedRows({ affectedRows: 1 })).toBe(1);
    expect(mysqlAffectedRows({ affectedRows: 0 })).toBe(0);
  });

  it("reads rowsAffected as a fallback", () => {
    expect(mysqlAffectedRows({ rowsAffected: 1 })).toBe(1);
  });

  it("never treats missing affectedRows as a successful claim", () => {
    expect(mysqlAffectedRows(undefined)).toBe(0);
    expect(mysqlAffectedRows(null)).toBe(0);
    expect(mysqlAffectedRows([])).toBe(0);
    expect(mysqlAffectedRows({})).toBe(0);
    expect(mysqlAffectedRows("ok")).toBe(0);
    expect(mysqlClaimSucceeded([{ changedRows: 1 }, []])).toBe(false);
    expect(mysqlClaimSucceeded([{ affectedRows: 2 }, []])).toBe(false);
  });
});
