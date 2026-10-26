# เผยแพร่แพตช์ Sprite Check

Repository: https://github.com/TheLittleBlueBird/SpriteCheck

ผู้ใช้โปรแกรมเลือก **File → Update → UPDATE & RESTART** เพื่ออัปเดตจาก Release ล่าสุดแบบ stable ไม่ต้องมีบัญชี GitHub โปรแกรมตรวจ SHA-256 จาก GitHub ตรวจ manifest ทุกไฟล์ เก็บ recovery `.dat` สำรองไฟล์โปรแกรม แล้วรีสตาร์ตและเปิดงานต่อ เก็บหลักฐาน/สำรองไว้ใน `Updates/<job-id>/` ค่า layout ใน `UserData/` และไฟล์งานอื่นไม่ถูกแทนที่

รุ่นเก่าที่ไม่มีเมนู Update ต้องดาวน์โหลดและแตก v1.6.1 ขึ้นไปด้วยตนเองหนึ่งครั้งก่อน เอกสารโปรเจกต์ DAT ยังคง schema 1; ประวัติ Undo เริ่มใหม่เมื่อเปิด DAT

## สำหรับเจ้าของโปรเจกต์

1. แก้โค้ดและทดสอบใน branch ตามปกติ
2. รัน `python desktop/bump-version.py 1.6.4` โดยเปลี่ยนเลขให้สูงกว่ารุ่นปัจจุบัน สคริปต์เตรียมเลขรุ่นให้ตรงกันทั้ง UI/EXE/manifest เท่านั้น
3. รัน `npm test` และ build/test บน Windows ตาม README ตรวจ native UI ก่อนเผยแพร่
4. ตรวจไฟล์ที่จะ commit แล้ว commit ลง GitHub; ไม่ใส่ภาพ Artist, `.dat`, `UserData`, SDK cache หรือบันทึก QA ภายใน
5. สร้าง tag ให้ตรงกับ package version แล้ว push เช่น `git tag v1.6.4` และ `git push origin main v1.6.4`
6. GitHub Actions จะทดสอบและ build ZIP + SHA-256 แล้วสร้าง GitHub Release เมื่อผ่าน ตรวจหน้า Actions/Release ว่าสำเร็จ ผู้ใช้จึงจะเห็นรุ่นใหม่ใน File → Update

ใช้ Release แบบ stable และชื่อ asset `SpriteCheck-<version>-win-x64.zip` ตามสคริปต์ ห้ามเปลี่ยนไฟล์ของ Release เดิม ใช้เลขรุ่นใหม่ทุกครั้ง GitHub API ต้องส่ง `digest: sha256:...` ของ asset มิฉะนั้นแอปจะปฏิเสธการติดตั้ง

## เมื่ออัปเดตมีปัญหา

- ปัญหาเครือข่าย/ไฟล์ไม่ผ่านการตรวจ: โปรแกรมปัจจุบันยังเปิดอยู่ กด Check Again ได้
- ติดตั้งไม่สำเร็จ: helper พยายามคืนไฟล์จาก `Updates/<job-id>/backup/` และเปิด recovery DAT ให้ สำรองกับ log ไม่ถูกลบทิ้ง
- หากมีอีก instance ล็อกไฟล์ หรือโปรแกรมใหม่ไม่ยอมปิด ให้ปิด instance นั้นก่อนคืนไฟล์สำรอง ดูข้อความใน `update.log` ห้ามลบไฟล์งานหรือ `UserData/` เพื่อแก้ปัญหา

API: [GitHub latest releases](https://docs.github.com/en/rest/releases/releases#get-the-latest-release), [release asset digests/downloads](https://docs.github.com/en/rest/releases/assets#get-a-release-asset). โปรแกรมไม่เก็บ GitHub token และไม่ส่งภาพหรือ DAT ออกเครือข่าย
