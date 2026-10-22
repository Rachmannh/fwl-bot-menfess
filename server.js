const { Telegraf, Markup } = require('telegraf');
const express = require('express');
require('dotenv').config();
const db = require('./config/db');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const bot = new Telegraf(process.env.BOT_TOKEN);
const CHANNEL_ID = process.env.CHANNEL_ID;

// ==========================================
// HELPER & MIDDLEWARE VALIDASI ADMIN
// ==========================================
function isAdmin(userId) {
    if (!userId) return false;
    const rawAdminIds = process.env.ADMIN_IDS || '';
    const adminList = rawAdminIds.split(',').map(id => id.trim()).filter(Boolean);
    return adminList.includes(String(userId));
}

const adminOnly = async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!isAdmin(userId)) {
        return ctx.reply('⛔ <b>Akses Ditolak!</b>\n\nPerintah ini hanya dapat dijalankan oleh Admin yang terdaftar di sistem.', {
            parse_mode: 'HTML'
        });
    }
    return next();
};

// ==========================================
// FUNGSI UTAMA: Menampilkan Menu Welcome
// ==========================================
async function tampilkanMenuUtama(ctx) {
    const userId = ctx.from.id;
    const namaDepan = ctx.from.first_name || "Member";

    try {
        const [rows] = await db.execute('SELECT * FROM PENGGUNA WHERE ID_TELEGRAM = ?', [userId]);
        
        if (rows.length === 0) {
            await db.execute(
                'INSERT INTO PENGGUNA (ID_TELEGRAM, NAMA_PENGGUNA, SALDO_KOIN, STATUS_VIP, JUMLAH_MENFESS_HARIAN, TANGGAL_RESET_TERAKHIR) VALUES (?, ?, 0, 0, 0, CURDATE())',
                [userId, ctx.from.username || namaDepan]
            );
        }

        // Teks sapaan sesuai permintaan (Bisa disesuaikan username channel/grupnya)
        const pesanWelcome = `Hai ${namaDepan} 👋\n\n` +
                             `*FWL Auto Post* adalah bot auto post pesan yang anda kirim akan masuk ke channel @fwlbase dan terhubung ke @fwlbasechat\n\n` +
                             `Silahkan baca help dan rules terlebih dahulu, pilih menu di bawah ini untuk info panduan:`;

        const menuTombol = Markup.inlineKeyboard([
            [
                Markup.button.callback('👤 Profil & Koin', 'CEK_PROFIL'),
                Markup.button.callback('💎 Top Up', 'TOP_UP')
            ],
            [
                Markup.button.callback('📜 Commands', 'ATURAN'),
                Markup.button.callback('🏆 Akses VIP', 'INFO_VIP')
            ],
            [
                Markup.button.callback('❌ Tutup Menu', 'TUTUP_MENU')
            ]
        ]);

        await ctx.replyWithMarkdown(pesanWelcome, menuTombol);

    } catch (err) {
        console.error(err);
        ctx.reply('Terjadi kesalahan pada sistem database saat memuat menu.');
    }
}

// ==========================================
// ROUTING BOT (COMMAND & ACTION MENU)
// ==========================================

bot.start((ctx) => {
    tampilkanMenuUtama(ctx);
});

bot.action('CEK_PROFIL', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const userId = ctx.from.id;
    
    try {
        const [rows] = await db.execute('SELECT * FROM PENGGUNA WHERE ID_TELEGRAM = ?', [userId]);
        if (rows.length > 0) {
            const user = rows[0];
            
            // 1. Ambil Total Semua Menfess dari tabel Riwayat
            const [riwayat] = await db.execute('SELECT COUNT(*) as total FROM RIWAYAT_MENFESS WHERE ID_PENGIRIM = ?', [userId]);
            const semuaMenfess = riwayat[0].total;

            // 2. Format Status, Nama, dan Username
            const statusVip = user.STATUS_VIP ? 'vip' : 'member';
            const namaUser = ctx.from.first_name || user.NAMA_PENGGUNA;
            const usernameUser = ctx.from.username ? `@${ctx.from.username}` : 'Tidak ada';

            // 3. Format Tanggal Bergabung ke Bahasa Indonesia (WIB)
            const dateObj = new Date(user.TANGGAL_BERGABUNG);
            const opsiTanggal = { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' };
            const opsiWaktu = { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' };
            
            let formatTanggal = new Intl.DateTimeFormat('id-ID', opsiTanggal).format(dateObj);
            let formatWaktu = new Intl.DateTimeFormat('id-ID', opsiWaktu).format(dateObj);
            // Menyesuaikan penulisan Jumat menjadi Jum'at jika diperlukan (opsional)
            formatTanggal = formatTanggal.replace('Jumat', "Jum'at");

            // 4. Susun Teks Profil sesuai Template Anda
            const teksProfil = `👤 *Profile User*\n\n` +
                               `📛 Nama: ${namaUser}\n` +
                               `🆔 User ID: \`${user.ID_TELEGRAM}\`\n` +
                               `🌐 Username: ${usernameUser}\n` +
                               `💰 Saldo: ${user.SALDO_KOIN} coin\n` +
                               `🔰 Status: ${statusVip}\n\n` +
                               `📊 *User Stats*\n` +
                               ` • Menfess Harian : ${user.JUMLAH_MENFESS_HARIAN}/1\n` +
                               ` • Semua Menfess : ${semuaMenfess}\n` +
                               ` • Bergabung : ${formatTanggal}, Jam ${formatWaktu}\n\n` +
                               `Code Top Up : \`fwl ${user.ID_TELEGRAM}\``;
            
            await ctx.editMessageText(teksProfil, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Kembali ke Menu', 'KEMBALI_MENU')]
                ])
            });
        }
    } catch (error) {
        console.error(error);
        ctx.answerCbQuery('Gagal memuat profil.', { show_alert: true }).catch(() => {});
    }
});

bot.action('KEMBALI_MENU', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.deleteMessage().catch(() => {});
    tampilkanMenuUtama(ctx); 
});

bot.action('TUTUP_MENU', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    ctx.deleteMessage().catch(() => {});
});

bot.catch((err, ctx) => {
    console.error(`Error for ${ctx?.updateType}:`, err);
});

// ==========================================
// HELPER: Konten Pesan & Tombol Top Up
// ==========================================
function getTopUpContent(userId) {
    const topupUrl = `https://trakteer.id/friendswithlust/tip?quantity=10&step=2&supporter_message=fwl%20${userId}`;

    const teksTopUp = `FWL coin di gunakan untuk biaya mengirim menfess/promote ke @fwlbase jika 1x batas kirim harian sudah habis. biaya untuk sekali mengirim adalah 100 coin.\n\n` +
                      `❏ Cara Membeli Coin FWL\n` +
                      `├ 1. klik button top up dibawah ini\n` +
                      `├ 2. nama: (masukan username telegram kalian)\n` +
                      `└ 3. pesan dukungan: <code>fwl ${userId}</code>\n\n` +
                      `coin akan berkurang secara otomatis jika batas harian sudah habis.\n` +
                      `harga 100 coin = 1000 rupiah`;

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.url('💰 TOP UP COIN FWL', topupUrl)],
        [
            Markup.button.callback('🔙 Kembali', 'KEMBALI_MENU'),
            Markup.button.callback('🗑 Tutup', 'TUTUP_MENU')
        ]
    ]);

    return { teksTopUp, keyboard };
}

bot.action('TOP_UP', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const userId = ctx.from.id;
    const { teksTopUp, keyboard } = getTopUpContent(userId);

    try {
        await ctx.editMessageText(teksTopUp, {
            parse_mode: 'HTML',
            ...keyboard
        });
    } catch (err) {
        await ctx.reply(teksTopUp, {
            parse_mode: 'HTML',
            ...keyboard
        });
    }
});

// ==========================================
// MENU: COMMANDS & PANDUAN PENGGUNAAN
// ==========================================
bot.action('ATURAN', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});

    const teksCommands = `📜 <b>Panduan & Aturan Kirim Menfess</b>\n\n` +
                         `<b>1. Wajib Gabung Komunitas:</b>\n` +
                         `Pastikan kamu sudah bergabung di channel <b>@fwlbase</b> dan grup <b>@fwlbasechat</b> sebelum mengirim menfess.\n\n` +
                         `<b>2. Format Pesan & Tagar:</b>\n` +
                         `Setiap pesan <b>wajib menyertakan tagar</b> resmi yang telah terdaftar (contoh: <code>#fwlboy</code>, <code>#fwlgirl</code>).\n` +
                         `• Format kirim: Tulis pesanmu lalu sertakan hashtag di dalam pesan.\n` +
                         `• Bot akan otomatis memasang foto template sesuai tagar yang kamu gunakan.\n\n` +
                         `<b>3. Sistem Kuota & Koin:</b>\n` +
                         `• <b>Kuota Gratis:</b> 1x kirim gratis setiap hari (reset otomatis jam 00:00 WIB).\n` +
                         `• <b>Kirim Berikutnya:</b> Dikenakan biaya 100 FWL Coin per menfess jika kuota gratis sudah habis.\n` +
                         `• Koin bisa didapatkan melalui menu <b>Top Up</b> (Rp 1.000 = 100 coin).\n\n` +
                         `<b>4. Siklus Auto-Delete (24 Jam):</b>\n` +
                         `Setiap menfess yang terkirim ke channel akan otomatis dihapus setelah 24 jam demi menjaga kerapian channel.`;

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('🔙 Kembali ke Menu', 'KEMBALI_MENU'),
            Markup.button.callback('🗑 Tutup', 'TUTUP_MENU')
        ]
    ]);

    try {
        await ctx.editMessageText(teksCommands, {
            parse_mode: 'HTML',
            ...keyboard
        });
    } catch (err) {
        await ctx.reply(teksCommands, {
            parse_mode: 'HTML',
            ...keyboard
        });
    }
});

// ==========================================
// MENU: AKSES & BENEFIT VIP
// ==========================================
bot.action('INFO_VIP', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});

    const teksVip = `🏆 <b>Informasi & Akses Member VIP</b>\n\n` +
                    `Upgrade akunmu menjadi <b>VIP Member</b> di FWL Community untuk menikmati berbagai fasilitas istimewa:\n\n` +
                    `✨ <b>Keuntungan Menjadi VIP:</b>\n` +
                    `├ 🚀 <b>Bebas Batasan Kuota:</b> Kirim menfess tanpa khawatir limit harian reguler.\n` +
                    `├ 💎 <b>Badge Status VIP:</b> Tanda status khusus pada profil bot kamu.\n` +
                    `├ ⚡ <b>Prioritas Antrean:</b> Pengiriman menfess diproses dengan jalur cepat.\n` +
                    `└ 🛡️ <b>Dukungan Prioritas:</b> Layanan bantuan langsung dari admin jika mengalami kendala.\n\n` +
                    `📌 <b>Cara Aktivasi Akses VIP:</b>\n` +
                    `Akses VIP diaktifkan langsung oleh pihak pengelola. Silakan hubungi admin official kami untuk konsultasi paket dan aktivasi akun VIP-mu.`;

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.url('💬 Hubungi Admin', 'https://t.me/fwlbasechat'),
            Markup.button.callback('🔙 Kembali ke Menu', 'KEMBALI_MENU')
        ],
        [
            Markup.button.callback('🗑 Tutup Menu', 'TUTUP_MENU')
        ]
    ]);

    try {
        await ctx.editMessageText(teksVip, {
            parse_mode: 'HTML',
            ...keyboard
        });
    } catch (err) {
        await ctx.reply(teksVip, {
            parse_mode: 'HTML',
            ...keyboard
        });
    }
});

// ==========================================
// FITUR SET TEMPLATE (KHUSUS ADMIN BOT)
// ==========================================
bot.command('settemplate', adminOnly, async (ctx) => {
    if (!ctx.message.reply_to_message || !ctx.message.reply_to_message.photo) {
        return ctx.reply('Balas (reply) foto template dengan perintah: /settemplate #tagar');
    }

    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply('Format salah! Contoh: /settemplate #fwlboy');
    }

    const tagar = args[1].toLowerCase();
    const photos = ctx.message.reply_to_message.photo;
    const fileId = photos[photos.length - 1].file_id; 

    try {
        await db.execute(
            'INSERT INTO TEMPLATE_GAMBAR (TAGAR, FILE_ID_TELEGRAM) VALUES (?, ?) ON DUPLICATE KEY UPDATE FILE_ID_TELEGRAM = ?',
            [tagar, fileId, fileId]
        );
        ctx.reply(`✅ Template untuk tagar ${tagar} berhasil disimpan ke database.`);
    } catch (err) {
        console.error(err);
        ctx.reply('❌ Gagal menyimpan template gambar.');
    }
});

// ==========================================
// FITUR UTAMA: DETEKSI MENFESS MASUK
// ==========================================
bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name;

    // 1. Regex untuk mendeteksi tagar meski ada spasi atau Enter
    const match = text.match(/(#[a-zA-Z0-9_]+)/);
    const foundTagar = match ? match[1].toLowerCase() : null;

    if (!foundTagar) {
        return; // Abaikan pesan jika tidak mengandung hashtag
    }

    // 2. FITUR WAJIB JOIN CHANNEL & GRUP (FORCE SUBSCRIBE)
    const requiredChats = ['@fwlbase', '@fwlbasechat'];
    let sudahJoinSemua = true;

    for (const chat of requiredChats) {
        try {
            const memberInfo = await ctx.telegram.getChatMember(chat, userId);
            if (memberInfo.status === 'left' || memberInfo.status === 'kicked') {
                sudahJoinSemua = false;
                break;
            }
        } catch (error) {
            console.error(`Gagal mengecek status member di ${chat}:`, error.message);
            sudahJoinSemua = false;
            break;
        }
    }

    if (!sudahJoinSemua) {
        return ctx.reply(
            `⚠️ *Akses Ditolak!*\n\n` +
            `Untuk mengirim menfess, kamu wajib bergabung ke komunitas kami terlebih dahulu:\n\n` +
            `📢 Channel: @fwlbase\n` +
            `💬 Grup: @fwlbasechat\n\n` +
            `_Jika sudah bergabung keduanya, silakan kirim ulang pesan menfess-mu._`,
            { parse_mode: 'Markdown' }
        );
    }

    // 3. PROSES DATABASE, KUOTA, DAN PENGIRIMAN
    try {
        // Menggunakan DATE_FORMAT agar MySQL mengirim string tanggal murni
        let [users] = await db.execute('SELECT *, DATE_FORMAT(TANGGAL_RESET_TERAKHIR, "%Y-%m-%d") as TGL_STRING FROM PENGGUNA WHERE ID_TELEGRAM = ?', [userId]);
        let user;
        
        // Memakai Zona Waktu Indonesia (WIB) untuk tanggal hari ini
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

        if (users.length === 0) {
            await db.execute(
                'INSERT INTO PENGGUNA (ID_TELEGRAM, NAMA_PENGGUNA, SALDO_KOIN, STATUS_VIP, JUMLAH_MENFESS_HARIAN, TANGGAL_RESET_TERAKHIR) VALUES (?, ?, 0, 0, 0, ?)',
                [userId, username, today]
            );
            let [newUserQuery] = await db.execute('SELECT *, DATE_FORMAT(TANGGAL_RESET_TERAKHIR, "%Y-%m-%d") as TGL_STRING FROM PENGGUNA WHERE ID_TELEGRAM = ?', [userId]);
            user = newUserQuery[0];
        } else {
            user = users[0];
            // Cek apakah hari ini beda dengan TANGGAL_RESET_TERAKHIR di database
            if (user.TGL_STRING !== today) {
                await db.execute(
                    'UPDATE PENGGUNA SET JUMLAH_MENFESS_HARIAN = 0, TANGGAL_RESET_TERAKHIR = ? WHERE ID_TELEGRAM = ?',
                    [today, userId]
                );
                user.JUMLAH_MENFESS_HARIAN = 0;
            }
        }

        // Ambil ID Template Gambar berdasarkan Tagar
        const [templates] = await db.execute('SELECT FILE_ID_TELEGRAM FROM TEMPLATE_GAMBAR WHERE TAGAR = ?', [foundTagar]);
        if (templates.length === 0) {
            return ctx.reply(`❌ Tagar ${foundTagar} belum memiliki template gambar yang terdaftar oleh admin.`);
        }
        const fileIdGambar = templates[0].FILE_ID_TELEGRAM;

        // Cek Biaya Koin & Limit Kuota
        let biayaKoin = 0;
        if (user.JUMLAH_MENFESS_HARIAN >= 1) {
            if (user.SALDO_KOIN < 100) {
                const { teksTopUp, keyboard } = getTopUpContent(userId);
                return ctx.reply(teksTopUp, {
                    parse_mode: 'HTML',
                    reply_to_message_id: ctx.message.message_id,
                    allow_sending_without_reply: true,
                    ...keyboard
                });
            }
            biayaKoin = 100;
            await db.execute('UPDATE PENGGUNA SET SALDO_KOIN = SALDO_KOIN - 100 WHERE ID_TELEGRAM = ?', [userId]);
        } else {
            await db.execute('UPDATE PENGGUNA SET JUMLAH_MENFESS_HARIAN = JUMLAH_MENFESS_HARIAN + 1 WHERE ID_TELEGRAM = ?', [userId]);
        }

        // Hitung perkiraan waktu hapus 24 jam ke depan (WIB)
        const waktuHapus = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const formatHapusWIB = new Intl.DateTimeFormat('id-ID', {
            timeZone: 'Asia/Jakarta',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).format(waktuHapus).replace(/\./g, ':');

        // Tambahkan label auto-delete pada caption foto di channel
        const footerDelete = `\n\n⏳ Auto Delete: 24 Jam (Hapus: ${formatHapusWIB} WIB)`;
        let finalCaption = text + footerDelete;
        if (finalCaption.length > 1024) {
            const sisa = 1024 - footerDelete.length - 3;
            finalCaption = text.substring(0, sisa) + '...' + footerDelete;
        }

        // Kirim Menfess ke Channel Utama
        const pesanTerkirim = await bot.telegram.sendPhoto(CHANNEL_ID, fileIdGambar, {
            caption: finalCaption
        });

        // Catat Riwayat Transaksi Menfess beserta ID Pesan & Waktu Kedaluwarsa
        await db.execute(
            `INSERT INTO RIWAYAT_MENFESS 
             (ID_PENGIRIM, TEKS_PESAN, TAGAR_YANG_DIPAKAI, ID_PESAN_TELEGRAM, STATUS_HAPUS, WAKTU_KEDALUWARSA, BIAYA_KOIN) 
             VALUES (?, ?, ?, ?, 0, NOW() + INTERVAL 24 HOUR, ?)`,
            [userId, text, foundTagar, pesanTerkirim.message_id, biayaKoin]
        );

        // Notifikasi Berhasil ke Pengirim
        const sisaKuota = user.JUMLAH_MENFESS_HARIAN >= 1 ? 0 : (1 - (user.JUMLAH_MENFESS_HARIAN + 1));
        const sisaKoin = user.JUMLAH_MENFESS_HARIAN >= 1 ? (user.SALDO_KOIN - 100) : user.SALDO_KOIN;
        ctx.reply(
            `✅ Menfess berhasil dikirim ke channel!\n\n` +
            `⏳ Auto Delete: 24 Jam (Dihapus: ${formatHapusWIB} WIB)\n` +
            `📊 Sisa kuota gratis hari ini: ${sisaKuota}/1\n` +
            `💰 Biaya: ${biayaKoin} Koin\n` +
            `💳 Sisa saldo koin: ${sisaKoin} coin.`
        );

    } catch (err) {
        console.error(err);
        ctx.reply('❌ Terjadi kesalahan saat memproses menfess. Pastikan bot adalah Admin di Channel.');
    }
});

// ==========================================
// REST API & WEBHOOK
// ==========================================
app.get('/api/user/:id', async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM PENGGUNA WHERE ID_TELEGRAM = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'User tidak ditemukan' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint Webhook Trakteer
const handleTrakteerWebhook = async (req, res) => {
    try {
        const payload = req.body;
        console.log('📩 [Webhook Trakteer] Data diterima:', JSON.stringify(payload));

        // 1. Verifikasi Webhook Key jika diset di .env (Opsional)
        const webhookKey = process.env.TRAKTEER_WEBHOOK_KEY;
        const incomingKey = req.headers['x-trakteer-key'] || req.headers['x-webhook-token'] || req.query.key;
        if (webhookKey && incomingKey && incomingKey !== webhookKey) {
            console.warn('⚠️ [Webhook Trakteer] Webhook Key tidak cocok!');
            return res.status(401).json({ status: false, message: 'Invalid webhook key' });
        }

        // 1.5 Cek jika ini adalah Test Webhook dari Dashboard Trakteer
        const isTest = (payload.transaction_id && payload.transaction_id.startsWith('test-')) ||
                       payload.supporter_name === '[ Stream Test ]';
        if (isTest) {
            console.log('🧪 [Webhook Trakteer] Test Webhook diterima dan berhasil divalidasi!');
            return res.status(200).json({
                status: true,
                message: 'Test Webhook Trakteer berhasil diterima!'
            });
        }

        // Ambil data dari payload Trakteer
        const supporterName = payload.supporter_name || 'Member';
        const supporterMessage = payload.supporter_message || '';
        const quantity = Number(payload.quantity) || 1;
        const price = Number(payload.price) || (quantity * 1000);

        // 2. Ekstrak User ID Telegram dari Pesan Dukungan (contoh: "fwl 123456789" atau "fwl%20123456789")
        const match = supporterMessage.match(/fwl[^\d]*(\d+)/i);
        if (!match) {
            console.warn(`⚠️ [Webhook Trakteer] Pesan tidak mengandung ID Telegram valid: "${supporterMessage}"`);
            return res.status(200).json({
                status: false,
                message: 'Pesan dukungan tidak mengandung format fwl <ID_TELEGRAM>'
            });
        }

        const userId = match[1];

        // 3. Hitung Koin (Rp 1.000 = 100 koin)
        let koinDapat = 0;
        if (payload.price) {
            koinDapat = Math.floor(Number(payload.price) / 10);
        } else {
            koinDapat = quantity * 100;
        }

        if (koinDapat <= 0) {
            koinDapat = 100;
        }

        // 4. Update Saldo Koin ke Database
        const [userRows] = await db.execute('SELECT * FROM PENGGUNA WHERE ID_TELEGRAM = ?', [userId]);
        let saldoBaru = 0;

        if (userRows.length > 0) {
            await db.execute('UPDATE PENGGUNA SET SALDO_KOIN = SALDO_KOIN + ? WHERE ID_TELEGRAM = ?', [koinDapat, userId]);
            saldoBaru = Number(userRows[0].SALDO_KOIN) + koinDapat;
        } else {
            const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
            await db.execute(
                'INSERT INTO PENGGUNA (ID_TELEGRAM, NAMA_PENGGUNA, SALDO_KOIN, STATUS_VIP, JUMLAH_MENFESS_HARIAN, TANGGAL_RESET_TERAKHIR) VALUES (?, ?, ?, 0, 0, ?)',
                [userId, supporterName, koinDapat, today]
            );
            saldoBaru = koinDapat;
        }

        console.log(`✅ [Webhook Trakteer] Berhasil menambah ${koinDapat} koin ke User ID: ${userId} (${supporterName}). Saldo baru: ${saldoBaru}`);

        // 5. Kirim Pesan Notifikasi Sukses ke Telegram Member
        try {
            const notifMsg = `🎉 <b>Top Up Koin Berhasil!</b>\n\n` +
                             `👤 Pengirim: <b>${supporterName}</b>\n` +
                             `💰 Koin Masuk: <b>+${koinDapat.toLocaleString('id-ID')} coin</b>\n` +
                             `💳 Total Bayar: <b>Rp ${price.toLocaleString('id-ID')}</b>\n` +
                             `💵 Saldo Koin Sekarang: <b>${saldoBaru.toLocaleString('id-ID')} coin</b>\n\n` +
                             `Terima kasih sudah mendukung dan melakukan top up di FWL! ✨`;

            await bot.telegram.sendMessage(userId, notifMsg, { parse_mode: 'HTML' });
        } catch (notifErr) {
            console.error(`⚠️ Gagal mengirim pesan notifikasi ke Telegram user ${userId}:`, notifErr.message);
        }

        return res.status(200).json({
            status: true,
            message: 'Top up koin berhasil diproses',
            data: {
                userId,
                koinDapat,
                saldoBaru
            }
        });

    } catch (err) {
        console.error('❌ [Webhook Trakteer Error]:', err);
        return res.status(500).json({ status: false, error: err.message });
    }
};

app.post('/api/webhook/trakteer', handleTrakteerWebhook);
app.post('/webhook/trakteer', handleTrakteerWebhook);

// ==========================================
// FITUR AUTO DELETE MENFESS (24 JAM)
// ==========================================
async function initDatabaseAutoDelete() {
    try {
        const [cols] = await db.execute("SHOW COLUMNS FROM RIWAYAT_MENFESS");
        const fields = cols.map(c => c.Field.toUpperCase());
        
        if (!fields.includes('ID_PESAN_TELEGRAM')) {
            await db.execute('ALTER TABLE RIWAYAT_MENFESS ADD COLUMN ID_PESAN_TELEGRAM BIGINT NULL AFTER TAGAR_YANG_DIPAKAI');
        }
        if (!fields.includes('STATUS_HAPUS')) {
            await db.execute('ALTER TABLE RIWAYAT_MENFESS ADD COLUMN STATUS_HAPUS TINYINT(1) DEFAULT 0 AFTER ID_PESAN_TELEGRAM');
        }
        if (!fields.includes('WAKTU_KEDALUWARSA')) {
            await db.execute('ALTER TABLE RIWAYAT_MENFESS ADD COLUMN WAKTU_KEDALUWARSA DATETIME NULL AFTER STATUS_HAPUS');
        }
    } catch (err) {
        console.error('⚠️ [Init DB Auto-Delete Error]:', err.message);
    }
}

async function bersihkanMenfessKedaluwarsa() {
    try {
        const [pesanKedaluwarsa] = await db.execute(
            `SELECT ID_RIWAYAT, ID_PESAN_TELEGRAM 
             FROM RIWAYAT_MENFESS 
             WHERE STATUS_HAPUS = 0 
               AND ID_PESAN_TELEGRAM IS NOT NULL 
               AND (WAKTU_KEDALUWARSA <= NOW() OR (WAKTU_KEDALUWARSA IS NULL AND WAKTU_TERKIRIM <= NOW() - INTERVAL 24 HOUR))
             LIMIT 50`
        );

        if (pesanKedaluwarsa.length > 0) {
            console.log(`🧹 [Auto-Delete] Memproses ${pesanKedaluwarsa.length} pesan menfess kedaluwarsa...`);
        }

        for (const item of pesanKedaluwarsa) {
            try {
                await bot.telegram.deleteMessage(CHANNEL_ID, item.ID_PESAN_TELEGRAM);
                console.log(`🗑 [Auto-Delete] Berhasil menghapus pesan ID ${item.ID_PESAN_TELEGRAM} dari channel.`);
            } catch (delErr) {
                console.warn(`⚠️ [Auto-Delete] Pesan ID ${item.ID_PESAN_TELEGRAM} dilewati / sudah dihapus (${delErr.message}).`);
            } finally {
                await db.execute(
                    'UPDATE RIWAYAT_MENFESS SET STATUS_HAPUS = 1 WHERE ID_RIWAYAT = ?',
                    [item.ID_RIWAYAT]
                );
            }
        }
    } catch (err) {
        console.error('❌ [Auto-Delete Worker Error]:', err.message);
    }
}

bot.launch().then(() => {
    console.log('🤖 Bot Telegram FWL Berhasil Berjalan!');

    // Inisialisasi dan jalankan scheduler auto-delete 24 jam
    initDatabaseAutoDelete().then(() => {
        bersihkanMenfessKedaluwarsa();
        setInterval(bersihkanMenfessKedaluwarsa, 60 * 1000); // Cek setiap 1 menit
        console.log('⏱️ [Auto-Delete] Scheduler pembersihan 24 jam aktif.');
    });
}).catch((err) => {
    console.error('❌ Gagal menjalankan Bot Telegram:', err.message);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🌐 Express API berjalan di port ${PORT}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));