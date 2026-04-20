-- พารามิเตอร์: ? = legacyCustomerId (COMPID:IDNO)
SELECT CONCAT(h.BRANID, ':', h.RCPNO, ':', h.TRANSTS) AS id, DATE_FORMAT(h.RCPDTE, '%Y-%m-%d') AS receiptDate, IFNULL(h.RCPAMT, 0) AS amount, h.CONTNO AS contractNumber
FROM hpreceipt_header h
INNER JOIN hpcontract p ON p.BRANID = h.BRANID AND p.CONTNO = h.CONTNO
WHERE CONCAT(p.COMPID, ':', p.IDNO) = ?
ORDER BY h.RCPDTE DESC, h.RCPNO DESC
