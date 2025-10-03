// Mengimpor modul yang diperlukan
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { WebcastPushConnection } = require('tiktok-live-connector');
const path = require('path');
const fs = require('fs');

// Membuat aplikasi Express
const app = express();
let port = process.env.PORT || 3000; // Bisa diatur via ENV, default 3000

// Membuat server HTTP dari aplikasi Express
let server = http.createServer(app);

// Membuat server WebSocket yang terhubung ke server HTTP
let wss = new WebSocket.Server({ server });

// --- Variabel Global untuk State Aplikasi ---
let tiktokConnection = null;

// --- Fungsi Helper ---
function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// --- Endpoint API ---
// Playlist
app.get('/api/playlist', (req, res) => {
    const mp3Directory = path.join(__dirname, 'mp3');
    fs.readdir(mp3Directory, (err, files) => {
        if (err) {
            console.error('Gagal membaca direktori mp3:', err);
            if (err.code === 'ENOENT') return res.json([]);
            return res.status(500).json({ error: 'Gagal memuat playlist.' });
        }

        const songFiles = files
            .filter(file => file.endsWith('.mp3'))
            .map(file => {
                const songId = parseInt(path.basename(file, '.mp3'), 10);
                if (!isNaN(songId)) {
                    return {
                        id: songId,
                        title: `Lagu #${songId}`,
                        artist: 'Playlist Server',
                        url: `/mp3/${file}`
                    };
                }
                return null;
            })
            .filter(Boolean)
            .sort((a, b) => a.id - b.id);

        res.json(songFiles);
    });
});

// Backgrounds
app.get('/api/backgrounds', (req, res) => {
    const bgDirectory = path.join(__dirname, 'bg');
    fs.readdir(bgDirectory, (err, files) => {
        if (err) {
            console.error('Gagal membaca direktori bg:', err);
            if (err.code === 'ENOENT') return res.json([]);
            return res.status(500).json({ error: 'Gagal memuat daftar latar belakang.' });
        }
        const imageFiles = files.filter(file => /\.(jpg|jpeg|png|gif)$/i.test(file));
        res.json(imageFiles);
    });
});

// Statis file (index.html, mp3, bg)
app.use(express.static(__dirname));

// --- WebSocket Handler ---
wss.on('connection', ws => {
    console.log('Koneksi WebSocket baru');

    ws.on('message', message => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'connect' && data.username) {
                if (tiktokConnection) {
                    tiktokConnection.disconnect();
                    tiktokConnection = null;
                }

                tiktokConnection = new WebcastPushConnection(data.username);

                tiktokConnection.on('error', err => {
                    console.error('tiktok-live-connector error:', err);
                    broadcast({
                        type: 'tiktokError',
                        message: 'Kesalahan TikTok API, beberapa interaksi mungkin tidak tampil.'
                    });
                });

                tiktokConnection.on('chat', data => {
                    console.log(`${data.uniqueId} berkomentar: ${data.comment}`);
                    broadcast({
                        type: 'chat',
                        uniqueId: data.uniqueId,
                        comment: data.comment,
                        profilePictureUrl: data.profilePictureUrl
                    });
                });

                tiktokConnection.on('gift', data => {
                    console.log(`${data.uniqueId} memberikan ${data.giftName}`);
                    broadcast({
                        type: 'gift',
                        uniqueId: data.uniqueId,
                        giftName: data.giftName,
                        repeatCount: data.repeatCount,
                        giftPictureUrl: data.giftPictureUrl
                    });
                });

                tiktokConnection.on('like', data => {
                    console.log(`${data.uniqueId} menyukai live`);
                    broadcast({
                        type: 'like',
                        uniqueId: data.uniqueId,
                        likeCount: data.likeCount,
                        profilePictureUrl: data.profilePictureUrl
                    });
                });

                tiktokConnection.on('follow', data => {
                    console.log(`${data.uniqueId} is now following!`);
                    broadcast({
                        type: 'follow',
                        uniqueId: data.uniqueId,
                        profilePictureUrl: data.profilePictureUrl
                    });
                });

                tiktokConnection.on('envelope', data => {
                    console.log('Envelope event received:', data);
                    broadcast({ type: 'envelope', data });
                });

                tiktokConnection.on('streamEnd', () => {
                    console.log('Stream TikTok telah berakhir.');
                    broadcast({ type: 'streamEnd' });
                    if (tiktokConnection) {
                        tiktokConnection.disconnect();
                        tiktokConnection = null;
                    }
                });

                tiktokConnection.connect()
                    .then(state => {
                        console.log(`Berhasil terhubung ke live TikTok ${state.roomInfo.uniqueId}`);
                        ws.send(JSON.stringify({
                            type: 'connectionStatus',
                            status: 'success',
                            message: `Berhasil terhubung ke: ${data.username}`
                        }));
                    })
                    .catch(err => {
                        console.error('Gagal terhubung ke live TikTok:', err);
                        ws.send(JSON.stringify({
                            type: 'connectionStatus',
                            status: 'error',
                            message: 'Gagal terhubung. Pastikan nama pengguna benar dan sedang live.'
                        }));
                    });

            } else {
                console.error(`Tipe pesan tidak dikenal: ${data.type}`);
                ws.send(JSON.stringify({
                    type: 'error',
                    message: `Tipe pesan tidak dikenal: '${data.type}'.`
                }));
            }
        } catch (e) {
            console.error('Gagal mengurai pesan WebSocket:', e);
        }
    });

    ws.on('close', () => {
        console.log('Koneksi WebSocket terputus');
        if (wss.clients.size === 0 && tiktokConnection) {
            console.log('Klien terakhir terputus. Menghentikan koneksi TikTok...');
            tiktokConnection.disconnect();
            tiktokConnection = null;
        }
    });
});

// --- Jalankan server dengan fallback port ---
function startServer(p) {
    server.listen(p, () => {
        console.log(`Server berjalan di http://localhost:${p}`);
        console.log('Buka URL di browser untuk melihat halaman.');
    }).on('error', err => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`⚠️ Port ${p} sudah dipakai. Mencoba port lain...`);
            startServer(p + 1); // coba port berikutnya
        } else {
            console.error('Server error:', err);
            process.exit(1);
        }
    });
}

startServer(port);
