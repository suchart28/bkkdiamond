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

// ฟังก์ชันดึงราคาจากเว็บสมาคมค้าทองคำ (Web Scraping)
async function fetchGoldTradersPrice() {
    try {
        const targetUrl = 'https://www.goldtraders.or.th/';
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
        
        const response = await fetch(proxyUrl);
        const data = await response.json();
        
        // แปลง HTML String ที่ดึงมาได้ เป็น Document object เพื่อค้นหาข้อมูล
        const parser = new DOMParser();
        const doc = parser.parseFromString(data.contents, 'text/html');
        
        // เจาะดึงข้อมูลตาม ID ของเว็บสมาคมค้าทองคำโดยตรง
        const bBuy = doc.getElementById('DetailPlace_uc_goldprices1_lblTarBuy')?.innerText || "-";
        const bSell = doc.getElementById('DetailPlace_uc_goldprices1_lblTarSell')?.innerText || "-";
        const oBuy = doc.getElementById('DetailPlace_uc_goldprices1_lblGoldBuy')?.innerText || "-";
        const oSell = doc.getElementById('DetailPlace_uc_goldprices1_lblGoldSell')?.innerText || "-";

        return {
            barBuy: bBuy.trim(),
            barSell: bSell.trim(),
            ornamentBuy: oBuy.trim(),
            ornamentSell: oSell.trim()
        };
    } catch (error) {
        console.error("เกิดข้อผิดพลาดในการดึงราคาจากสมาคมค้าทองคำ:", error);
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
            // เรียกใช้ฟังก์ชันดึงราคาสมาคมค้าทองคำ
            const goldPrice = await fetchGoldTradersPrice();
            if (goldPrice) {
                updateTextData({ ...config, ...goldPrice }); 
            } else {
                updateTextData(config); 
            }

            autoFetchInterval = setInterval(async () => {
                const freshPrice = await fetchGoldTradersPrice();
                if (freshPrice) {
                    updateTextData(freshPrice);
                }
            }, 60000); // รีเฟรชราคาใหม่ทุกๆ 1 นาที

        } else {
            updateTextData(config);
        }

        managePlaylist(config.mediaUrl);

    } else {
        console.log("ยังไม่มีข้อมูลตั้งค่าสำหรับสาขาที่: " + branchId);
        document.getElementById('marquee-text').innerText = "รอการตั้งค่าจากแอดมินสำหรับสาขา " + branchId;
    }
});
