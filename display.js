import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================
// 1. นำ URL Web App ของ Google Apps Script อันใหม่มาใส่ที่นี่ (ในเครื่องหมายคำพูด)
const GOOGLE_DRIVE_API_URL = "https://script.google.com/macros/s/AKfycbyLStJBYIUXldXaakNxgWrXtcCsukvmpycdHFhvOjqBFXescjaHsQUTOYPoHBJqEjY/exec";
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
// 2. การตั้งค่า Effect การเล่นสื่อ
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
            // เช็คว่ามีไฟล์อัปเดตใหม่ไหม
            if (JSON.stringify(files) !== JSON.stringify(currentPlaylist)) {
                currentPlaylist = files;
                currentMediaIndex = 0;
                document.getElementById('media-container').innerHTML = ''; // รีเซ็ตหน้าจอ
                playCurrentMedia();
            }
        } else {
            currentPlaylist = [];
            document.getElementById('media-container').innerHTML = `<img src="default-bg.jpg" style="width: 100%; height: 100%; object-fit: fill;">`;
        }
    } catch (error) {
        console.error("เชื่อมต่อ Google Drive ไม่สำเร็จ:", error);
    }
}

// ฟังก์ชันหลักในการเล่นสื่อ (Cross-fade สำหรับภาพ & บังคับเล่นสำหรับวิดีโอ)
function playCurrentMedia() {
    const mediaContainer = document.getElementById('media-container');

    if (currentPlaylist.length === 0) {
        mediaContainer.innerHTML = `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:#333; color:#fff; font-size:2vw;">กำลังโหลดสื่อ หรือไม่พบไฟล์...</div>`;
        return;
    }
    
    clearTimeout(imageTimer);
    
    // ถ้ารันจนจบ ให้กลับไปเริ่มไฟล์แรกใหม่
    if (currentMediaIndex >= currentPlaylist.length) {
        currentMediaIndex = 0; 
    }

    const currentFile = currentPlaylist[currentMediaIndex];

    // ==========================================
    // โหมดวิดีโอ: สร้าง Element ใหม่และบังคับ Play
    // ==========================================
    if (currentFile.type === 'video') {
        // ลบ fader images หรือวิดีโอตัวเก่าออกให้หมดก่อน
        mediaContainer.innerHTML = ''; 

        // สร้าง Video Element
        const videoEl = document.createElement('video');
        videoEl.id = 'signage-video';
        videoEl.src = currentFile.url;
        videoEl.autoplay = true;
        videoEl.muted = true;
        videoEl.playsInline = true;
        videoEl.style.cssText = "width: 100%; height: 100%; object-fit: fill; background-color: #000;";

        // เมื่อเล่นจบให้ไปไฟล์ถัดไป
        videoEl.onended = () => {
            currentMediaIndex++;
            playCurrentMedia();
        };

        // ถ้าเล่นไม่ได้ ให้ข้ามทันที
        videoEl.onerror = () => {
            console.error(`ข้ามไฟล์วิดีโอ ${currentFile.name} เนื่องจากไม่สามารถโหลดจาก Drive ได้`);
            currentMediaIndex++;
            playCurrentMedia();
        };

        mediaContainer.appendChild(videoEl);

        // บังคับให้เบราว์เซอร์เล่นวิดีโอทันทีเพื่อทะลวงระบบบล็อก
        let playPromise = videoEl.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.error("เบราว์เซอร์บล็อกการเล่นวิดีโออัตโนมัติ:", error);
                // ถ้าโดนบล็อก ให้ข้ามไปไฟล์ถัดไป เพื่อไม่ให้จอค้าง
                currentMediaIndex++;
                playCurrentMedia();
            });
        }
        
    } 
    // ==========================================
    // โหมดรูปภาพ: ใช้ระบบ Fader ซ้อนรูป
    // ==========================================
    else {
        if (mediaContainer.style.position !== 'relative') {
            mediaContainer.style.position = 'relative';
        }

        const existingImg = mediaContainer.querySelector('img.active-fader-img');

        // สร้างรูปภาพใหม่รอไว้แบบซ่อน
        const nextImg = document.createElement('img');
        nextImg.src = currentFile.url;
        nextImg.alt = "Signage Media";
        nextImg.className = "fader-img"; 
        nextImg.style.cssText = `position: absolute; top:0; left:0; width: 100%; height: 100%; object-fit: fill; opacity: 0; transition: opacity ${FADE_DURATION}ms ease-in-out;`;

        nextImg.onload = () => {
            if (existingImg) {
                // วางภาพใหม่ซ้อนลงไป
                nextImg.style.zIndex = "1";
                mediaContainer.appendChild(nextImg);

                // สลับ z-index
                existingImg.style.zIndex = "1";
                nextImg.style.zIndex = "2";

                void nextImg.offsetWidth; // บังคับให้เบราว์เซอร์อัปเดต

                // เฟดภาพเข้า-ออก
                nextImg.style.opacity = "1";
                existingImg.style.opacity = "0";
                
                existingImg.classList.remove('active-fader-img');
                nextImg.classList.add('active-fader-img');

                // ลบภาพเก่าออกเมื่อเฟดเสร็จ
                setTimeout(() => {
                    existingImg.remove();
                }, FADE_DURATION);

            } else {
                mediaContainer.innerHTML = ''; 
                nextImg.style.opacity = "1";
                nextImg.classList.add('active-fader-img');
                mediaContainer.appendChild(nextImg);
            }

            // ตั้งเวลาถอยหลังเปลี่ยนภาพ
            imageTimer = setTimeout(() => {
                currentMediaIndex++;
                playCurrentMedia();
            }, IMAGE_DURATION); 
        };
        
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
