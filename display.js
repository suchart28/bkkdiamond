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

let currentPlaylist = [];
let currentMediaIndex = 0;
let imageTimer = null;
const IMAGE_DURATION = 10000; // เวลาแสดงรูปภาพ 10 วินาที

// ฟังก์ชันช่วยแปลงข้อความราคา ให้เป็นตัวเลขจำนวนเต็ม (ปัดเศษ) พร้อมใส่ลูกน้ำ
function formatToIntegerPrice(priceStr) {
    if (!priceStr) return "-";
    // ลบลูกน้ำเดิมออกก่อนเพื่อแปลงเป็นตัวเลขคำนวณได้
    const cleanStr = priceStr.toString().replace(/,/g, '');
    const num = Math.round(parseFloat(cleanStr)); // แปลงเป็นตัวเลขและปัดเศษทศนิยม
    return isNaN(num) ? "-" : num.toLocaleString('en-US'); // คืนค่ากลับพร้อมลูกน้ำหลักพัน
}

// ฟังก์ชันดึงราคาจาก API สมาคมค้าทองคำ
async function fetchGoldTradersPrice() {
    try {
        const response = await fetch('https://api.chnwt.dev/thai-gold-api/latest');
        const data = await response.json();
        
        if (data.status !== "success") throw new Error("ไม่สามารถดึงข้อมูลจาก API ได้");

        const prices = data.response.price;

        // นำราคาที่ได้มาผ่านฟังก์ชันตัดทศนิยมออกให้เป็นจำนวนเต็ม
        return {
            barBuy: formatToIntegerPrice(prices.gold_bar.buy),
            barSell: formatToIntegerPrice(prices.gold_bar.sell),
            ornamentBuy: formatToIntegerPrice(prices.gold.buy),
            ornamentSell: formatToIntegerPrice(prices.gold.sell)
        };
    } catch (error) {
        console.error("เกิดข้อผิดพลาดในการดึงราคาจาก API:", error);
        return null; 
    }
}

function updateTextData(data) {
    if(data.barBuy !== undefined) document.getElementById('bar-buy').innerText = data.barBuy;
    if(data.barSell !== undefined) document.getElementById('bar-sell').innerText = data.barSell;
    if(data.ornamentBuy !== undefined) document.getElementById('ornament-buy').innerText = data.ornamentBuy;
    if(data.ornamentSell !== undefined) document.getElementById('ornament-sell').innerText = data.ornamentSell;
    
    if (data.marquee !== undefined) {
        document.getElementById('marquee-text').innerText = data.marquee;
    }
}

function managePlaylist(mediaUrlString) {
    if (!mediaUrlString || mediaUrlString.trim() === "") {
        currentPlaylist = [];
        clearTimeout(imageTimer);
        document.getElementById('media-container').innerHTML = `<img src="default-bg.jpg" style="width: 100%; height: 100%; object-fit: fill;">`;
        return;
    }

    const newPlaylist = mediaUrlString.split(',').map(item => item.trim()).filter(item => item !== "");

    if (JSON.stringify(newPlaylist) !== JSON.stringify(currentPlaylist)) {
        currentPlaylist = newPlaylist;
        currentMediaIndex = 0;
        playCurrentMedia();
    }
}

function playCurrentMedia() {
    if (currentPlaylist.length === 0) return;
    
    clearTimeout(imageTimer);

    if (currentMediaIndex >= currentPlaylist.length) {
        currentMediaIndex = 0; 
    }

    const currentFile = currentPlaylist[currentMediaIndex];
    const mediaContainer = document.getElementById('media-container');
    const urlStr = currentFile.toLowerCase();

    if (urlStr.endsWith('.mp4') || urlStr.endsWith('.webm')) {
        mediaContainer.innerHTML = `
            <video id="signage-video" src="${currentFile}" 
                   autoplay muted playsinline
                   style="width: 100%; height: 100%; object-fit: fill;">
            </video>`;
        
        const videoEl = document.getElementById('signage-video');
        
        videoEl.onended = () => {
            currentMediaIndex++;
            playCurrentMedia();
        };
        
        videoEl.onerror = () => {
            currentMediaIndex++;
            playCurrentMedia();
        };

    } else {
        mediaContainer.innerHTML = `
            <img src="${currentFile}" 
                 style="width: 100%; height: 100%; object-fit: fill;" 
                 alt="Signage Media"
                 onerror="this.src='default-bg.jpg'">`;
        
        imageTimer = setTimeout(() => {
            currentMediaIndex++;
            playCurrentMedia();
        }, IMAGE_DURATION);
    }
}

let autoFetchInterval = null;

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
            // โหมดพิมพ์เอง (Manual) ถ้าต้องการให้บังคับเป็นจำนวนเต็มด้วย ให้เปิดใช้งานโค้ดนี้
            const manualConfig = { ...config };
            if (manualConfig.barBuy) manualConfig.barBuy = formatToIntegerPrice(manualConfig.barBuy);
            if (manualConfig.barSell) manualConfig.barSell = formatToIntegerPrice(manualConfig.barSell);
            if (manualConfig.ornamentBuy) manualConfig.ornamentBuy = formatToIntegerPrice(manualConfig.ornamentBuy);
            if (manualConfig.ornamentSell) manualConfig.ornamentSell = formatToIntegerPrice(manualConfig.ornamentSell);
            updateTextData(manualConfig);
        }

        managePlaylist(config.mediaUrl);

    } else {
        console.log("ยังไม่มีข้อมูลตั้งค่าสำหรับสาขาที่: " + branchId);
        document.getElementById('marquee-text').innerText = "รอการตั้งค่าจากแอดมินสำหรับสาขา " + branchId;
    }
});
