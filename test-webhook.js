/**
 * test-webhook.js
 * Skrip simulasi pengujian webhook Trakteer ke FWL Menfess Bot.
 * 
 * Penggunaan:
 *   node test-webhook.js               -> Menjalankan kedua skenario pengujian
 *   node test-webhook.js ping          -> Hanya menjalankan Skenario 1 (Stream Test / Ping)
 *   node test-webhook.js real [ID]     -> Menjalankan Skenario 2 (Transaksi Nyata dengan ID Telegram tertentu)
 * 
 * Contoh:
 *   node test-webhook.js real 123456789
 */

require('dotenv').config();

const BASE_URL = process.env.WEBHOOK_TARGET_URL || `http://localhost:${process.env.PORT || 3000}/api/webhook/trakteer`;
const WEBHOOK_KEY = process.env.TRAKTEER_WEBHOOK_KEY || 'trhook-Oe6SZikK0BVPLj9QTPaPrLFV';

// Helper fungsi kirim payload
async function sendWebhook(scenarioName, payload) {
    console.log(`\n======================================================`);
    console.log(`🚀 [UJI] Menjalankan: ${scenarioName}`);
    console.log(`🎯 Target URL: ${BASE_URL}`);
    console.log(`🔑 Webhook Key: ${WEBHOOK_KEY}`);
    console.log(`📦 Payload Dikirim:`, JSON.stringify(payload, null, 2));

    try {
        const response = await fetch(BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-trakteer-key': WEBHOOK_KEY
            },
            body: JSON.stringify(payload)
        });

        const status = response.status;
        const text = await response.text();
        let json;
        try {
            json = JSON.parse(text);
        } catch {
            json = text;
        }

        console.log(`\n📬 Response Status: ${status} ${response.statusText}`);
        console.log(`📥 Response Body:`, JSON.stringify(json, null, 2));

        if (response.ok) {
            console.log(`✅ [BERHASIL] Skenario "${scenarioName}" sukses direspons oleh server!`);
        } else {
            console.log(`⚠️ [GAGAL] Server mengembalikan status error: ${status}`);
        }
        return { status, data: json };
    } catch (err) {
        console.error(`❌ [ERROR KONEKSI] Tidak dapat terhubung ke server (${BASE_URL}):`, err.message);
        console.error(`💡 Pastikan server Express (node server.js) sedang aktif dan port sesuai.`);
        return { error: err.message };
    }
}

// Skenario 1: Stream Test / Ping (Mirip tombol 'Test Webhook' di dashboard Trakteer)
async function testPing() {
    const payloadPing = {
        transaction_id: `test-${Date.now()}`,
        supporter_name: '[ Stream Test ]',
        supporter_message: 'Ini adalah pesan pengujian webhook dari Trakteer',
        supporter_avatar: 'https://trakteer.id/images/default-avatar.png',
        quantity: 1,
        price: 1000,
        unit: 'Unit',
        unit_name: 'Cendol',
        created_at: new Date().toISOString()
    };

    return await sendWebhook('1. Stream Test / Ping Webhook Dashboard', payloadPing);
}

// Skenario 2: Transaksi Nyata (Top up Rp 10.000 dengan format "fwl <USER_ID>")
async function testRealTransaction(telegramId) {
    const targetUserId = telegramId || (process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',')[0].trim() : '123456789');

    const payloadReal = {
        transaction_id: `tr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        supporter_name: 'Tester Donatur FWL',
        supporter_message: `fwl ${targetUserId}`,
        supporter_avatar: 'https://trakteer.id/images/default-avatar.png',
        quantity: 10,
        price: 10000,
        unit: 'Unit',
        unit_name: 'Kopi',
        created_at: new Date().toISOString()
    };

    return await sendWebhook(`2. Transaksi Nyata (+1.000 Koin untuk ID Telegram: ${targetUserId})`, payloadReal);
}

// Main Runner
async function main() {
    const args = process.argv.slice(2);
    const command = args[0] ? args[0].toLowerCase() : 'all';

    console.log('======================================================');
    console.log('🤖 FWL Bot - Trakteer Webhook Simulation Tester');
    console.log('======================================================');

    if (command === 'ping') {
        await testPing();
    } else if (command === 'real') {
        const customId = args[1];
        await testRealTransaction(customId);
    } else {
        console.log('Mode: Menjalankan semua skenario pengujian...');
        await testPing();
        console.log('\nJeda 1 detik sebelum skenario berikutnya...\n');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await testRealTransaction(args[1]);
    }

    console.log('\n======================================================');
    console.log('🏁 Pengujian Selesai.');
    console.log('======================================================\n');
}

main();
