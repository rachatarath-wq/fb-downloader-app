import { resolveResource } from '@tauri-apps/api/path';
//import { open } from '@tauri-apps/plugin-shell';
//import { open } from '@tauri-apps/plugin-opener'; // ✅ ถูกต้อง
import { openPath } from '@tauri-apps/plugin-opener';
// เพิ่มบรรทัดนี้ไว้ด้านบนสุดของไฟล์ settings.js (ต่อจาก import ของเก่า)
import { ask, message } from '@tauri-apps/plugin-dialog';

document.addEventListener('DOMContentLoaded', () => {
    const SERVER_URL = "http://127.0.0.1:3000";
    
    const profileSelect = document.getElementById('ffmpeg-profile');
    const customGroup = document.getElementById('custom-group');
    const customInput = document.getElementById('custom-args');
    
    const dirInput = document.getElementById('save-dir');
    const presetDirs = document.getElementById('preset-dirs');
    const browseBtn = document.getElementById('btn-browse');
    const browseModal = document.getElementById('browse-modal');
    const folderList = document.getElementById('folder-list');
    const currentPathDisplay = document.getElementById('current-path-display');
    const cancelBrowseBtn = document.getElementById('btn-cancel-browse');
    const selectBrowseBtn = document.getElementById('btn-select-browse');

    let currentBrowsePath = '/';

    const toggleCustomInput = () => {
        if (profileSelect.value === 'custom') {
            customGroup.style.display = 'block';
            if (customInput.value.trim() === '') {
                customInput.value = '-c:v libx264 -preset fast -c:a aac';
            }
            customInput.focus();
        } else {
            customGroup.style.display = 'none';
        }
    };
    profileSelect.addEventListener('change', toggleCustomInput);

    presetDirs.addEventListener('change', () => {
        if (presetDirs.value !== 'custom') {
            dirInput.value = presetDirs.value;
        } else {
            dirInput.focus();
        }
    });

    const checkPresetMatch = (path) => {
        const options = Array.from(presetDirs.options).map(opt => opt.value);
        if (options.includes(path)) {
            presetDirs.value = path;
        } else {
            presetDirs.value = 'custom';
        }
    };

    const loadFolders = (path) => {
        currentPathDisplay.innerText = "กำลังค้นหา...";
        fetch(`${SERVER_URL}/browse?path=${encodeURIComponent(path)}`)
            .then(res => res.json())
            .then(folders => {
                currentBrowsePath = path;
                currentPathDisplay.innerText = path;
                folderList.innerHTML = '';
                
                if(folders.length === 0) {
                    folderList.innerHTML = '(ไม่มีโฟลเดอร์ย่อย)';
                }

                folders.forEach(folder => {
                    const div = document.createElement('div');
                    div.className = 'folder-item';
                    div.innerHTML = folder.startsWith('..') ? `⬅️ ${folder}` : `📁 ${folder}`;
                    
                    div.onclick = () => {
                        if(folder.startsWith('..')) {
                            const parts = currentBrowsePath.split('/').filter(Boolean);
                            parts.pop();
                            const newPath = parts.length === 0 ? '/' : '/' + parts.join('/');
                            loadFolders(newPath);
                        } else {
                            const newPath = currentBrowsePath.endsWith('/') 
                                ? `${currentBrowsePath}${folder}` 
                                : `${currentBrowsePath}/${folder}`;
                            loadFolders(newPath);
                        }
                    };
                    folderList.appendChild(div);
                });
            })
            .catch(err => {
                currentPathDisplay.innerText = "❌ ไม่สามารถอ่านโฟลเดอร์ได้ (เช็ค Server)";
            });
    };

    browseBtn.onclick = () => {
        browseModal.style.display = 'flex';
        let startPath = dirInput.value.trim();
        if(!startPath.startsWith('/')) startPath = '/';
        loadFolders(startPath);
    };

    cancelBrowseBtn.onclick = () => { browseModal.style.display = 'none'; };

    selectBrowseBtn.onclick = () => {
        dirInput.value = currentBrowsePath;
        checkPresetMatch(currentBrowsePath);
        browseModal.style.display = 'none';
    };

    fetch(`${SERVER_URL}/settings`)
        .then(res => res.json())
        .then(data => {
            const savedDir = data.save_directory || '/smb';
            dirInput.value = savedDir;
            checkPresetMatch(savedDir);

            profileSelect.value = data.ffmpeg_profile || 'mac';
            if (data.custom_args) customInput.value = data.custom_args;
            toggleCustomInput();
        })
        .catch(err => console.error("Error loading settings:", err));

    document.getElementById('save').onclick = () => {
        const config = {
            save_directory: dirInput.value,
            ffmpeg_profile: profileSelect.value,
            custom_args: customInput.value
        };
        fetch(`${SERVER_URL}/settings`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config) 
        })
        .then(() => alert("✅ บันทึกการตั้งค่าเรียบร้อย!"))
        .catch(err => alert("❌ ไม่สามารถบันทึกได้ กรุณาตรวจสอบ Server"));
    };

    // ลบปุ่ม clear-log อันเก่าออก แล้วใช้อันนี้แทนครับ:
const clearLogBtn = document.getElementById('clear-log');
if (clearLogBtn) {
    clearLogBtn.addEventListener('click', async () => {
        // ใช้ระบบถามยืนยันของ Tauri แบบสวยงาม (แทน confirm() ธรรมดา)
        const confirmed = await ask('คุณแน่ใจหรือไม่ว่าต้องการล้าง Log ทั้งหมด?', {
            title: 'ยืนยันการล้างข้อมูล',
            kind: 'warning',
        });

        if (confirmed) {
            try {
                const response = await fetch(`${SERVER_URL}/clear-log`, { method: 'POST' });
                if (response.ok) {
                    // แจ้งเตือนแบบสวยงาม (แทน alert() ธรรมดา)
                    await message('✅ ล้าง Log เรียบร้อย!', { title: 'สำเร็จ', kind: 'info' });
                } else {
                    await message(`❌ เซิร์ฟเวอร์ตอบกลับผิดปกติ: ${response.status}`, { title: 'เกิดข้อผิดพลาด', kind: 'error' });
                }
            } catch (err) {
                console.error("Clear Log Error:", err);
                await message('❌ เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', { title: 'เชื่อมต่อล้มเหลว', kind: 'error' });
            }
        }
    });
}

    // ==========================================
    // โค้ดส่วนที่เพิ่มใหม่สำหรับปุ่มเปิด Extension
    // ==========================================
    const extBtn = document.getElementById('open-ext-btn');
    if (extBtn) {
        extBtn.addEventListener('click', async () => {
            try {
                const resourcePath = await resolveResource('extension');
                await openPath(resourcePath); // ✅ เปลี่ยนเป็น openPath
            } catch (error) {
                console.error("เปิดโฟลเดอร์ไม่สำเร็จ:", error);
                alert("ไม่สามารถเปิดโฟลเดอร์ได้ กรุณาตรวจสอบว่ามีโฟลเดอร์ 'extension' อยู่ใน src-tauri หรือไม่");
            }
        });
    }
});