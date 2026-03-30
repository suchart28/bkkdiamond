import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

// ตัวแปรสำหรับระบบ Playlist
let currentPlaylist = [];
let currentMediaIndex = 0;
let imageTimer = null;
const IMAGE_DURATION = 10000; // เวลาแสดงรูปภาพ (มิลลิวินาที) -> 10000 = 10 วินาที

// ฟังก์ชันดึงราคาทองแบบอัตโนมัติผ่าน AllOrigins Proxy
async function fetchHuaSengHengPrice() {
    try {
        const targetUrl = 'https://online965.huasengheng.com/webprice965/';
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
        
        const response = await fetch(proxyUrl);
        const data = await response.json();
        
        const hshData = JSON.parse(data.contents);
        const bBuy = hshData.Buy || "-";
        const bSell = hshData.Sell || "-";
        
        const bBuyNum = parseInt(bBuy.replace(/,/g, ''));
        const bSellNum = parseInt(bSell.replace(/,/g, ''));
        
        const oBuy = bBuyNum ? (bBuyNum - 100).toLocaleString() : "-"; 
        const oSell = bSellNum ? (bSellNum + 500).toLocaleString() : "-";

        return {
            barBuy: bBuy,
            barSell: bSell,
            ornamentBuy: oBuy,
            ornamentSell: oSell
        };
    } catch (error) {
        console.error("เกิดข้อผิดพลาดในการดึงราคาอัตโนมัติ:", error);
        return null; 
    }
}

// ฟังก์ชันอัปเดตข้อมูล Text และราคา
function updateTextData(data) {
    if(data.barBuy !== undefined) document.getElementById('bar-buy').innerText = data.barBuy;
    if(data.barSell !== undefined) document.getElementById('bar-sell').innerText = data.barSell;
    if(data.ornamentBuy !== undefined) document.getElementById('ornament-buy').innerText = data.ornamentBuy;
    if(data.ornamentSell !== undefined) document.getElementById('ornament-sell').innerText = data.ornamentSell;
    
    if (data.marquee !== undefined) {
        document.getElementById('marquee-text').innerText = data.marquee;
    }
}

// ระบบจัดการคิว Playlist
function managePlaylist(mediaUrlString) {
    if (!mediaUrlString || mediaUrlString.trim() === "") {
        currentPlaylist = [];
        clearTimeout(imageTimer);
        document.getElementById('media-container').innerHTML = `<img src="default-bg.jpg" style="width: 100%; height: 100%; object-fit: fill;">`;
        return;
    }

    // แยกชื่อไฟล์ด้วยลูกน้ำ (,) และลบช่องว่างส่วนเกิน
    const newPlaylist = mediaUrlString.split(',').map(item => item.trim()).filter(item => item !== "");

    // เช็กว่าถ้าคิวมีการเปลี่ยนแปลง ค่อยรีเซ็ตแล้วเล่นใหม่ (ป้องกันจอโหลดใหม่ตอนราคาอัปเดต)
    if (JSON.stringify(newPlaylist) !== JSON.stringify(currentPlaylist)) {
        currentPlaylist = newPlaylist;
        currentMediaIndex = 0;
        playCurrentMedia();
    }
}

// ฟังก์ชันเล่นไฟล์สื่อปัจจุบัน
function playCurrentMedia() {
    if (currentPlaylist.length === 0) return;
    
    // ล้าง Timer รูปภาพเก่าออกก่อน
    clearTimeout(imageTimer);

    // ถ้าเล่นจบครบทุกไฟล์แล้ว ให้วนกลับไปไฟล์แรก
    if (currentMediaIndex >= currentPlaylist.length) {
        currentMediaIndex = 0; 
    }

    const currentFile = currentPlaylist[currentMediaIndex];
    const mediaContainer = document.getElementById('media-container');
    const urlStr = currentFile.toLowerCase();

    if (urlStr.endsWith('.mp4') || urlStr.endsWith('.webm')) {
        // เป็นไฟล์วิดีโอ
        mediaContainer.innerHTML = `
            <video id="signage-video" src="${currentFile}" 
                   autoplay muted playsinline
                   style="width: 100%; height: 100%; object-fit: fill;">
            </video>`;
        
        const videoEl = document.getElementById('signage-video');
        
        // เมื่อวิดีโอเล่นจบ ให้เปลี่ยนไปไฟล์ถัดไป
        videoEl.onended = () => {
            currentMediaIndex++;
            playCurrentMedia();
        };
        
        // กรณีวิดีโอมีปัญหา (ไฟล์หาย) ให้ข้ามไปไฟล์ถัดไปเลย
        videoEl.onerror = () => {
            currentMediaIndex++;
            playCurrentMedia();
        };

    } else {
        // เป็นไฟล์รูปภาพ
        mediaContainer.innerHTML = `
            <img src="${currentFile}" 
                 style="width: 100%; height: 100%; object-fit: fill;" 
                 alt="Signage Media"
                 onerror="this.src='default-bg.jpg'">`;
        
        // นับเวลา 10 วินาที แล้วเปลี่ยนไปไฟล์ถัดไป
        imageTimer = setTimeout(() => {
            currentMediaIndex++;
            playCurrentMedia();
        }, IMAGE_DURATION);
    }
}

let autoFetchInterval = null;

// ดักฟังการเปลี่ยนแปลงจาก Firebase Firestore แบบ Real-time
onSnapshot(doc(db, "branches", branchId), async (docSnap) => {
    if (docSnap.exists()) {
        const config = docSnap.data();
        
        if (autoFetchInterval) clearInterval(autoFetchInterval);

        // จัดการดึงราคา
        if (config.isAutoMode) {
            const hshPrice = await fetchHuaSengHengPrice();
            if (hshPrice) {
                updateTextData({ ...config, ...hshPrice }); 
            } else {
                updateTextData(config); 
            }

            autoFetchInterval = setInterval(async () => {
                const freshPrice = await fetchHuaSengHengPrice();
                if (freshPrice) {
                    updateTextData(freshPrice);
                }
            }, 60000);

        } else {
            updateTextData(config);
        }

        // จัดการอัปเดตคิว Playlist ให้กับหน้าจอ
        managePlaylist(config.mediaUrl);

    } else {
        console.log("ยังไม่มีข้อมูลตั้งค่าสำหรับสาขาที่: " + branchId);
        document.getElementById('marquee-text').innerText = "รอการตั้งค่าจากแอดมินสำหรับสาขา " + branchId;
    }
});
