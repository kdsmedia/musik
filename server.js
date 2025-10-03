// Mengimpor modul yang diperlukan
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { WebcastPushConnection } = require('tiktok-live-connector');
const path = require('path');
const fs = require('fs');

// Membuat aplikasi Express
const app = express();
const port = 3000;

// Membuat server HTTP dari aplikasi Express
const server = http.createServer(app);

// Membuat server WebSocket yang terhubung ke server HTTP
const wss = new WebSocket.Server({ server });

// --- Variabel Global untuk State Aplikasi ---
let tiktokConnection = null;

// --- Fungsi Helper ---

/**
 * Mengirim pesan ke semua klien WebSocket yang terhubung.
 * @param {object} data Objek data yang akan dikirim.
 */
function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}


// --- Pengaturan Server ---

// Endpoint API HARUS didefinisikan SEBELUM penyajian file statis.
// Ini memastikan permintaan API tidak dicegat oleh middleware static.

// Endpoint API untuk mendapatkan daftar lagu dari folder mp3
app.get('/api/playlist', (req, res) => {
    const mp3Directory = path.join(__dirname, 'mp3');
    fs.readdir(mp3Directory, (err, files) => {
        if (err) {
            console.error('Gagal membaca direktori mp3:', err);
            // Jika direktori tidak ada, kirim array kosong agar frontend tidak error
            if (err.code === 'ENOENT') {
                return res.json([]);
            }
            return res.status(500).json({ error: 'Gagal memuat playlist.' });
        }

        const songFiles = files
            .filter(file => file.endsWith('.mp3'))
            .map(file => {
                const songId = parseInt(path.basename(file, '.mp3'), 10);
                if (!isNaN(songId)) {
                    return {
                        id: songId,
                        title: `Lagu #${songId}`, // Judul generik
                        artist: 'Playlist Server',   // Artis generik
                        url: `/mp3/${file}`      // Path URL untuk klien
                    };
                }
                return null;
            })
            .filter(Boolean) // Hapus entri null jika ada file mp3 tanpa nama angka
            .sort((a, b) => a.id - b.id); // Urutkan berdasarkan ID lagu

        res.json(songFiles);
    });
});

// Endpoint API untuk mendapatkan daftar latar belakang dari folder bg
app.get('/api/backgrounds', (req, res) => {
    const bgDirectory = path.join(__dirname, 'bg');
    fs.readdir(bgDirectory, (err, files) => {
        if (err) {
            console.error('Gagal membaca direktori bg:', err);
             // Jika direktori tidak ada, kirim array kosong
            if (err.code === 'ENOENT') {
                return res.json([]);
            }
            return res.status(500).json({ error: 'Gagal memuat daftar latar belakang.' });
        }
        
        // Filter hanya untuk file gambar
        const imageFiles = files.filter(file => /\.(jpg|jpeg|png|gif)$/i.test(file));
        res.json(imageFiles);
    });
});

// Menyajikan file statis dari direktori root (misalnya, index.html dan folder mp3, bg)
app.use(express.static(__dirname));


// Menangani koneksi WebSocket
wss.on('connection', ws => {
  console.log('Koneksi WebSocket baru');

  ws.on('message', message => {
    // Pesan dari klien diharapkan berupa JSON
    try {
      const data = JSON.parse(message);
      if (data.type === 'connect' && data.username) {
        // Hentikan koneksi TikTok yang sudah ada jika ada
        if (tiktokConnection) {
          tiktokConnection.disconnect();
          tiktokConnection = null;
        }

        // Buat koneksi baru ke TikTok Live
        tiktokConnection = new WebcastPushConnection(data.username);
        
        // Menangani kesalahan dari koneksi TikTok untuk mencegah server crash.
        // Ini penting karena TikTok dapat mengubah API mereka, yang dapat menyebabkan
        // library 'tiktok-live-connector' gagal mem-parsing data dan melempar error.
        tiktokConnection.on('error', err => {
            console.error('Terjadi kesalahan di tiktok-live-connector:', err);
            broadcast({
                type: 'tiktokError',
                message: 'Terjadi kesalahan saat memproses data dari TikTok. Beberapa interaksi mungkin tidak tampil.'
            });
        });

        // Tambahkan event listener untuk berbagai acara TikTok Live
        tiktokConnection.on('chat', data => {
          console.log(`${data.uniqueId} berkomentar: ${data.comment}`);
          
          // Kirim data komentar ke semua klien
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
          broadcast({
            type: 'envelope',
            data: data
          });
        });
        
        tiktokConnection.on('streamEnd', () => {
          console.log('Stream TikTok telah berakhir.');
          broadcast({ type: 'streamEnd' });
          if(tiktokConnection) {
            tiktokConnection.disconnect();
            tiktokConnection = null;
          }
        });

        tiktokConnection.connect().then(state => {
          console.log(`Berhasil terhubung ke live TikTok ${state.roomInfo.uniqueId}`);
          ws.send(JSON.stringify({
            type: 'connectionStatus',
            status: 'success',
            message: `Berhasil terhubung ke: ${data.username}`
          }));
        }).catch(err => {
          console.error('Gagal terhubung ke live TikTok:', err);
          ws.send(JSON.stringify({
            type: 'connectionStatus',
            status: 'error',
            message: 'Gagal terhubung. Pastikan nama pengguna benar dan sedang live.'
          }));
        });

      } else {
        // Menangani tipe pesan yang tidak dikenal
        console.error(`Menerima tipe pesan yang tidak dikenal: ${data.type}`);
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
    // Jika tidak ada klien lain yang terhubung, putuskan koneksi TikTok
    if (wss.clients.size === 0 && tiktokConnection) {
        console.log('Klien terakhir terputus. Menghentikan koneksi TikTok...');
        tiktokConnection.disconnect();
        tiktokConnection = null;
    }
  });
});

// Memulai server dan mendengarkan permintaan
server.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
  console.log('Buka URL di browser untuk melihat halaman.');
});
