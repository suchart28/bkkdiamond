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

function updateUI(data) {
    if(data.barBuy !== undefined) document.getElementById('bar-buy').innerText = data.barBuy;
    if(data.barSell !== undefined) document.getElementById('bar-sell').innerText = data.barSell;
    if(data.ornamentBuy !== undefined) document.getElementById('ornament-buy').innerText = data.ornamentBuy;
    if(data.ornamentSell !== undefined) document.getElementById('ornament-sell').innerText = data.ornamentSell;
    
    if (data.marquee !== undefined) {
        document.getElementById('marquee-text').innerText = data.marquee;
    }

    const mediaContainer = document.getElementById('media-container');
    if (data.mediaUrl && data.mediaUrl.trim() !== "") {
        const urlStr = data.mediaUrl.toLowerCase();
        
        if (urlStr.endsWith('.mp4') || urlStr.endsWith('.webm')) {
            const currentVideo = mediaContainer.querySelector('video');
            if (!currentVideo || currentVideo.getAttribute('src') !== data.mediaUrl) {
                // บังคับ fill ให้ยืดเต็มจอ
                mediaContainer.innerHTML = `
                    <video src="${data.mediaUrl}" 
                           autoplay loop muted playsinline
                           style="width: 100%; height: 100%; object-fit: fill;">
                    </video>`;
            }
        } else {
            const currentImg = mediaContainer.querySelector('img');
            if (!currentImg || currentImg.getAttribute('src') !== data.mediaUrl) {
                // บังคับ fill ให้ยืดเต็มจอ
                mediaContainer.innerHTML = `
                    <img src="${data.mediaUrl}" 
                         style="width: 100%; height: 100%; object-fit: fill;" 
                         alt="Signage Media">`;
            }
        }
    } else {
        mediaContainer.innerHTML = `<img src="default-bg.jpg" style="width: 100%; height: 100%; object-fit: fill;">`;
    }
}

let autoFetchInterval = null;

onSnapshot(doc(db, "branches", branchId), async (docSnap) => {
    if (docSnap.exists()) {
        const config = docSnap.data();
        
        if (autoFetchInterval) clearInterval(autoFetchInterval);

        if (config.isAutoMode) {
            const hshPrice = await fetchHuaSengHengPrice();
            if (hshPrice) {
                updateUI({ ...config, ...hshPrice }); 
            } else {
                updateUI(config); 
            }

            autoFetchInterval = setInterval(async () => {
                const freshPrice = await fetchHuaSengHengPrice();
                if (freshPrice) {
                    document.getElementById('bar-buy').innerText = freshPrice.barBuy;
                    document.getElementById('bar-sell').innerText = freshPrice.barSell;
                    document.getElementById('ornament-buy').innerText = freshPrice.ornamentBuy;
                    document.getElementById('ornament-sell').innerText = freshPrice.ornamentSell;
                }
            }, 60000);

        } else {
            updateUI(config);
        }
    } else {
        console.log("ยังไม่มีข้อมูลตั้งค่าสำหรับสาขาที่: " + branchId);
        document.getElementById('marquee-text').innerText = "รอการตั้งค่าจากแอดมินสำหรับสาขา " + branchId;
    }
});
