# Deploy GrocerAI ออนไลน์ (Render + SQL Server)

| ส่วน | บริการ |
|---|---|
| แอป (Docker) | [Render](https://render.com) Web Service |
| ฐานข้อมูล | SQL Server ที่เข้าถึงได้จากอินเทอร์เน็ต เช่น [Azure SQL Database](https://azure.microsoft.com/products/azure-sql/database) |

Neon ใช้ไม่ได้กับโปรเจกต์นี้ เพราะ Neon เป็น PostgreSQL ส่วนโค้ดนี้ใช้ SQL Server (T-SQL) ครับ
Render ไม่มี SQL Server ให้เช่าแบบจัดการเอง จึงต้องใช้ SQL Server จากที่อื่น

## 1. เตรียมฐานข้อมูล
1. สร้าง SQL Server และ database ชื่อ `GroceryAI` (หรือให้ login มีสิทธิ์สร้าง database เอง)
2. เปิด firewall ให้ Render เข้าถึงได้ (Azure: Networking → อนุญาต IP ของ Render หรือ "Allow Azure services" ตามนโยบายของคุณ)
3. จด connection string แบบ SQL login:
   `Server=<host>,1433;Database=GroceryAI;User Id=<user>;Password={<password>};Encrypt=true;`

## 2. Deploy บน Render
1. **New → Blueprint** → เลือก repo นี้ Render อ่าน `render.yaml` ให้เอง
2. ใส่ค่า `MSSQL_CONNECTION_STRING` จากขั้นที่ 1 (และ `GEMINI_API_KEY` ถ้าต้องการ AI)
3. รอ build เสร็จ แล้วเปิด `https://<ชื่อแอป>.onrender.com/staff/setup` เพื่อสร้าง admin คนแรก

ตาราง schema ถูกสร้างอัตโนมัติตอนแอปเริ่มทำงาน (migrations)

## หมายเหตุ
- แผน Free ของ Render จะหลับเมื่อไม่มีคนใช้ ครั้งแรกหลังหลับใช้เวลาสักครู่
- `TRUST_PROXY=1` และ `COOKIE_SECURE=true` ถูกตั้งไว้ใน `render.yaml` แล้ว ห้ามลบ ไม่งั้น login/POST จะถูกปฏิเสธหรือ cookie ไม่ปลอดภัย
- อย่าใส่รหัสผ่านหรือ connection string ลงใน repo ใส่ใน Environment ของ Render เท่านั้น
