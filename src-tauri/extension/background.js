let latestVideoUrl = "";
let latestAudioUrl = "";

// 1. ดักจับการเปลี่ยนหน้าแบบ SPA
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
    if (details.url.includes("facebook.com")) {
        latestVideoUrl = "";
        latestAudioUrl = "";
    }
});

// 2. สร้างเมนูคลิกขวา
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({ id: "download-fb-blob", title: "📥 โหลดวิดีโอหน้านี้ (เลือกชื่อไฟล์ได้)", contexts: ["all"] });
        chrome.contextMenus.create({ id: "view-server-logs", title: "🖥️ ดูสถานะการดาวน์โหลด (Logs)", contexts: ["all"] });
        chrome.contextMenus.create({ id: "donate-developer", title: "☕ สนับสนุนนักพัฒนา (Donate)", contexts: ["all"] });
        chrome.contextMenus.create({ id: "system-settings", title: "⚙️ ตั้งค่าระบบ", contexts: ["all"] });
    });
});

// 3. ดักฟัง Traffic
chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        const url = details.url;
        if (url.includes("fbcdn.net")) {
            const cleanUrl = url.replace(/&bytestart=\d+/, "").replace(/&byteend=\d+/, "");
            try {
                const urlObj = new URL(url);
                const efg = urlObj.searchParams.get("efg");
                if (efg) {
                    let b64 = decodeURIComponent(efg).replace(/-/g, '+').replace(/_/g, '/');
                    const decodedEfg = atob(b64);
                    if (decodedEfg.includes("audio")) {
                        latestAudioUrl = cleanUrl;
                    } else if (decodedEfg.includes("video")) {
                        latestVideoUrl = cleanUrl;
                    }
                } else if (url.includes("mime=audio")) {
                    latestAudioUrl = cleanUrl;
                } else if (url.includes("mime=video") || url.includes(".mp4")) {
                    latestVideoUrl = cleanUrl;
                }
            } catch (e) {}
        }
    },
    { urls: ["*://*.fbcdn.net/*", "*://*.facebook.com/*"] }
);

// 4. เมื่อกดเมนูต่างๆ
chrome.contextMenus.onClicked.addListener((info, tab) => {
    
    // ---- เมนูโหลดไฟล์ ----
    if (info.menuItemId === "download-fb-blob") {
        if (!latestVideoUrl) {
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => alert("❌ ยังดักลิงก์ไม่เจอ!\n\n💡 ทริค: ลองใช้เมาส์ 'คลิกแถบเวลาเพื่อกรอคลิป' (ถอยหลัง/เดินหน้า นิดนึง) เพื่อบังคับให้ระบบจับสัญญาณได้ แล้วคลิกขวาโหลดใหม่ครับ")
            });
            return;
        }

        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                return new Promise((resolve) => {
                    let optionsSet = new Set(); 

                    // ฟังก์ชันทำความสะอาดข้อความแบบขั้นสูง (ดักอักขระต้องห้ามทั้งหมด)
                    const cleanText = (txt) => {
                        if (!txt) return "";
                        let s = txt.replace(/^\(\d+\+?\)\s*/, "") // ลบตัวเลขแจ้งเตือน (20+)
                                   .split('|')[0].split(' - ')[0] // ตัดข้อความท้าย Facebook
                                   .replace(/Facebook/gi, "").replace(/Watch/gi, "")
                                   .replace(/ดูเพิ่มเติม/g, "").replace(/See more/g, "")
                                   .replace(/ประวัติการแชทขาดหายไป/gi, "")
                                   .replace(/[\r\n]+/g, " ") // เปลี่ยนการขึ้นบรรทัดใหม่เป็นช่องว่าง
                                   .replace(/[\\/:*?"<>|#\x00-\x1F\x7F]/g, "_") // ลบอักขระต้องห้ามทั้งหมดของระบบไฟล์
                                   .replace(/\s+/g, " ") // ยุบช่องว่างหลายอันให้เหลืออันเดียว
                                   .replace(/_+/g, "_") // ยุบขีดล่างหลายอันให้เหลืออันเดียว
                                   .trim(); 
                        return s.length > 70 ? s.substring(0, 70).trim() : s;
                    };

                    // 1. กวาดจาก Title
                    if (document.title) optionsSet.add(cleanText(document.title));

                    // 2. กวาดจาก Meta Tags
                    let ogTitle = document.querySelector('meta[property="og:title"]');
                    if (ogTitle && ogTitle.content) optionsSet.add(cleanText(ogTitle.content));
                    
                    let ogDesc = document.querySelector('meta[name="description"]');
                    if (ogDesc && ogDesc.content) optionsSet.add(cleanText(ogDesc.content));

                    // 3. กวาดจาก <h1>
                    document.querySelectorAll('h1').forEach(h1 => {
                        let txt = cleanText(h1.innerText);
                        if (txt && txt.length > 5) optionsSet.add(txt);
                    });

                    // 4. กวาดจาก <span>
                    document.querySelectorAll('span[dir="auto"]').forEach(span => {
                        let txt = cleanText(span.innerText);
                        if (txt && txt.length > 10 && !txt.includes("ถูกใจ") && !txt.includes("ความคิดเห็น") && !txt.includes("แชร์")) {
                            optionsSet.add(txt);
                        }
                    });

                    // กรองเอาค่าว่างทิ้ง
                    let finalOptions = Array.from(optionsSet).filter(o => o !== "" && o !== "_");
                    if (finalOptions.length === 0) finalOptions.push("FB_Video");

                    // ลบ Modal เก่าทิ้ง
                    let existingModal = document.getElementById('fb-dl-custom-modal');
                    if (existingModal) existingModal.remove();

                    // สร้าง Modal
                    const modalHtml = `
                        <div id="fb-dl-custom-modal" style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.7); z-index:999999; display:flex; justify-content:center; align-items:center; font-family:sans-serif; backdrop-filter: blur(4px);">
                            <div style="background:#11161d; padding:30px; border-radius:12px; width: 450px; max-width: 90%; box-shadow: 0 10px 30px rgba(0,0,0,0.8);">
                                <h3 style="margin:0 0 10px 0; color:#fff; font-size: 18px;">📥 เลือกชื่อไฟล์วิดีโอ</h3>
                                <p style="color:#94a3b8; font-size: 13px; margin-bottom: 20px;">ระบบค้นหาชื่อที่เป็นไปได้บนหน้าจอมาให้ เลือกจากรายการ หรือพิมพ์แก้ไขเองในช่องด้านล่างได้เลยครับ</p>
                                
                                <select id="fb-dl-select" style="width:100%; padding:10px; margin-bottom:15px; background:#1e293b; color:#fff; border:1px solid #334155; border-radius:8px; outline:none; font-size:14px; cursor:pointer;">
                                    ${finalOptions.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
                                </select>

                                <input type="text" id="fb-dl-input" value="${finalOptions[0]}" style="width:100%; padding:10px; margin-bottom:25px; background:#0f172a; color:#38bdf8; border:1px solid #0ea5e9; border-radius:8px; box-sizing:border-box; outline:none; font-size:14px;">
                                
                                <div style="display:flex; justify-content:flex-end; gap:10px;">
                                    <button id="fb-dl-cancel" style="padding:10px 20px; cursor:pointer; background:#334155; color:#fff; border:none; border-radius:8px; font-weight:bold;">ยกเลิก</button>
                                    <button id="fb-dl-ok" style="padding:10px 20px; cursor:pointer; background:#0ea5e9; color:#fff; border:none; border-radius:8px; font-weight:bold;">ดาวน์โหลด</button>
                                </div>
                            </div>
                        </div>
                    `;

                    document.body.insertAdjacentHTML('beforeend', modalHtml);

                    const modal = document.getElementById('fb-dl-custom-modal');
                    const select = document.getElementById('fb-dl-select');
                    const input = document.getElementById('fb-dl-input');
                    const btnOk = document.getElementById('fb-dl-ok');
                    const btnCancel = document.getElementById('fb-dl-cancel');

                    select.addEventListener('change', (e) => {
                        input.value = e.target.value;
                    });

                    btnCancel.addEventListener('click', () => {
                        modal.remove();
                        resolve(null);
                    });

                    btnOk.addEventListener('click', () => {
                        const finalName = input.value;
                        modal.remove();
                        resolve(finalName);
                    });
                });
            }
        }, (results) => {
            let userInput = results[0]?.result;
            if (!userInput) return; 

            // ทำความสะอาดชื่อไฟล์รอบสุดท้ายก่อนส่งเข้า Server (เผื่อผู้ใช้พิมพ์อักขระแปลกๆ เข้ามาเอง)
            let safeFilename = userInput
                .replace(/[\r\n]+/g, " ")
                .replace(/[\\/:*?"<>|#\x00-\x1F\x7F]/g, "_")
                .replace(/\s+/g, " ")
                .replace(/_+/g, "_")
                .trim();
                
            if (safeFilename === "") safeFilename = "FB_Video_" + Date.now();

            const audioToSend = latestAudioUrl ? latestAudioUrl : latestVideoUrl;

            fetch("http://127.0.0.1:3000/download", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    video_url: latestVideoUrl, 
                    audio_url: audioToSend, 
                    filename: safeFilename
                })
            }).then(response => {
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: (name) => alert(`✅ เริ่มโหลดไฟล์:\n${name}.mp4\nเข้าไปดูใน NAS ได้เลยครับ`),
                    args: [safeFilename]
                });
            }).catch(err => {
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => alert("❌ ติดต่อ Docker ไม่ได้ เช็ค Server ด้วยครับ")
                });
            });
        });
    } 
    
    // ---- เมนูดู Log และ Donate ----
    else if (info.menuItemId === "view-server-logs") {
        chrome.tabs.create({ url: "http://127.0.0.1:3000/logs" });
    }
    else if (info.menuItemId === "donate-developer") {
        const myQrCodeUrl = chrome.runtime.getURL("qrcode.png"); 
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (qrUrl) => {
                if (document.getElementById('fb-dl-donate-modal')) return;
                const modalHtml = `
                    <div id="fb-dl-donate-modal" style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.7); z-index:999999; display:flex; justify-content:center; align-items:center; font-family:sans-serif; backdrop-filter: blur(4px);">
                        <div style="background:#11161d; padding:40px; border-radius:16px; text-align:center; box-shadow: 0 10px 30px rgba(0,0,0,0.8); position:relative; min-width: 450px;">
                            <span id="fb-dl-close-donate" style="position:absolute; top:15px; right:20px; color:#6b7280; cursor:pointer; font-size:24px; font-weight:bold;">&times;</span>
                            <h2 style="color:#ffffff; margin: 0 0 10px 0; font-size:22px; font-weight:600;">☕ สนับสนุนผู้พัฒนา</h2>
                            <p style="color:#94a3b8; font-size: 14px; margin-bottom: 30px;">เพื่อเป็นกำลังใจในการพัฒนาและอัปเดตระบบต่อไป</p>
                            <div style="display:flex; gap:15px; justify-content:center;">
                                <button id="btn-promptpay" style="flex:1; background-color:#122432; border: 1px solid #1c687e; border-radius: 12px; padding: 16px; color: #02d5e7; font-size: 16px; font-weight: 600; cursor: pointer; display:flex; justify-content:center; align-items:center; gap:8px;">🇹🇭 PromptPay</button>
                                <button id="btn-globalpay" style="flex:1; background-color:#2c2724; border: 1px solid #7c5d33; border-radius: 12px; padding: 16px; color: #facc15; font-size: 16px; font-weight: 600; cursor: pointer; display:flex; justify-content:center; align-items:center; gap:8px;">☕ Global Pay</button>
                            </div>
                            <div id="qr-display-area" style="display:none; margin-top:30px; background:#ffffff; padding:20px; border-radius:12px;">
                                <img src="${qrUrl}" style="width:200px; height:auto; margin-bottom:10px; border-radius:8px;" />
                                <p style="color:#11161d; margin:0; font-size: 18px; font-weight:bold;">สแกนเพื่อสนับสนุน</p>
                            </div>
                        </div>
                    </div>`;
                document.body.insertAdjacentHTML('beforeend', modalHtml);
                const ppBtn = document.getElementById('btn-promptpay');
                ppBtn.onmouseover = () => ppBtn.style.backgroundColor = '#183446';
                ppBtn.onmouseout = () => ppBtn.style.backgroundColor = '#122432';
                document.getElementById('fb-dl-close-donate').onclick = () => document.getElementById('fb-dl-donate-modal').remove();
                document.getElementById('btn-promptpay').onclick = () => document.getElementById('qr-display-area').style.display = 'block';
                document.getElementById('btn-globalpay').onclick = () => window.open('https://buymeacoffee.com/rachata.rath', '_blank');
            },
            args: [myQrCodeUrl]
        });
    }
        else if (info.menuItemId === "system-settings") {
        chrome.tabs.create({ url: chrome.runtime.getURL("settings.html") });
    }
});