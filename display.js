import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================
// นำ URL Web App ของ Google Apps Script อันใหม่มาใส่ที่นี่ (ในเครื่องหมายคำพูด)
const GOOGLE_DRIVE_API_URL = "https://script.google.com/macros/s/AKfycbwhH0bfBoMtaaTP4eOb_UaVrIkPQjXXzKHr89iTxfCJyWYxJ0qvdPU9g_JD6xBTd50Y/exec";
// ==========================================

const firebaseConfig = {
  apiKey: "AIzaSyDMMwciq6QoLSaWK6xfdr0U3ynyahtoaSk",
  authDomain: "studio-a33fe.firebaseapp.com",
  databaseURL: "https://studio-a33fe-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "studio-a33fe",
  messagingSenderId: "753539109404",
  appId: "1:753539109404:web:0d5b9f468294dacce645d9",
  measurementId: "G-WSYVYGNGCZ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const urlParams = new URLSearchParams(window.location.search);
const branchId = urlParams.get('branch') || '1';

let currentPlaylist = [];
let currentMediaIndex = 0;
let imageTimer = null;

// ==========================================
// การตั้งค่า Effect (ปรับได้ตรงนี้)
const IMAGE_DURATION = 10000; // เวลาแสดงรูปภาพ (10 วินาที)
const FADE_DURATION = 1000;   // เวลาในการเฟดเลือนหาย (1 วินาที)
// ==========================================

// ฟังก์ชันแปลงตัวเลขเป็นจำนวนเต็มพร้อมใส่ลูกน้ำ
function formatToIntegerPrice(priceStr) {
    if (!priceStr) return "-";
    const cleanStr = priceStr.toString().replace(/,/g, '');
    const num = Math.round(parseFloat(cleanStr));
    return isNaN(num) ? "-" : num.toLocaleString('en-US');
}

// ฟังก์ชันดึงราคาและจัดการวันที่จาก API
async function fetchGoldTradersPrice() {
    try {
        const response = await fetch('https://api.chnwt.dev/thai-gold-api/latest');
        const data = await response.json();
        if (data.status !== "success") throw new Error("ไม่สามารถดึงข้อมูลจาก API ได้");

        const prices = data.response.price;
        
        let updateDate = data.response.date;
        if (!updateDate || updateDate === "undefined") {
            const today = new Date();
            updateDate = today.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
        } else {
            const d = new Date(updateDate);
            if (!isNaN(d)) updateDate = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
        }
        
        const updateTime = data.response.update_time || new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

        return {
            barBuy: formatToIntegerPrice(prices.gold_bar.buy),
            barSell: formatToIntegerPrice(prices.gold_bar.sell),
            ornamentBuy: formatToIntegerPrice(prices.gold.buy),
            ornamentSell: formatToIntegerPrice(prices.gold.sell),
            updateTime: `อัพเดทราคาล่าสุด: วันที่ ${updateDate} เวลา ${updateTime}`
        };
    } catch (error) {
        console.error("เกิดข้อผิดพลาดในการดึงราคาจาก API:", error);
        return null; 
    }
}

// ฟังก์ชันอัปเดตข้อความบนหน้าจอ
function updateTextData(data) {
    if(data.barBuy !== undefined) document.getElementById('bar-buy').innerText = data.barBuy;
    if(data.barSell !== undefined) document.getElementById('bar-sell').innerText = data.barSell;
    if(data.ornamentBuy !== undefined) document.getElementById('ornament-buy').innerText = data.ornamentBuy;
    if(data.ornamentSell !== undefined) document.getElementById('ornament-sell').innerText = data.ornamentSell;
    if (data.marquee !== undefined) document.getElementById('marquee-text').innerText = data.marquee;
    if (data.updateTime !== undefined) document.getElementById('update-time').innerText = data.updateTime;
}

// ฟังก์ชันดึงไฟล์สื่อจาก Google Drive API
async function fetchMediaFromDrive() {
    try {
        const response = await fetch(GOOGLE_DRIVE_API_URL);
        const files = await response.json();
        
        if (files && files.length > 0) {
            // เช็คว่าเพลย์ลิสต์มีไฟล์อะไรอัปเดตไหม
            if (JSON.stringify(files) !== JSON.stringify(currentPlaylist)) {
                currentPlaylist = files;
                currentMediaIndex = 0;
                // รีเซ็ต Fader Container
                document.getElementById('media-container').innerHTML = '';
                playCurrentMedia();
            }
        } else {
            currentPlaylist = [];
            // ถ้าโฟลเดอร์ว่างเปล่า แสดงรูปพื้นหลังค่าเริ่มต้น (ทันที ไม่เฟด)
            document.getElementById('media-container').innerHTML = `<img src="default-bg.jpg" style="width: 100%; height: 100%; object-fit: fill;">`;
        }
    } catch (error) {
        console.error("เชื่อมต่อ Google Drive ไม่สำเร็จ:", error);
    }
}

// ฟังก์ชันหลักในการเล่นสื่อ พร้อม Cross-fade Effect สำหรับรูปภาพ
function playCurrentMedia() {
    const mediaContainer = document.getElementById('media-container');

    if (currentPlaylist.length === 0) {
        mediaContainer.innerHTML = `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:#333; color:#fff; font-size:2vw;">กำลังโหลดสื่อ หรือไม่พบไฟล์...</div>`;
        return;
    }
    
    clearTimeout(imageTimer);
    
    // ถ้ารันจนจบเพลย์ลิสต์ ให้กลับไปเริ่มไฟล์แรกใหม่
    if (currentMediaIndex >= currentPlaylist.length) {
        currentMediaIndex = 0; 
    }

    const currentFile = currentPlaylist[currentMediaIndex];

    // โหมดวิดีโอ: ใช้การสลับ HTML ตรงๆ (ไม่มีเฟด) เพื่อความเสถียรของ Video Element
    if (currentFile.type === 'video') {
        // ลบ fader images ตัวเก่าๆ ออกก่อน
        const oldImages = mediaContainer.querySelectorAll('img.fader-img');
        oldImages.forEach(img => img.remove());

        mediaContainer.innerHTML = `
            <video id="signage-video" src="${currentFile.url}" 
                   autoplay muted playsinline
                   style="width: 100%; height: 100%; object-fit: fill;">
            </video>`;
        
        const videoEl = document.getElementById('signage-video');
        
        videoEl.onended = () => {
            currentMediaIndex++;
            playCurrentMedia();
        };
        
        videoEl.onerror = () => {
            console.error(`ข้ามไฟล์วิดีโอ ${currentFile.name} เนื่องจากไม่สามารถเล่นได้`);
            currentMediaIndex++;
            playCurrentMedia();
        };
        
    } 
    // โหมดรูปภาพ: ใช้ระบบ Fader ซ้อนรูป
    else {
        // ตรวจสอบว่า Container พร้อมสำหรับการซ้อนภาพหรือยัง (ต้องเป็น relative)
        if (mediaContainer.style.position !== 'relative') {
            mediaContainer.style.position = 'relative';
        }

        // 1. ค้นหาภาพปัจจุบันที่กำลังแสดงผลอยู่
        const existingImg = mediaContainer.querySelector('img.active-fader-img');

        // 2. สร้าง Image Element อันใหม่ (hidden รอ)
        const nextImg = document.createElement('img');
        nextImg.src = currentFile.url;
        nextImg.alt = "Signage Media";
        nextImg.className = "fader-img"; // คลาสสำหรับระบุว่าเป็น fader
        // ตั้งค่าสไตล์สำหรับการเฟด (เริ่มด้วย opacity 0)
        nextImg.style.cssText = `position: absolute; top:0; left:0; width: 100%; height: 100%; object-fit: fill; opacity: 0; transition: opacity ${FADE_DURATION}ms ease-in-out;`;

        // รอจนกว่าภาพใหม่จะโหลดเสร็จ เพื่อป้องกันอาการกระตุกหรือจอดำ
        nextImg.onload = () => {
            if (existingImg) {
                // --- ขั้นตอนการทำ Cross-fade ---
                
                // วางภาพใหม่ซ้อนด้านล่างก่อนเพื่อไม่ให้บังภาพปัจจุบัน
                nextImg.style.zIndex = "1";
                mediaContainer.appendChild(nextImg);

                // สลับ z-index: ให้ภาพเก่าอยู่ล่าง ภาพใหม่อยู่บน
                existingImg.style.zIndex = "1";
                nextImg.style.zIndex = "2";

                // บังคับให้เบราว์เซอร์ reflow ก่อนจะเริ่มทรานซิชัน
                void nextImg.offsetWidth;

                // สั่งเฟด: ภาพใหม่ปรากฏ, ภาพเก่าเลือนหาย
                nextImg.style.opacity = "1";
                existingImg.style.opacity = "0";
                
                // เปลี่ยนคลาสเพื่อระบุว่าภาพใหม่กลายเป็นภาพปัจจุบันแล้ว
                existingImg.classList.remove('active-fader-img');
                nextImg.classList.add('active-fader-img');

                // รอจนกว่าทรานซิชันเฟดจะเสร็จ ค่อยลบภาพเก่าออกไป
                setTimeout(() => {
                    existingImg.remove();
                }, FADE_DURATION);

            } else {
                // --- กรณีโหลดภาพครั้งแรก หรือเปลี่ยนมาจากโหมดวิดีโอ ---
                
                // เคลียร์ Container ให้สะอาด (ลบวิดีโอออก)
                mediaContainer.innerHTML = ''; 
                
                // แสดงภาพใหม่ทันที (ไม่ต้องเฟด)
                nextImg.style.opacity = "1";
                nextImg.classList.add('active-fader-img');
                mediaContainer.appendChild(nextImg);
            }

            // ตั้งเวลาถอยหลังสำหรับการเปลี่ยนไฟล์ถัดไป
            imageTimer = setTimeout(() => {
                currentMediaIndex++;
                playCurrentMedia();
            }, IMAGE_DURATION);
        };
        
        // ถ้าโหลดรูปภาพไม่ขึ้น ให้ข้ามภาพนี้ไปเลย
        nextImg.onerror = () => {
            console.error(`ข้ามไฟล์ภาพ ${currentFile.name} เนื่องจากโหลดไม่ได้`);
            currentMediaIndex++;
            playCurrentMedia();
        };
    }
}

// สั่งให้ดึงภาพจาก Drive ทันทีที่เปิดหน้าเว็บ
fetchMediaFromDrive();

// ตั้งเวลาเช็กไฟล์ใน Drive ใหม่ทุกๆ 5 นาที
setInterval(fetchMediaFromDrive, 300000); 

let autoFetchInterval = null;

// เชื่อมต่อ Firebase Firestore เพื่อรับข้อมูลตัววิ่ง และโหมดราคา
onSnapshot(doc(db, "branches", branchId), async (docSnap) => {
    if (docSnap.exists()) {
        const config = docSnap.data();
        
        if (autoFetchInterval) clearInterval(autoFetchInterval);

        if (config.isAutoMode) {
            const goldPrice = await fetchGoldTradersPrice();
            if (goldPrice && goldPrice.barBuy !== "-") {
                updateTextData({ ...config, ...goldPrice }); 
            } else {
                updateTextData(config); 
            }

            autoFetchInterval = setInterval(async () => {
                const freshPrice = await fetchGoldTradersPrice();
                if (freshPrice && freshPrice.barBuy !== "-") {
                    updateTextData(freshPrice);
                }
            }, 60000);

        } else {
            const manualConfig = { ...config };
            if (manualConfig.barBuy) manualConfig.barBuy = formatToIntegerPrice(manualConfig.barBuy);
            if (manualConfig.barSell) manualConfig.barSell = formatToIntegerPrice(manualConfig.barSell);
            if (manualConfig.ornamentBuy) manualConfig.ornamentBuy = formatToIntegerPrice(manualConfig.ornamentBuy);
            if (manualConfig.ornamentSell) manualConfig.ornamentSell = formatToIntegerPrice(manualConfig.ornamentSell);
            
            if (config.updatedAt) {
                const d = config.updatedAt.toDate();
                const dateStr = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
                const timeStr = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
                manualConfig.updateTime = `อัพเดทราคาล่าสุด (กำหนดเอง): วันที่ ${dateStr} เวลา ${timeStr}`;
            } else {
                manualConfig.updateTime = `อัพเดทราคาล่าสุด (กำหนดเอง): -`;
            }

            updateTextData(manualConfig);
        }

    }
});
