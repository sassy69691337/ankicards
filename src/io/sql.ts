import type { SqlJsStatic } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url'

let promise: Promise<SqlJsStatic> | null = null

/** Загружает SQLite (WASM) только когда он нужен — при импорте APKG */
export function loadSql(): Promise<SqlJsStatic> {
  promise ??= import('sql.js').then((m) => m.default({ locateFile: () => wasmUrl }))
  return promise
}
