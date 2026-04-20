/** MariaDB / MySQL: ER_DUP_ENTRY */
export const MYSQL_ERR_DUPLICATE = 1062;
/** ER_NO_SUCH_TABLE */
export const MYSQL_ERR_NO_SUCH_TABLE = 1146;

export function mysqlErrno(e: unknown): number | undefined {
  if (e && typeof e === 'object' && 'errno' in e && typeof (e as { errno: unknown }).errno === 'number') {
    return (e as { errno: number }).errno;
  }
  return undefined;
}
