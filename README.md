# Tauri + React

This template should help get you started developing with Tauri and React in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

คู่มือการติดตั้ง FB Downloader (User Guide)
โปรแกรมนี้เป็นเครื่องมือสำหรับดาวน์โหลดวิดีโอจาก Facebook โดยทำงานร่วมกันระหว่าง Desktop Application และ Chrome Extension เพื่อการทำงานที่สะดวกและรวดเร็ว

1. ขั้นตอนการติดตั้งโปรแกรม (Desktop App)
ไปที่หน้า [Releases] บน GitHub ของโปรเจกต์

เลือกดาวน์โหลดไฟล์ติดตั้งเวอร์ชันล่าสุดสำหรับระบบปฏิบัติการของคุณ:

macOS: ดาวน์โหลดไฟล์นามสกุล .dmg

Windows: ดาวน์โหลดไฟล์นามสกุล .msi

ดำเนินการติดตั้งโปรแกรมตามขั้นตอนของระบบปฏิบัติการ (สำหรับ macOS ให้ลากไอคอนโปรแกรมลงในโฟลเดอร์ Applications)

เปิดโปรแกรม FB Downloader ขึ้นมา เพื่อให้ระบบเซิร์ฟเวอร์เบื้องหลังเริ่มทำงาน (ห้ามปิดหน้าต่างนี้ขณะดาวน์โหลด)

2. ขั้นตอนการติดตั้งส่วนขยาย (Chrome Extension)
ดาวน์โหลดโฟลเดอร์ extension จากใน Source Code ของโปรเจกต์มาไว้ที่เครื่องของคุณ

เปิด Google Chrome และพิมพ์ chrome://extensions/ ที่ช่อง URL

เปิด "โหมดนักพัฒนาซอฟต์แวร์" (Developer mode) ที่มุมขวาบนของหน้าจอให้เป็นสีฟ้า

กดปุ่ม "โหลดส่วนขยายที่ยังไม่ได้แพ็ก" (Load unpacked) ที่มุมซ้ายบน

เลือกโฟลเดอร์ extension ที่คุณดาวน์โหลดมาติดตั้ง

3. การตั้งค่าก่อนเริ่มใช้งาน
เปิดโปรแกรม FB Downloader ขึ้นมา แล้วกดที่ปุ่ม "🧩 เปิดโฟลเดอร์ติดตั้ง Extension" เพื่อตรวจสอบความเรียบร้อย

ตั้งค่า ที่จัดเก็บไฟล์ (Directory) ในหน้าโปรแกรมให้เรียบร้อย แล้วกด "บันทึกการตั้งค่า" เพื่อให้ระบบจดจำ Path ในเครื่องของคุณ

4. วิธีใช้งาน
เปิดหน้าเว็บ Facebook ไปยังวิดีโอที่คุณต้องการดาวน์โหลด

กดปุ่มดาวน์โหลดที่ปรากฏบนหน้าวิดีโอผ่านทางส่วนขยาย (Extension)

ระบบจะส่งข้อมูลไปยังโปรแกรม FB Downloader เพื่อเริ่มการดาวน์โหลดอัตโนมัติ

คุณสามารถติดตามสถานะการทำงานได้ที่หน้า "🖥️ Server Logs" ในหน้าตั้งค่าโปรแกรม

หมายเหตุ: หากพบปัญหาการเชื่อมต่อ ให้ตรวจสอบว่าตัวโปรแกรม FB Downloader เปิดรันอยู่ และลองรีเฟรชหน้าเว็บ Facebook อีกครั้งครับ
