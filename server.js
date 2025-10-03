
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { WebcastPushConnection } = require('tiktok-live-connector');
const path = require('path');

// Buat aplikasi Express dan server HTTP
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Sajikan file statis dari direktori root (misalnya, /bg, /sounds)
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

// --- KONEKSI TIKTOK TUNGGAL & GLOBAL ---
let tiktokLiveConnection = null;

// --- FUNGSI BROADCAST ---
// Mengirim data ke semua klien WebSocket yang terhubung
function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// --- HANDLER EVENT TIKTOK ---
// Fungsi-fungsi ini sekarang menggunakan 'broadcast' untuk mengirim event ke semua klien.

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
    try {
        if (!data || !data.uniqueId || !data.profilePictureUrl) {
            console.log('Menerima event member join dengan data tidak lengkap. Event dilewati.');
            return;
        }

        console.log(`${data.uniqueId} bergabung dalam stream!`);
        displayFloatingPhoto(data.profilePictureUrl, data.uniqueId);

        // --- Fitur Sapaan Acak ---
        const randomIndex = Math.floor(Math.random() * greetings.length);
        const randomGreetingTemplate = greetings[randomIndex];
        const finalGreeting = randomGreetingTemplate.replace('{username}', data.uniqueId);
        broadcast({ type: 'tts-greeting', greeting: finalGreeting });
    } catch (error) {
        console.error('Terjadi kesalahan saat menangani event member join:', error);
    }
}

function handleGift(data) {
    try {
        if (!data || !data.uniqueId || !data.profilePictureUrl) {
            console.log('Menerima event hadiah, tetapi data pengguna tidak lengkap. Event dilewati.');
            return;
        }

        if (data.giftType !== 1 || data.repeatEnd) {
            console.log(`${data.uniqueId} telah mengirim hadiah ${data.giftName || 'tidak dikenal'} x${data.repeatCount || 1}`);
            showBigPhoto(data.profilePictureUrl, data.uniqueId);
        }
    } catch (error) {
        console.error('Terjadi kesalahan saat menangani event hadiah:', error);
    }
}

function handleLike(data) {
    try {
        if (!data || !data.uniqueId) {
            console.log('Menerima event like dengan data tidak lengkap. Event dilewati.');
            return;
        }
        
        console.log(`${data.uniqueId} mengirim ${data.likeCount} suka`);
        for (let i = 0; i < data.likeCount; i++) {
            setTimeout(() => {
                broadcast({ type: 'like' });
            }, i * 100); // Penundaan kecil untuk efek burst
        }
    } catch (error) {
        console.error('Terjadi kesalahan saat menangani event like:', error);
    }
}

function handleShare(data) {
    try {
        if (!data || !data.uniqueId || !data.profilePictureUrl) {
            console.log('Menerima event share dengan data tidak lengkap. Event dilewati.');
            return;
        }
        
        console.log(`${data.uniqueId} membagikan stream!`);
        displayFloatingPhoto(data.profilePictureUrl, data.uniqueId);
    } catch (error) {
        console.error('Terjadi kesalahan saat menangani event share:', error);
    }
}

async function handleChat(data) {
    try {
        if (!data || !data.uniqueId || typeof data.comment === 'undefined') {
            console.log('Menerima event chat dengan data tidak lengkap. Event dilewati.');
            return;
        }

        console.log(`${data.uniqueId} (userId:${data.userId}) ${data.comment}`);
        
        // Siarkan pesan obrolan ke klien untuk TTS
        broadcast({ type: 'chat', userName: data.uniqueId, comment: data.comment });

        // Pemetaan komentar ke file suara
        const soundMapping = {
            'king': 'sounds/king.mp3', 'fyp': 'sounds/fyp.mp3',
            '1': 'sounds/1.mp3', '2': 'sounds/2.mp3', '3': 'sounds/3.mp3', '4': 'sounds/4.mp3', '5': 'sounds/5.mp3',
            '6': 'sounds/6.mp3', '7': 'sounds/7.mp3', '8': 'sounds/8.mp3', '9': 'sounds/9.mp3', '10': 'sounds/10.mp3',
            '11': 'sounds/11.mp3', '12': 'sounds/12.mp3', '13': 'sounds/13.mp3', '14': 'sounds/14.mp3', '15': 'sounds/15.mp3',
            '16': 'sounds/16.mp3', '17': 'sounds/17.mp3', '18': 'sounds/18.mp3', '19': 'sounds/19.mp3', '20': 'sounds/20.mp3',
            '21': 'sounds/21.mp3', '22': 'sounds/22.mp3', '23': 'sounds/23.mp3', '24': 'sounds/24.mp3', '25': 'sounds/25.mp3',
            '26': 'sounds/26.mp3', '27': 'sounds/27.mp3', '28': 'sounds/28.mp3', '29': 'sounds/29.mp3', '30': 'sounds/30.mp3',
            '31': 'sounds/31.mp3', '32': 'sounds/32.mp3', '33': 'sounds/33.mp3', '34': 'sounds/34.mp3', '35': 'sounds/35.mp3',
            '36': 'sounds/36.mp3', '37': 'sounds/37.mp3', '38': 'sounds/38.mp3', '39': 'sounds/39.mp3', '40': 'sounds/40.mp3',
            '41': 'sounds/41.mp3', '42': 'sounds/42.mp3', '43': 'sounds/43.mp3', '44': 'sounds/44.mp3', '45': 'sounds/45.mp3',
            '46': 'sounds/46.mp3', '47': 'sounds/47.mp3', '48': 'sounds/48.mp3', '49': 'sounds/49.mp3', '50': 'sounds/50.mp3',
            '51': 'sounds/51.mp3', '52': 'sounds/52.mp3', '53': 'sounds/53.mp3', '54': 'sounds/54.mp3', '55': 'sounds/55.mp3',
            '56': 'sounds/56.mp3', '57': 'sounds/57.mp3', '58': 'sounds/58.mp3', '59': 'sounds/59.mp3', '60': 'sounds/60.mp3',
            '61': 'sounds/61.mp3', '62': 'sounds/62.mp3', '63': 'sounds/63.mp3', '64': 'sounds/64.mp3', '65': 'sounds/65.mp3',
            '66': 'sounds/66.mp3', '67': 'sounds/67.mp3', '68': 'sounds/68.mp3', '69': 'sounds/69.mp3', '70': 'sounds/70.mp3',
            '71': 'sounds/71.mp3', '72': 'sounds/72.mp3', '73': 'sounds/73.mp3', '74': 'sounds/74.mp3', '75': 'sounds/75.mp3',
            '76': 'sounds/76.mp3', '77': 'sounds/77.mp3', '78': 'sounds/78.mp3', '79': 'sounds/79.mp3', '80': 'sounds/80.mp3',
            '81': 'sounds/81.mp3', '82': 'sounds/82.mp3', '83': 'sounds/83.mp3', '84': 'sounds/84.mp3', '85': 'sounds/85.mp3',
            '86': 'sounds/86.mp3', '87': 'sounds/87.mp3', '88': 'sounds/88.mp3', '89': 'sounds/89.mp3', '90': 'sounds/90.mp3',
            '91': 'sounds/91.mp3', '92': 'sounds/92.mp3', '93': 'sounds/93.mp3', '94': 'sounds/94.mp3', '95': 'sounds/95.mp3',
            '96': 'sounds/96.mp3', '97': 'sounds/97.mp3', '98': 'sounds/98.mp3', '99': 'sounds/99.mp3', '100': 'sounds/100.mp3'
        };

        const comment = data.comment.trim().toLowerCase();
        const soundFile = soundMapping[comment];

        if (soundFile) {
            playSound(soundFile);
        }

        if (comment === 'ganti') {
            stopPlayingSound();
        }
    } catch (error) {
        console.error('Terjadi kesalahan saat menangani event chat:', error);
    }
}

function setupTikTokListeners() {
    if (!tiktokLiveConnection) return;

    tiktokLiveConnection.removeAllListeners();

    tiktokLiveConnection.on('connected', state => console.log('Terhubung ke stream!', state));
    tiktokLiveConnection.on('disconnected', () => console.log('Koneksi terputus.'));
    tiktokLiveConnection.on('streamEnd', actionId => console.log('Stream berakhir dengan actionId:', actionId));

    tiktokLiveConnection.on('member', handleMemberJoin);
    tiktokLiveConnection.on('gift', handleGift);
    tiktokLiveConnection.on('like', handleLike);
    tiktokLiveConnection.on('share', handleShare);
    tiktokLiveConnection.on('chat', handleChat);
}

// Penanganan koneksi WebSocket
wss.on('connection', (ws) => {
    console.log('Klien baru terhubung.');

    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error('Gagal mem-parsing pesan:', message);
            return;
        }

        if (data.type === 'connect' && data.username) {
            const username = data.username;
            console.log(`Menerima permintaan koneksi untuk pengguna: ${username}`);

            if (tiktokLiveConnection && tiktokLiveConnection.isConnected()) {
                console.log('Memutuskan koneksi dari stream sebelumnya...');
                tiktokLiveConnection.disconnect();
            }

            console.log(`Mencoba terhubung ke @${username}...`);
            tiktokLiveConnection = new WebcastPushConnection(username);
            setupTikTokListeners();

            tiktokLiveConnection.connect().catch(err => {
                console.error(`Gagal terhubung ke @${username}:`, err);
                broadcast({ type: 'connection-failed', message: `Gagal terhubung ke @${username}. Pastikan nama pengguna benar dan sedang live.` });
            });
        }
    });

    ws.on('close', () => console.log('Klien terputus.'));
    ws.on('error', (err) => console.error('Error WebSocket:', err));
});

// Mulai server pada port 3000 dan dengarkan HANYA di localhost
const PORT = process.env.PORT || 3000;
server.listen(PORT, '127.0.0.1', () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});
