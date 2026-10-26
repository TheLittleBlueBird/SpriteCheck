# Sprite Check v1.6.0

เครื่องมือเช็กและรวมภาพซ้ำใน Sprite Sheet แบบ local ธีมสีเข้ม mint/pink/gold ไม่อัปโหลดภาพหรือโปรเจกต์ และไม่แก้ไฟล์ต้นฉบับ การแก้ไขภาพทำงาน offline ได้; File → Update ใช้อินเทอร์เน็ตเพื่อตรวจและดาวน์โหลดโปรแกรมจาก GitHub

## ดาวน์โหลดและอัปเดต

[Windows x64 รุ่นล่าสุด](https://github.com/TheLittleBlueBird/SpriteCheck/releases/latest) — แตก ZIP ทั้งหมดในโฟลเดอร์ที่เขียนได้ แล้วเปิด **Sprite Check.exe**

ใช้ **File → Update → UPDATE & RESTART** เพื่อติดตั้งแพตช์ใหม่ โปรแกรมตรวจ SHA-256 และ manifest, เก็บงานปัจจุบันเป็น recovery DAT, สำรองไฟล์เดิม และเปิดงานต่อหลังรีสตาร์ต ค่า layout/ไฟล์งานอยู่ตามเดิม ข้อมูลสำรองและ log อยู่ `Updates/<job-id>/` เวอร์ชันเก่าที่ไม่มีปุ่มนี้ต้องดาวน์โหลด v1.6.0 ขึ้นไปครั้งแรกด้วยตนเอง ดู [วิธีเผยแพร่แพตช์](RELEASING.md)

## Build จาก source

ต้องมี Windows x64, .NET SDK (Roslyn), .NET Framework 4.8, Node.js 22+, Python 3 และ WebView2 Runtime

```powershell
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File desktop/restore-sdk.ps1
npm run build:windows
python desktop/package.py
powershell -NoProfile -ExecutionPolicy Bypass -File desktop/test-updater.ps1
```

ผล build อยู่ `dist/SpriteCheck-<version>-win-x64/` และ ZIP ข้างกัน เปิดเว็บแบบ local ได้ด้วย `npm start` แล้วเข้า http://127.0.0.1:4317/ รุ่นเว็บตรวจรุ่นและเปิดหน้าดาวน์โหลดได้ ส่วนการติดตั้งพร้อมรีสตาร์ตใช้โปรแกรม Windows

ภาพ `assets/test-sheet.png` เป็น fixture เรขาคณิต 116 เฟรมสำหรับ QA สร้างใหม่ได้ด้วย `node tests/generate-fixture.mjs` ไม่มีการโหลดภาพอัตโนมัติเมื่อเริ่มแอป

## File menu / Reset Scene / Compare Log v1.5.0

- เพิ่มเมนู **File** ด้านบน: Open Sprite Sheet, Open Project .DAT, Save Project .DAT และ **Reset Scene**
- ย้ายปุ่ม **OPEN .DAT / SAVE .DAT** ไปแถบบนสุด กดได้โดยไม่ต้องเปิดเมนู
- **Reset Scene** กลับหน้าว่าง ล้างภาพ ไทม์ไลน์ ประวัติ ผล Merge/Log และหยุดเล่น มี Cancel ก่อนยืนยัน ขนาดช่องที่จัดไว้ยังคงเดิม ภาพ/ไฟล์ต้นฉบับไม่ถูกแก้หรือลบ
- งานใหม่เริ่มซ่อน Compare Log เพื่อเพิ่มพื้นที่ภาพ กด **SHOW / HIDE COMPARE LOG** หรือปุ่ม × ที่หัว Log เพื่อเปิด–ปิด เปิด DAT จะคืนสถานะ Log ที่บันทึกไว้
- เมนู File รองรับลูกศร/Home/End/Enter/Escape โดยไม่แทรกคำสั่งเล่นหรือ Undo ของแอนิเมชัน

## Layout QA fix v1.4.1

แก้ ResizeObserver warning ระหว่างลากปรับความกว้างช่องหรือคืนค่าขนาด โดยรวมการคำนวณพื้นที่และวาด Sheet ไว้ในเฟรมถัดไป แทนการเปลี่ยนขนาดภายใน callback ของ ResizeObserver การลาก/คีย์ลัดยังตอบสนองทันที ค่าขนาดที่จำไว้และข้อมูลแอนิเมชันใช้แบบเดิม

## Readable / Resizable workspace v1.4.0

- ตัวอักษรใน UI อย่างน้อย **12px** รายการท่า/ชื่อไฟล์และข้อความหลัก 13–14px เพิ่มความชัดของข้อความรอง
- ลากเส้นแบ่งระหว่างรายการท่า / Sprite Sheet / Live Preview เพื่อปรับความกว้าง ขยาย viewport โดยลดความกว้างช่องข้าง ๆ ได้
- ลากเส้นแนวนอนเหนือ Timeline เพื่อปรับความสูง Timeline และ viewport ภาพคีย์เฟรมขยายตามพื้นที่
- ลากเส้นใต้ชื่อท่าใน Live Preview เพื่อปรับความสูงภาพ Preview ส่วน Inspector เลื่อนดูได้
- ดับเบิลคลิกเส้นแบ่งเพื่อคืนค่าช่องนั้น หรือกด **RESET LAYOUT** เพื่อคืนค่าทั้งหมด
- ใช้ Tab เลือกเส้นแบ่ง แล้วกดลูกศรปรับทีละ 10px, Shift+ลูกศร 40px, Home/End ไปขอบเขต ปุ่ม Esc ยกเลิกขณะลาก
- จำขนาดช่องในเครื่องนี้อัตโนมัติ หน้าต่างเล็กลงจะจำกัดขนาดให้ใช้งานได้ เมื่อขยายจะคืนขนาดที่เลือกไว้ การปรับพื้นที่ไม่เปลี่ยนคีย์เฟรม ประวัติ Undo หรือ DAT
- หน้าจอกว้างไม่เกิน 980px ใช้ช่องเรียงลงด้านล่างและเลื่อนหน้าได้ ตัวแบ่งซ่อนในโหมดนี้

## Compare playback v1.3.2

แก้ Pause/Play หลังเล่น Loop หลายรอบใน Compare ให้เล่นต่อจากเวลาและภาพเดิม รวมถึง Pause แล้วกลับไป Sprite Sheet เพื่อเล่นต่อ โดยรักษาเฟสของแอนิเมชัน การกด Play เมื่อแอนิเมชันแบบไม่ Loop จบแล้วจะเริ่มใหม่ตามเดิม

## Compare v1.3.1

หน้า Compare ซ่อนแถบเครื่องมือของ Sprite Sheet (Original/Merged sheet, Open/Drop PNG, Grid, Zoom/Fit ด้านบน) ใช้เครื่องมือประจำ viewport ซ้าย/ขวาใน Compare ได้ตามเดิม กลับหน้า Sprite Sheet แล้วแถบเดิมจะแสดงกลับมา

## UX และ QA v1.3.0

- แถบ **NEXT** แนะนำขั้นตอนและมีปุ่มทำต่อได้เลยตามสถานะ Import → Detect → Confirm → Merge → Export
- ปรับหน้าต่างเตี้ยให้ Timeline/Scrubber อยู่ในจอ ปุ่มบน Sheet ย้ายบรรทัดเมื่อพื้นที่ไม่พอ และคีย์ที่เลือกเลื่อนเข้ามาใน Timeline อัตโนมัติ
- หลัง Detect ใช้ **‹ / › กลุ่มซ้ำ** ด้านขวาไล่ดูทุกกลุ่มและเลื่อน Sheet ไปยังภาพนั้นได้
- แก้ Hold / Undo / Redo แล้ว Preview คงอยู่ที่คีย์ที่เลือก สลับ Playback source หรือ Sheet/Compare แล้วคงเวลาไว้ เล่นต่อจากคีย์สุดท้ายได้
- **← / →** เลื่อนทีละ tick เมื่อไม่ได้แก้ช่อง input; Delete ในช่องตัวเลขใช้แก้ตัวเลข ไม่ลบคีย์เฟรม ปุ่ม Hold และ Move ปิดที่ขอบเขตที่ใช้งานไม่ได้
- กรอกค่าเดิมไม่กินประวัติ Undo หรือทิ้ง Redo/ผล Merge
- Live Preview อยู่ด้านบนเสมอระหว่างเลื่อน Inspector และ DAT จำ source ที่เลือกไว้ได้ แม้ภาพนั้นถูกลบจากไทม์ไลน์แล้ว

การทดสอบอัตโนมัติอยู่ใน tests/ และ desktop/UpdaterTests.cs โดยใช้ภาพเรขาคณิตที่สร้างขึ้นเอง ไม่ใช้ภาพของ Artist ใน repository สาธารณะ

## การเลือกเฟรม v1.2.2

คลิกภาพใน Sprite Sheet ตรงกลางแล้ว Live Preview จะแสดงภาพนั้นทันที พร้อมเลือกแถว/คีย์ที่สัมพันธ์กันและหยุดเล่นค้างไว้ ไทม์ไลน์เลื่อนไปจุดเริ่มคีย์โดยนับ Hold ของคีย์ก่อนหน้า ใช้ได้ทั้ง Original sheet และ Merged sheet การเลือกไม่เปลี่ยนรูปหรือประวัติ Undo/Redo

ถ้าภาพนั้นถูกลบจาก Edited timeline แล้ว จะเปิดดูผ่าน Original ให้ก่อน โดยยังคงการลบไว้และกด Add Key เพื่อเพิ่มกลับได้ ภาพที่อ้างอิงหลายคีย์จะเลือกคีย์แรกเมื่อคลิกจาก Sheet; คลิกบน Timeline เพื่อเลือกแต่ละครั้งที่ใช้ซ้ำ

## คีย์ลัดและประวัติ v1.2.1

**Spacebar** เล่น/หยุด ทั้งหน้า Sheet และ Compare รวมเมื่อโฟกัสปุ่ม ช่องตัวเลข Checkbox หรือ Select (กดค้างไม่สลับรัว) **Ctrl+Z** Undo, **Ctrl+Y** หรือ **Ctrl+Shift+Z** Redo รองรับตำแหน่งปุ่ม Z/Y แม้ใช้แป้นพิมพ์ไทย เก็บการแก้ไขล่าสุดสูงสุด **50 ขั้น** ทั้งสองทิศทาง มีตัวนับบน Timeline แก้ไขใหม่หลัง Undo จะทิ้งกิ่ง Redo เดิม

ถ้าเลข Hold/FPS ยังไม่ได้ยืนยัน คีย์ลัดจะจบการแก้ช่องก่อน ใช้ประวัติโปรเจกต์ในช่องตัวเลขได้ ส่วนการพิมพ์ข้อความและ dialog ยังคงใช้ปุ่มตามปกติ ประวัติเป็นของ session ปัจจุบัน เปิด PNG/เปลี่ยน Grid/เปิด DAT จะเริ่มประวัติใหม่

## การใช้งาน v1.2

- เปิดโปรแกรมใหม่เป็น **หน้าว่าง** ไม่มีการเปิด demo หรือโปรเจกต์ล่าสุดเอง ใช้ OPEN SPRITE SHEET / OPEN .DAT หรือลากไฟล์ลง viewport
- คลิกแถวเพื่อเลือก **ดับเบิลคลิกชื่อ Animation Row เพื่อเริ่มเล่นจากต้นท่า** ได้ทั้งหน้า Sheet และ Compare
- PNG ที่นำเข้าใหม่ตั้ง **Loop = on ทุกแถว** รวม Hit, Die และ Attack ปิดเป็นรายท่าได้ ส่วน `.dat` ที่บันทึกไว้จะใช้ค่า Loop ตามไฟล์นั้น
- เข้า **COMPARE ได้ทันทีหลังเปิดไฟล์** ฝั่งซ้ายแสดง Original ฝั่งขวาแสดง Edited Preview ก่อน Merge และเปลี่ยนเป็นผลจริงหลัง Merge
- ใน Compare เลือกแต่ละฝั่งเป็น **Animation / Sprite sheet** ได้ ซูมด้วยปุ่มหรือ wheel, ลากภาพเพื่อ Pan, FIT และ 1:1, Sync view หรือแยกมุมมอง และปรับสัดส่วนซ้าย–ขวาด้วยแถบเลื่อน
- **HIDE LOG / SHOW LOG** ใช้เพิ่มพื้นที่ Preview และเปิดตารางข้อมูลกลับมาได้
- **COMPARE LOG** แสดง Resolution, PNG bytes, JSON bytes, ยอดรวมและเปอร์เซ็นต์เล็กลง/ใหญ่ขึ้น, จำนวนภาพ, แถว/ticks และ RGBA32 จากพิกเซล ×4 (เป็นค่าคำนวณ ไม่ใช่ Unity memory ที่วัดจริง) ค่าหลังรวมจะแสดงเมื่อ Merge สำเร็จเท่านั้น
- แก้คีย์หลัง Merge แล้ว Compare ยังเปิดอยู่ แสดง Edited Preview และล้างตัวเลขผล Merge เก่า บันทึกมุมมอง Compare/Zoom/Pan/Split/Hide Log ไปกับ `.dat` ได้

## โปรแกรม Windows (แนะนำ)

ไฟล์ build อยู่ที่ `../Releases/SpriteCheck-1.5.0-win-x64/` ดับเบิลคลิก **Sprite Check.exe** ได้เลย หรือแตก ZIP `../Releases/SpriteCheck-1.5.0-win-x64.zip` ทั้งโฟลเดอร์ก่อนเปิด EXE ไม่ต้องเปิด Node หรือเซิร์ฟเวอร์

ต้องใช้ Windows x64, .NET Framework 4.8+ และ Microsoft Edge WebView2 Runtime เครื่องนี้ทดสอบกับ WebView2 155.0.4283.62 แล้ว ถ้าเครื่องอื่นไม่มี Runtime ให้ติดตั้งจาก [Microsoft](https://developer.microsoft.com/microsoft-edge/webview2/consumer/) โปรแกรมใช้ UserData ข้าง EXE จึงควรแตกลงโฟลเดอร์ที่เขียนได้ เก็บ EXE, DLL และ app/ ไว้ด้วยกัน

ภาพไอคอนใหม่อยู่ใน `assets/sprite-check-icon.png` และ `assets/sprite-check.ico` ฝังใน EXE และใช้ใน UI แล้ว ไอคอน PNG มี alpha โปร่งใส ขนาด 1254×1254; ICO มี 7 ขนาด 16–256 px

## เปิดแบบเว็บจาก source

ดับเบิลคลิก **Start Sprite Check.cmd** ในโฟลเดอร์นี้ โปรแกรมใช้ Node.js ที่ติดตั้งอยู่และเปิด `http://127.0.0.1:4317` ในเบราว์เซอร์ ใช้ Edge หรือ Chrome รุ่นปัจจุบัน ไม่ต้อง `npm install`

หรือเปิด Terminal ในโฟลเดอร์นี้แล้วรัน `npm start` จากนั้นเปิด URL ด้านบน เซิร์ฟเวอร์รับการเชื่อมต่อเฉพาะเครื่องนี้เท่านั้น ปิดด้วย Ctrl+C หากเริ่มจาก Terminal

ถ้าเปิดด้วยตัว Launcher ใช้ **Stop Sprite Check.cmd** เมื่อต้องการปิดเซิร์ฟเวอร์ ตัวปิดตรวจทั้งพอร์ตและตำแหน่งสคริปต์ก่อนหยุด process

## วิธีใช้

1. **OPEN SPRITE SHEET**: เลือกไฟล์ หรือ **ลาก PNG มาวางบน viewport ตรงกลาง** ได้โดยตรง จะขึ้นกรอบ DROP PNG TO OPEN เมื่อพร้อมรับไฟล์ ใช้ได้ทั้งหน้า Sprite Sheet และ Compare มีปุ่ม OPEN / DROP PNG บน viewport สำหรับเลือกไฟล์ด้วย หากวางหลายไฟล์จะเลือก PNG แรก ไฟล์ที่ไม่รองรับหรือเสียหายจะไม่แทนที่งานที่เปิดอยู่
2. **GRID**: กำหนดขนาดช่อง, ขอบซ้าย/บน และระยะห่างระหว่างช่อง ภาพตัวอย่างคือช่อง 105×115 px รวม 13 คอลัมน์ 12 แถว การ Apply Grid จะเริ่มไทม์ไลน์ใหม่จากภาพต้นฉบับ
3. เลือกแถวและกด **Play** เพื่อเล่นแอนิเมชัน เลือก FPS และ Loop ได้ แถวโปร่งใสทั้งหมดจะคงชื่อแถวไว้ แต่ไม่เพิ่มคีย์จากช่องว่าง
4. **DETECT**: กรอบสีและ G หมายเลขเดียวกันหมายถึงภาพ RGBA ตรงกันทุกพิกเซล ตรวจทั่วทั้ง Sheet และยืนยันความเท่ากันของข้อมูลหลังจัดกลุ่มแฮช ไม่รวมภาพที่แค่คล้ายกัน
5. เลือกคีย์ในไทม์ไลน์ หรือคลิกภาพใน Sheet เพื่อแก้ไข ควบคุม **Hold** เพื่อค้างภาพหลาย ticks, **Add Key / Duplicate / Remove**, ย้ายซ้าย–ขวาหรือลากคีย์ และ Undo/Redo ได้ การแก้คีย์จะสลับไปเล่น Edited timeline
6. **CONFIRM**: ยืนยันฉบับแก้ไข ข้อมูล Original ยังคงเดิม
7. **MERGE**: เลือก Within each row หรือ Share across rows ก่อนรวมภาพ โปรแกรมจัดภาพใหม่โดยไม่หมุน/ตัดขอบหรือเปลี่ยนขนาดช่อง และคงชื่อท่า/ลำดับแถวไว้
8. **COMPARE**: เล่น Original กับผล Merge พร้อมกันจากเวลาเดียวกัน หรือเลือก Playback เป็น Original / Edited timeline / Merged result เลื่อนแถบเวลาด้านล่างได้
9. **EXPORT**: ดาวน์โหลด `ชื่อ-merged.png` และ `ชื่อ-merged.json` สองไฟล์ หากเบราว์เซอร์ถาม ให้อนุญาต multiple downloads หรือกดดาวน์โหลดแต่ละไฟล์แยกกัน

คีย์ลัด: Space เล่น/หยุด, Delete ลบคีย์ใน Edited, Ctrl+Z Undo, Ctrl+Y หรือ Ctrl+Shift+Z Redo (50 ขั้น)

แก้คีย์หลัง Merge หรือเปลี่ยนขอบเขต Merge จะยกเลิกผล Merge เดิมเพื่อป้องกัน Export ข้อมูลเก่า ต้อง Confirm/Merge ใหม่ตามสถานะ ไม่แก้ไฟล์ที่ดาวน์โหลดไปแล้ว การรีเฟรชหรือปิดหน้าเริ่ม session ใหม่ ควรกด SAVE .DAT ก่อนปิดเพื่อเก็บงานไว้แก้ไขต่อ

## เก็บโปรเจกต์ .dat

- กด **SAVE .DAT** เก็บ PNG ต้นฉบับไว้ในไฟล์เดียว พร้อม GRID ลำดับคีย์ Hold/FPS/Loop ทุกแถว ฉบับ Confirm สถานะ Detect/Merge ชื่อ Export และแถว/เวลา/หน้า Compare ที่เลือก
- กด **OPEN .DAT** หรือวางไฟล์ `.dat` บน viewport เพื่อเปิดแก้ต่อ ไม่ต้องมี PNG แยกอยู่ในโฟลเดอร์เดิม เปิดแบบหยุดเล่นเพื่อเริ่มตรวจต่อได้
- เปิดตัวอย่าง **Samples/SkeletonSword.dat** ได้ทันที: ใช้ภาพเดิม 116 playback ticks, คง 12 แถว, Merge ภายในแถวเหลือ 107 ภาพที่จัดเก็บ จังหวะยังเป็นต้นฉบับ
- บันทึกงานที่ยังไม่ Confirm ได้ ฉบับร่างกับฉบับ Confirm จะคืนกลับแยกกัน หลังเปิด Undo/Redo เริ่มประวัติใหม่ ส่วนไทม์ไลน์และการตั้งค่าคงเดิม ไม่บันทึกการเล่นที่กำลังเดินอยู่
- มี version header และ SHA-256 สำหรับตรวจไฟล์ขาด/เสีย ถ้าเปิดไม่ผ่านจะคงโปรเจกต์ที่เปิดอยู่ ขนาด PNG ต้นฉบับสูงสุด 64 MiB และ metadata สูงสุด 4 MiB
- บน Windows build ใช้ Save As ของ Windows เพื่อเลือกที่เก็บ เขียนไฟล์ชั่วคราวข้างปลายทางก่อนแทนที่ หลังเลือกยอมรับการเขียนทับในหน้าต่าง Save As เท่านั้น บนเว็บจะเป็นการดาวน์โหลดไฟล์
- `.dat` ใช้เก็บงาน Sprite Check; ส่งเข้า Unity ด้วย **EXPORT PNG + JSON** ตามเดิม

## ลำดับแถว

1. Idle FL
2. Idle BL
3. Walk FL
4. Walk BL
5. Hit FL
6. Hit BL
7. Die FL
8. Die BL
9. ATK01 FL
10. ATK01 BL
11. ATK02 FL
12. ATK02 BL

ไฟล์ที่มีแถวเกิน 12 ใช้ชื่อ Row 13 เป็นต้นไป จำนวนแถวเดิมยังคงอยู่หลัง Merge รวมแถวที่ว่าง

**Within each row**: แต่ละท่ามีภาพของตนเองในแถวนั้น ภาพซ้ำภายในแถวเก็บครั้งเดียว

**Share across rows**: ภาพซ้ำทั้ง Sheet เก็บครั้งแรกเพียงที่เดียว แถวอื่นอ้างภาพนั้นจาก JSON ได้ บางแถวจึงมีภาพน้อยลงหรือว่าง แต่ animation object และหมายเลขแถวยังอยู่ครบ

ตัวอย่างที่แนบมี 116 คีย์ / 96 ภาพไม่ซ้ำทั่ว Sheet; แบบ Within each row จะเก็บ 107 ภาพ เพราะมีภาพซ้ำข้ามแถวที่ยังแยกเก็บไว้ 11 คู่ ขนาดแผ่นขึ้นกับแถวที่มีภาพไม่ซ้ำมากที่สุด การคง 12 แถวทำให้ลดพื้นที่ได้น้อยกว่าการแพ็กข้ามแถวโดยไม่รักษาโครงแถว

## JSON สำหรับ Unity

`format` = `sprite-check`, `version` = 1. พิกัด `frames[].x/y` เริ่มที่มุมซ้ายบน หน่วยพิกเซล และ `frames[].id` ตรงกับ index ใน frames array

```json
{
  "format": "sprite-check",
  "version": 1,
  "image": "idle-merged.png",
  "coordinateOrigin": "top-left",
  "cellWidth": 105,
  "cellHeight": 115,
  "width": 210,
  "height": 1380,
  "columns": 2,
  "rows": 12,
  "pixelsPerUnit": 64,
  "pivot": { "x": 0.5, "y": 0.08 },
  "mergeScope": "row",
  "frames": [
    { "id": 0, "x": 0, "y": 0, "width": 105, "height": 115, "row": 0, "sourceColumn": 0 },
    { "id": 1, "x": 105, "y": 0, "width": 105, "height": 115, "row": 0, "sourceColumn": 4 }
  ],
  "animations": [
    { "id": "idle_fl", "name": "Idle FL", "row": 0, "fps": 10, "loop": true, "totalTicks": 8,
      "timeline": [ { "frame": 0, "ticks": 4 }, { "frame": 1, "ticks": 4 } ] }
  ]
}
```

ตัวอย่างนี้สรุป schema; ไฟล์ส่งออกจริงมี animation object ครบทุกแถว เวลาแต่ละรายการคือ `ticks / fps` วินาที เช่น 8 ticks ที่ 10 FPS ยังคงยาว 0.8 วินาทีแม้เหลือภาพจริง 2 ภาพ

Unity ไม่อ่าน schema นี้เองโดยอัตโนมัติ มีตัวอ่านให้ใน **Unity/SpriteCheckPlayer.cs**:

1. คัดลอกสคริปต์นี้และ PNG/JSON ที่ Export เข้า Assets ของโปรเจกต์ทดสอบ
2. PNG: เลือก Texture Type = Default หรือ Sprite, Filter Mode = Point, Compression = None, Generate Mip Maps = off, NPOT = None ถ้ามี และ Max Size ให้พอขนาดภาพ เพื่อให้ขนาดตรง JSON
3. สร้าง GameObject ที่มี SpriteRenderer แล้วเพิ่ม SpriteCheckPlayer
4. ใส่ PNG ใน Sprite Sheet และ JSON ใน Manifest Json เลือก Animation Index 0–11 แล้ว Play
5. สคริปต์แปลงพิกัด Y, สร้าง Sprite แบบ FullRect ด้วย Pivot/PPU จาก JSON และเล่น Hold/Loop ตามท่า ใช้ `Play(index)`, `Pause()`, `SeekSeconds(seconds)` ได้

สคริปต์เป็น companion แยก ยังไม่ได้ติดตั้งหรือแทน MonsterSpriteSet/ระบบต่อสู้ของ Atlas การทดสอบใน Unity จริงยังแยกจากการทดสอบเว็บแอป

## ขอบเขตและการตรวจสอบ

- PNG RGB/RGBA/grayscale 8-bit และ indexed palette 1/2/4/8-bit แบบ non-interlaced ตัวอ่าน PNG ตรวจ CRC และรักษา RGBA รวม RGB ที่ซ่อนใต้ alpha 0; ไม่ใช้ Canvas เพื่อแปลงข้อมูลที่ส่งออก
- จำกัด 16 megapixels และ 4,096 ช่องต่อ Sheet; ไฟล์ 16-bit/interlaced ต้อง Export เป็น PNG 8-bit non-interlaced จากแอปวาดก่อน
- Empty = ทุกพิกเซล alpha 0 หาก Artist ส่งภาพพื้นหลังทึบ ช่องพื้นหลังจะถือเป็นภาพ
- PNG Export เป็น lossless RGBA ไม่มีการลดสี หมุน หรือตัดขอบ ไม่มี padding เพิ่ม จึงควรใช้ Point filtering ตามแนว pixel art
- ขนาด PNG ใหม่อาจมากหรือน้อยกว่าเดิมตาม encoder และการคงแถว ไม่ได้หมายความว่าหน่วยความจำเกมลดลงในอัตราเดียวกัน
- ทุกคีย์ยังเก็บ ticks; ลำดับภาพที่ซ้ำติดกันจะรวมรายการ JSON และบวก ticks เพื่อรักษาเวลา

ทดสอบ: `npm test` สำหรับ core/PNG และ `node tests/browser.mjs` สำหรับ Edge + Playwright (หากมีแพ็กเกจ Playwright) รายงานงานส่งมอบอยู่ใน `../../knowledge/evidence/sprite-check-tool-2026-10-25/`

## Build Windows จาก source

ใช้ .NET SDK/Roslyn ที่ติดตั้งในเครื่องเพื่อคอมไพล์ WinForms target .NET Framework 4.8 และ WebView2 SDK `1.0.4314.35` จาก NuGet ทางการ (เก็บใน `desktop/vendor/`, ไม่มีการติดตั้ง global)

```powershell
npm test
node desktop/make-sample.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File desktop/build.ps1
```

build สร้าง `../Releases/SpriteCheck-1.5.0-win-x64/` ใช้ EXE + WebView2 DLL + app assets แทน Node server ไม่แก้ registry หรือสร้าง file association เอง เปิด `.dat` ด้วยปุ่มในโปรแกรมหรือลากไฟล์ หรือรัน `"Sprite Check.exe" "path/to/project.dat"` ได้

การทดสอบ native: `"Sprite Check.exe" --self-test "absolute-output-folder"` ใช้ real WebView2 โหลดแอป แก้ Hold ตรวจ Merge/Compare บันทึกและเปิด DAT กลับ ส่งออก PNG/JSON และจับ screenshot ในโฟลเดอร์ที่ระบุ โหมดนี้ใช้ปลายทางอัตโนมัติแทนให้ผู้ใช้เลือก Save As; ไม่ใช่การทดสอบคลิกหน้าต่าง Explorer จริง

หลักฐาน v1.2.1: `../../knowledge/evidence/sprite-check-shortcuts-v121-2026-10-25/` ทดสอบ Node 39 ข้อ, UI keyboard 11 ข้อ และ native runtime จริง แยกจาก Unity Play ซึ่งยังไม่ได้ทดสอบ

หลักฐานการเลือกเฟรม v1.2.2: `../../knowledge/evidence/sprite-check-selection-v122-2026-10-25/` รวมการตรวจพิกเซล Preview, เวลา Hold, ภาพที่ถูกลบ, ภาพใช้ซ้ำ, Zoom/Scroll และผล Merge

หลักฐาน UX/QA v1.3.0: `../../knowledge/evidence/sprite-check-ux-v130-2026-10-25/` และ `QA/dewey-review.md` รวมบัคก่อน/หลังแก้, การตรวจอิสระของดิวอี้, UI regression, physical keys และ native runtime
