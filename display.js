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
const IMAGE_DURATION = 10000;

function formatToIntegerPrice(priceStr) {
    if (!priceStr) return "-";
    const cleanStr = priceStr.toString().replace(/,/g, '');
    const num = Math.round(parseFloat(cleanStr));
    return isNaN(num) ? "-" : num.toLocaleString('en-US');
}

// ดึงราคาและเวลาจาก API
async function fetchGoldTradersPrice() {
    try {
        const response = await fetch('https://api.chnwt.dev/thai-gold-api/latest');
        const data = await response.json();
        
        if (data.status !== "success") throw new Error("ไม่สามารถดึงข้อมูลจาก API ได้");

        const prices = data.response.price;
        const updateDate = data.response.date;
        const updateTime = data.response.update_time;

        return {
            barBuy: formatToIntegerPrice(prices.gold_bar.buy),
            barSell: formatToIntegerPrice(prices.gold_bar.sell),
            ornamentBuy: formatToIntegerPrice(prices.gold.buy),
            ornamentSell: formatToIntegerPrice(prices.gold.sell),
            updateTime: `อัพเดทราคาล่าสุด: ${updateDate} เวลา ${updateTime} น.` // ข้อความเวลาอัพเดท
        };
    } catch (error) {
        console.error("เกิดข้อผิดพลาดในการดึงราคาจาก API:", error);
        return null; 
    }
}

// ฟังก์ชันอัพเดท UI บนหน้าจอ
function updateTextData(data) {
    if(data.barBuy !== undefined) document.getElementById('bar-buy').innerText = data.barBuy;
    if(data.barSell !== undefined) document.getElementById('bar-sell').innerText = data.barSell;
    if(data.ornamentBuy !== undefined) document.getElementById('ornament-buy').innerText = data.ornamentBuy;
    if(data.ornamentSell !== undefined) document.getElementById('ornament-sell').innerText = data.ornamentSell;
    
    if (data.marquee !== undefined) {
        document.getElementById('marquee-text').innerText = data.marquee;
    }

    if (data.updateTime !== undefined) {
        document.getElementById('update-time').innerText = data.updateTime;
    }
}

function managePlaylist(mediaUrlString) {
    if (!mediaUrlString || mediaUrlString.trim() === "") {
        currentPlaylist = [];
        clearTimeout(imageTimer);
        document.getElementById('media-container').innerHTML = `<img src="default-bg.jpg" style="width: 100%; height: 100%; object-fit: cover;">`;
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
                   style="width: 100%; height: 100%; object-fit: cover;">
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
                 style="width: 100%; height: 100%; object-fit: cover;" 
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
            // โหมดดึงอัตโนมัติ (สมาคมค้าทองคำ)
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
            // โหมดแมนนวล (ป้อนเอง)
            const manualConfig = { ...config };
            if (manualConfig.barBuy) manualConfig.barBuy = formatToIntegerPrice(manualConfig.barBuy);
            if (manualConfig.barSell) manualConfig.barSell = formatToIntegerPrice(manualConfig.barSell);
            if (manualConfig.ornamentBuy) manualConfig.ornamentBuy = formatToIntegerPrice(manualConfig.ornamentBuy);
            if (manualConfig.ornamentSell) manualConfig.ornamentSell = formatToIntegerPrice(manualConfig.ornamentSell);
            
            // แปลง Timestamp ที่แอดมินกดเซฟ ให้เป็นวันที่และเวลา
            if (config.updatedAt) {
                const d = config.updatedAt.toDate();
                const dateStr = d.toLocaleDateString('th-TH');
                const timeStr = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
                manualConfig.updateTime = `อัพเดทราคาล่าสุด (กำหนดเอง): ${dateStr} เวลา ${timeStr} น.`;
            } else {
                manualConfig.updateTime = `อัพเดทราคาล่าสุด (กำหนดเอง): -`;
            }

            updateTextData(manualConfig);
        }

        managePlaylist(config.mediaUrl);

    } else {
        console.log("ยังไม่มีข้อมูลตั้งค่าสำหรับสาขาที่: " + branchId);
        document.getElementById('marquee-text').innerText = "รอการตั้งค่าจากแอดมินสำหรับสาขา " + branchId;
    }
});
