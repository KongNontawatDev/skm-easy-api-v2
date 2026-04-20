-- พารามิเตอร์: ? = เบอร์ 10 หลัก (รูปแบบ 0xxxxxxxxx)
SELECT CONCAT(c.COMPID, ':', c.IDNO) AS legacyCustomerId, c.TELNO AS phone, c.THNAME, c.THSURN, c.COMPID, c.IDNO
FROM acct_cust c
LEFT JOIN acct_cust_address a ON a.COMPID = c.COMPID AND a.IDNO = c.IDNO AND a.ADRTYP IN ('02', '2')
WHERE REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(NULLIF(TRIM(a.MOBILE), ''), NULLIF(TRIM(c.TELNO), '')), '-', ''), ' ', ''), '(', ''), ')', '') = ?
LIMIT 1
