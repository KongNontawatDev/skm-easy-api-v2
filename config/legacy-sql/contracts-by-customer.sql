-- พารามิเตอร์: ? = legacyCustomerId (COMPID:IDNO)
SELECT CONCAT(p.BRANID, ':', p.CONTNO) AS contractRef, p.CONTNO AS contractNumber, IFNULL(car.BRAND, '') AS brand, IFNULL(car.MODEL, '') AS model, IFNULL(car.CARYEAR, 0) AS year, IFNULL(col.COLORNAM, IFNULL(car.COLOR, '')) AS color, IFNULL(p.OUTSBAL, 0) AS remainingAmount, DATE_FORMAT(COALESCE(p.FIRSTDTE, p.APRVDTE), '%Y-%m-%d') AS nextPaymentDate, IFNULL(p.CONTSTS, '') AS status, 0 AS progress
FROM hpcontract p
LEFT JOIN hpcar car ON car.BRANID = p.BRANID AND car.CONTNO = p.CONTNO
LEFT JOIN color_table col ON col.COLOR = car.COLOR
WHERE CONCAT(p.COMPID, ':', p.IDNO) = ?
