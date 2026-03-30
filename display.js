import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Firebase Configuration ของคุณ (ฝั่ง Display ไม่ต้องใช้ Storage)
const firebaseConfig = {
  apiKey: "AIzaSyDMMwciq6QoLSaWK6xfdr0U3ynyahtoaSk",
  authDomain: "studio-a33fe.firebaseapp.com",
  databaseURL: "https://studio-a33fe-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "studio-a33fe",
  messagingSenderId: "753539109404",
  appId: "1:753539109404:web:0d5b9f468294dacce645d9",
  measurementId: "G-WSYVYGNGCZ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// รับค่าสาขาจาก URL เช่น .../index.html?branch=1
const urlParams = new URLSearchParams(window.location.search);
const branchId = urlParams.get('branch') || '1'; // ถ้าไม่ระบุให้ถือเป็นสาขา 1

// ฟังก์ชันดึงราคาทองแบบอัตโนมัติ (ผ่าน Proxy ป้องกัน CORS บนเบราว์เซอร์)
async function fetchHuaSengHengPrice() {
    try {
        const response = await fetch('https://corsproxy.io/?https://online965.huasengheng.com/webprice965/');
        const data = await response.json();
        
        // เช็กโครงสร้างข้อมูล API และแปลงเป็นตัวเลขมีลูกน้ำ
        const bBuy = data.Buy || "-";
        const bSell = data.Sell || "-";
        
        // ตัวอย่างการคำนวณรูปพรรณ (ฮั่วเซ่งเฮงอาจไม่ได้ส่งมาตรงๆ ต้องคำนวณจากแท่ง)
        // **คุณสามารถปรับสูตรการบวกลบราคาได้ตามต้องการ**
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
        return null; // ถ้าดึงไม่สำเร็จ จะคงค่าเดิมไว้
    }
}

// ฟังก์ชันอัปเดตหน้าจอหลัก
function updateUI(data) {
    // 1. อัปเดตราคาทอง
    document.getElementById('bar-buy').innerText = data.barBuy || "-";
    document.getElementById('bar-sell').innerText = data.barSell || "-";
    document.getElementById('ornament-buy').innerText = data.ornamentBuy || "-";
    document.getElementById('ornament-sell').innerText = data.ornamentSell || "-";
    
    // 2. อัปเดตข้อความวิ่ง
    if (data.marquee) {
        document.getElementById('marquee-text').innerText = data.marquee;
    }

    // 3. จัดการแสดงผล สื่อ (รูปภาพ หรือ วิดีโอ)
    const mediaContainer = document.getElementById('media-container');
    if (data.mediaUrl && data.mediaUrl.trim() !== "") {
        const urlStr = data.mediaUrl.toLowerCase();
        // ถ้าแอดมินพิมพ์ชื่อไฟล์ลงท้ายด้วย .mp4 หรือ .webm ให้สร้างแท็ก <video>
        if (urlStr.endsWith('.mp4') || urlStr.endsWith('.webm')) {
            // เช็กก่อนว่ามีวิดีโอนี้เล่นอยู่แล้วหรือไม่ จะได้ไม่กระตุกโหลดใหม่ถ้าเป็นไฟล์เดิม
            const currentVideo = mediaContainer.querySelector('video');
            if (!currentVideo || currentVideo.getAttribute('src') !== data.mediaUrl) {
                mediaContainer.innerHTML = `
                    <video src="${data.mediaUrl}" 
                           autoplay loop muted playsinline
                           style="width: 100%; height: 100%; object-fit: cover;">
                    </video>`;
            }
        } else {
            // ถ้าเป็นรูปภาพ หรือนามสกุลอื่นๆ
            const currentImg = mediaContainer.querySelector('img');
            if (!currentImg || currentImg.getAttribute('src') !== data.mediaUrl) {
                mediaContainer.innerHTML = `
                    <img src="${data.mediaUrl}" 
                         style="width: 100%; height: 100%; object-fit: cover;" 
                         alt="Signage Media">`;
            }
        }
    } else {
        // ถ้าแอดมินไม่ได้กรอกอะไรเลย ให้แสดงรูป default
        mediaContainer.innerHTML = `<img src="default-bg.jpg" style="width: 100%; height: 100%; object-fit: cover;">`;
    }
}

// ตัวแปรเก็บ Timer สำหรับโหมดดึงอัตโนมัติ
let autoFetchInterval = null;

// ดักฟังการเปลี่ยนแปลงจาก Firestore แบบ Real-time
onSnapshot(doc(db, "branches", branchId), async (docSnap) => {
    if (docSnap.exists()) {
        const config = docSnap.data();
        
        // เคลียร์ Timer ตัวเก่าทิ้งก่อน ป้องกันการรันซ้อน
        if (autoFetchInterval) clearInterval(autoFetchInterval);

        if (config.isAutoMode) {
            // โหมด AUTO: ดึงราคาเดี๋ยวนี้เลย 1 ครั้ง
            const hshPrice = await fetchHuaSengHengPrice();
            if (hshPrice) {
                // เอาข้อมูลราคามารวมกับข้อมูลอื่นๆ (marquee, mediaUrl) ที่มาจากแอดมิน
                updateUI({ ...config, ...hshPrice }); 
            } else {
                // ถ้า API มีปัญหา ให้แสดง UI ตามปกติแต่ราคาอาจจะหายไป
                updateUI(config);
            }

            // ตั้งเวลารีเฟรชราคาใหม่ทุกๆ 1 นาที (60000 ms) โดยไม่โหลดรูป/วิดีโอใหม่
            autoFetchInterval = setInterval(async () => {
                const freshPrice = await fetchHuaSengHengPrice();
                if (freshPrice) {
                    // อัปเดตเฉพาะราคา
                    document.getElementById('bar-buy').innerText = freshPrice.barBuy;
                    document.getElementById('bar-sell').innerText = freshPrice.barSell;
                    document.getElementById('ornament-buy').innerText = freshPrice.ornamentBuy;
                    document.getElementById('ornament-sell').innerText = freshPrice.ornamentSell;
                }
            }, 60000);

        } else {
            // โหมด MANUAL: แอดมินกรอกมายังไง แสดงอย่างนั้นเลย
            updateUI(config);
        }
    } else {
        console.log("ยังไม่มีข้อมูลตั้งค่าสำหรับสาขาที่: " + branchId);
        document.getElementById('marquee-text').innerText = "รอการตั้งค่าจากแอดมินสำหรับสาขา " + branchId;
    }
});