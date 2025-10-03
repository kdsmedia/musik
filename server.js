const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { WebcastPushConnection } = require('tiktok-live-connector');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Sajikan file statis (bg, sounds, dll)
app.use(express.static(__dirname));

// Sajikan index.html untuk route utama
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- DAFTAR SAPAAN ACAK ---
const greetings = [
    'halo {username} yang baik hati',
    'halo {username} yang jarang mandi',
    'halo {username} yang suka jajan sembarangan',
    'halo {username} yang sedang di kejar pinjol',
    'halo {username} yang suka pake sendal sisirangan',
    'halo {username} yang di sayangi kedua orang tua',
    'halo {username} yang manja'
];

let tiktokLiveConnection = null;

// --- BROADCAST KE CLIENT ---
function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(JSON.stringify(data));
            } catch (err) {
                console.error("Gagal kirim pesan ke client:", err);
            }
        }
    });
}

// --- HANDLER EVENT TIKTOK ---
function displayFloatingPhoto(profilePictureUrl, userName) {
    broadcast({ type: 'floating-photo', profilePictureUrl, userName });
}

function showBigPhoto(profilePictureUrl, userName) {
    broadcast({ type: 'big-photo', profilePictureUrl, userName });
}

function playSound(soundPath) {
    broadcast({ type: 'play-sound', sound: soundPath });
}

function stopPlayingSound() {
    broadcast({ type: 'stop-sound' });
}

function handleMemberJoin(data) {
    console.log(`${data.uniqueId} bergabung dalam stream!`);
    displayFloatingPhoto(data.profilePictureUrl, data.uniqueId);

    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
    const finalGreeting = randomGreeting.replace('{username}', data.uniqueId);

    broadcast({ type: 'tts-greeting', greeting: finalGreeting });
}

function handleGift(data) {
    if (data.giftType !== 1 || data.repeatEnd) {
        console.log(`${data.uniqueId} mengirim hadiah ${data.giftName} x${data.repeatCount}`);
        showBigPhoto(data.profilePictureUrl, data.uniqueId);
    }
}

function handleLike(data) {
    console.log(`${data.uniqueId} mengirim ${data.likeCount} suka`);
    for (let i = 0; i < data.likeCount; i++) {
        setTimeout(() => displayFloatingPhoto(data.profilePictureUrl, data.uniqueId), i * 200);
    }
}

function handleShare(data) {
    console.log(`${data.uniqueId} membagikan stream!`);
    displayFloatingPhoto(data.profilePictureUrl, data.uniqueId);
}

function handleChat(data) {
    console.log(`${data.uniqueId} (userId:${data.userId}) menulis: ${data.comment}`);
    broadcast({ type: 'chat', userName: data.uniqueId, comment: data.comment });

    // mapping keyword -> sound
    const soundMapping = {
        "king": "sounds/stop.mp3",
        "fyp": "sounds/telolet.mp3",
        ...Object.fromEntries(Array.from({length:100}, (_,i)=>[`${i+1}`, `sounds/${i+1}.mp3`]))
    };

    const comment = data.comment.trim().toLowerCase();
    const soundFile = soundMapping[comment];

    if (soundFile) playSound(soundFile);
    if (comment === 'ganti') stopPlayingSound();
}

// --- SETUP LISTENER TIKTOK ---
function setupTikTokListeners() {
    if (!tiktokLiveConnection) return;
    tiktokLiveConnection.removeAllListeners();

    tiktokLiveConnection.on('connected', state => {
        console.log('✅ Terhubung ke TikTok Live:', state.roomId);
    });
    tiktokLiveConnection.on('disconnected', () => {
        console.log('⚠️ Koneksi TikTok terputus. Menunggu reconnect...');
    });
    tiktokLiveConnection.on('streamEnd', () => {
        console.log('❌ Stream berakhir.');
    });

    tiktokLiveConnection.on('member', handleMemberJoin);
    tiktokLiveConnection.on('gift', handleGift);
    tiktokLiveConnection.on('like', handleLike);
    tiktokLiveConnection.on('share', handleShare);
    tiktokLiveConnection.on('chat', handleChat);
}

// --- WEBSOCKET SERVER ---
wss.on('connection', (ws) => {
    console.log('🔌 Klien baru terhubung.');

    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch {
            console.error('❌ Gagal parsing pesan:', message);
            return;
        }

        if (data.type === 'connect' && data.username) {
            const username = data.username;
            console.log(`Mencoba terhubung ke @${username}...`);

            if (tiktokLiveConnection && tiktokLiveConnection.connected) {
                console.log('Putuskan koneksi lama...');
                tiktokLiveConnection.disconnect();
            }

            tiktokLiveConnection = new WebcastPushConnection(username, {
                signServerUrl: "http://127.0.0.1:8080/signature"
            });

            setupTikTokListeners();

            tiktokLiveConnection.connect().catch(err => {
                console.error(`❌ Gagal terhubung ke @${username}:`, err.message);
                broadcast({
                    type: 'connection-failed',
                    message: `Gagal konek ke @${username}. Pastikan nama benar & sedang live.`
                });
            });
        }
    });

    ws.on('close', () => console.log('❎ Klien terputus.'));
    ws.on('error', (err) => console.error('Error WebSocket:', err));
});

// --- JALANKAN SERVER ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});
