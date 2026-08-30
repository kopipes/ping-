# PRD: PVC — Internal Company Chat App
**Versi:** 1.0
**Tanggal:** 29 Agustus 2026
**Status:** Draft untuk Development (Vibe Coding Ready)

---

## 1. Ringkasan Produk

### 1.1 Latar Belakang
Perusahaan membutuhkan platform komunikasi internal — diberi nama **PVC** — yang terorganisir per divisi/proyek, bukan seperti WhatsApp Group yang mencampur semua topik pembicaraan dalam satu aliran chat sehingga sulit mencari informasi lama (link, keputusan, file).

### 1.2 Tujuan Produk
1. Memisahkan percakapan berdasarkan divisi/topik/proyek agar tidak tercampur.
2. Memudahkan pencarian kembali informasi (pesan, link, file, catatan) tanpa perlu scroll manual.
3. Menyediakan ruang informasi umum (general notice) yang bisa diakses semua karyawan.
4. Mendukung komunikasi personal (1-on-1) antar karyawan.
5. Pengalaman pengguna setara aplikasi native meski berbasis web (PWA).
6. Ringan di server (VPS 4vCPU/4GB RAM) namun tetap real-time dan scalable ke depannya.

### 1.2b ⭐ Prinsip Desain Utama: Discoverability (Mudah Ditemukan)

> Ini adalah **prinsip tertinggi** yang harus dipegang di setiap keputusan desain & development — lebih diutamakan daripada menambah fitur baru. Percuma punya fitur canggih (thread, pinned, library) kalau user bingung/lambat menemukannya. Setiap fitur baru wajib diuji dengan pertanyaan: *"Apakah ini membuat user lebih cepat menemukan project/chat yang mereka cari, atau malah menambah langkah?"*

Tiga elemen kunci yang harus selalu terpenuhi:

1. **Mudah menemukan Project/Topic yang dicari** — bukan sekadar scroll sidebar. User bisa: (a) cari topic langsung by nama via search bar di atas sidebar, (b) topic dikelompokkan jelas per divisi dengan label yang gamblang, (c) topic yang paling relevan (ada unread/aktivitas baru) tampil menonjol/di atas, bukan tersembunyi di antara topic lain.
2. **Mudah menemukan chat/pesan yang relevan** — Search bukan sekadar cari kata kunci polos, tapi hasil pencarian harus informatif: menunjukkan konteks lengkap (di topic mana, kapan, dari siapa) sehingga user langsung yakin itu pesan yang dicari sebelum klik. Dukung filter tambahan (by pengirim, by tanggal, by tipe: pesan/file/link) di Fase 2 agar pencarian makin presisi saat riwayat chat sudah banyak.
3. **Zero-learning-curve saat pertama buka app** — begitu login pertama kali, user harus langsung paham ke mana harus pergi tanpa training/manual. Ini dicapai lewat: label menu yang jelas (bukan istilah teknis/ambigu), empty state yang mengarahkan ("Belum ada topic, hubungi admin untuk ditambahkan" — bukan layar kosong membingungkan), dan struktur navigasi yang konsisten dengan pola aplikasi chat yang sudah familiar bagi kebanyakan orang (mirip WhatsApp/Telegram/Slack) sehingga tidak terasa asing.

**Implikasi konkret ke fitur (lihat detail masing-masing di Section 4):**
- Search (FR-9.x) adalah fitur **wajib fase awal**, bukan nice-to-have — karena inilah jalan pintas utama saat sidebar sudah penuh topic/proyek.
- Sidebar (Section 8) wajib punya search bar/quick-filter di bagian paling atas, selalu terlihat tanpa perlu scroll atau klik menu tambahan.
- Setiap hasil pencarian & setiap item Library wajib bisa "jump to message" — user tidak boleh menemukan info lalu bingung ke mana konteksnya.

### 1.3 Target Pengguna
- Seluruh karyawan internal perusahaan (semua divisi).
- Admin/IT sebagai pengelola workspace, user, dan permission.

### 1.4 Platform
- **Web App (PWA — Progressive Web App)**: dapat diakses via browser desktop & mobile, dapat di-"install" ke homescreen HP layaknya aplikasi native (icon, splash screen, fullscreen, push notification).
- **Tidak ada native app terpisah (Android/iOS)** untuk versi awal — cukup PWA.
- **⚠️ Mobile-First (Prioritas Utama)**: mayoritas pengguna akan mengakses aplikasi ini melalui HP, bukan desktop. Seluruh proses desain dan development **harus dimulai dari perspektif mobile** — layout, ukuran tombol, navigasi, dan flow interaksi dirancang untuk layar kecil terlebih dahulu, baru kemudian disesuaikan/diperluas untuk tampilan desktop. Lihat Section 8.5 untuk panduan detail layout mobile.

---

## 2. Tech Stack (Ditetapkan)

| Layer | Teknologi | Catatan |
|---|---|---|
| Frontend | React + Vite + TypeScript | PWA plugin (`vite-plugin-pwa`) |
| UI Styling | TailwindCSS | Modern light theme, lihat Section 8 |
| State Management | Zustand atau React Query (untuk server state) | Ringan, tidak perlu Redux |
| Backend | Node.js + Fastify (atau Express) + TypeScript | Fastify lebih ringan & cepat dari Express |
| Realtime | Socket.IO | Room per `conversation_id` |
| ORM | Prisma | **Wajib** — memudahkan migrasi SQLite → PostgreSQL/MySQL nanti |
| Database (awal) | SQLite | File-based, cukup untuk MVP |
| Database (scale-up) | PostgreSQL | Tinggal ganti provider di Prisma schema |
| File Storage (awal) | Local disk VPS (`/data/uploads`) | Pindah ke S3/MinIO saat scale |
| Image Processing | `sharp` (server) + `browser-image-compression` (client) | Kompresi sebelum upload + generate thumbnail |
| Reverse Proxy | Caddy | Auto HTTPS, config minimal |
| Process Manager | PM2 | Auto-restart, monitoring |
| Auth | JWT (access + refresh token) | Opsional: SSO Google Workspace di fase lanjutan |

**Alasan pemilihan Prisma:** schema didefinisikan sekali dalam format yang sama untuk SQLite, PostgreSQL, dan MySQL. Migrasi cukup ubah `provider` di `schema.prisma` lalu jalankan `prisma migrate`.

---

## 3. Konsep Data Utama

Sistem menggunakan model **`Conversation`** generik yang merepresentasikan baik **Topic/Group** maupun **Direct Message (DM)** — supaya tidak ada duplikasi logic.

```
Workspace
 └── Conversation (type: TOPIC | DM)
      ├── ConversationMember (siapa saja yang tergabung + role)
      ├── Message (isi chat, bisa punya parent_id untuk thread)
      ├── Attachment (file/gambar terlampir di message)
      └── PinnedItem (message yang di-pin ke area khusus)
```

Struktur navigasi yang dilihat user:

```
[Sidebar]
 ├── 📢 Announcement (read-only, semua bisa lihat)
 ├── 💬 General Chat (semua bisa posting bebas)
 ├── 📁 Topic: IT
 ├── 📁 Topic: Marketing
 ├── 📁 Topic: Finance
 ├── ── Direct Messages ──
 ├── 👤 Budi
 └── 👤 Sari
```

Di dalam setiap Topic/DM ada 3 tab:
```
[Chat]  [📌 Pinned]  [🗂️ Library]
```

---

## 4. Functional Requirements (Detail Fitur)

### 4.1 Autentikasi & User Management
- **FR-1.1**: User login menggunakan email + password (hashed dengan bcrypt/argon2).
- **FR-1.2**: JWT access token (short-lived, 15 menit) + refresh token (long-lived, 7 hari, stored httpOnly cookie).
- **FR-1.3**: Role user (hierarki): `SUPER_ADMIN` → `ADMIN` (Corporate) → `MANAGER` → `STAFF`.
  - `SUPER_ADMIN`: kontrol penuh — kelola semua user, semua topic (level 1 & sub-topic), hapus/archive apapun, atur role user lain.
  - `ADMIN` (Corporate — misal HR/IT/C-level): buat/hapus **Topic Level 1** (divisi utama), posting di General, kelola member lintas divisi.
  - `MANAGER` (kepala divisi/lead proyek): buat/hapus **Sub-topic** di dalam divisinya sendiri, tambah/hapus member di topic yang dia kelola, pin/unpin note.
  - `STAFF`: chat, kirim file, buat Thread (reply), pin note (jika diizinkan), **tidak bisa** membuat Topic/Sub-topic baru.
  - Lihat **Section 4.2b — Permission Matrix** untuk detail lengkap.
- **FR-1.4**: Admin dapat invite user baru (generate link invite / input email manual — tanpa sistem registrasi publik, karena internal).
- **FR-1.4b (Onboarding)**: Saat akun user baru dibuat/aktivasi pertama kali, sistem **otomatis** menambahkan user tersebut sebagai member ke **"📢 Announcement"** dan **"💬 General Chat"** (2 topic yang wajib diikuti semua orang). Untuk Topic divisi/proyek spesifik, user **tidak otomatis masuk** — harus ditambahkan manual oleh Admin/Manager terkait (sesuai divisi/kebutuhan kerja user tersebut), atau di-invite ke topic tertentu setelahnya.
- **FR-1.4c (Offboarding)**: Saat akun user dinonaktifkan (resign/keluar), akses login langsung dicabut, namun **histori pesan yang pernah dikirim tetap tersimpan** di semua Topic/DM (tidak dihapus) untuk kebutuhan audit/kontinuitas kerja tim yang ditinggalkan.
- **FR-1.4d**: Admin dapat melihat daftar Topic/DM apa saja yang diikuti seorang user (untuk memudahkan proses invite ke topic relevan saat onboarding, atau review akses saat audit).
- **FR-1.4e (Bahasa/Bilingual)**: Antarmuka mendukung **Bahasa Indonesia dan Bahasa Inggris**, dapat dipilih user di halaman profil/setting (disimpan sebagai preferensi per user). Semua teks statis UI (label, tombol, notifikasi sistem) disiapkan lewat sistem i18n (misal `i18next`) sejak awal development agar mudah menambah bahasa lain nanti — bukan hardcode teks dalam 1 bahasa.
- **FR-1.5**: User profile: nama, foto avatar, jabatan/divisi, status online/offline/away.
- **FR-1.6 (Fase 2 - opsional)**: SSO login via Google Workspace/Microsoft 365.

### 4.2 Topic / Group (Conversation type: TOPIC)

Topic memiliki 2 level hierarki:
- **Topic Level 1 (Divisi Utama)** — representasi struktur organisasi besar, misal "IT", "Marketing", "Finance". Jarang berubah.
- **Sub-topic (Proyek/Pembahasan Spesifik)** — child dari Topic Level 1, misal "IT > Bug Report", "Marketing > Campaign Q4". Bisa sering dibuat sesuai kebutuhan proyek.

```
📁 IT (Level 1 — dibuat oleh Admin/Corporate)
 ├── 📂 Bug Report (Sub-topic — dibuat oleh Manager IT)
 └── 📂 Infrastructure (Sub-topic — dibuat oleh Manager IT)
```

- **FR-2.1**: Hanya role `ADMIN` (Corporate) ke atas yang dapat membuat **Topic Level 1** (nama, deskripsi, icon/emoji).
- **FR-2.2**: Role `MANAGER` dapat membuat **Sub-topic** di dalam Topic Level 1 tempat dia menjadi member/manager — tanpa perlu approval dari Admin/Corporate.
- **FR-2.3**: `MANAGER` yang membuat sub-topic otomatis menjadi "owner" sub-topic tersebut, dan dapat menambah/menghapus member di dalamnya.
- **FR-2.4**: `ADMIN`/`SUPER_ADMIN` dapat menambah/menghapus member di topic manapun (lintas divisi), termasuk mengubah owner sub-topic bila diperlukan (misal manager resign).
- **FR-2.5**: Topic (level 1 maupun sub-topic) bersifat **private by default** — hanya member yang ditambahkan yang bisa melihat & mengakses.
- **FR-2.6**: Tersedia 2 Topic khusus yang dibuat otomatis saat setup, tidak bisa dihapus, tidak punya sub-topic, dan seluruh user otomatis menjadi member:
  - **"📢 Announcement"**: bersifat **read-only** — hanya `ADMIN`/`SUPER_ADMIN` yang bisa posting pesan baru (member lain hanya bisa membaca & bereaksi emoji, tidak bisa membalas pesan biasa). Digunakan untuk pengumuman resmi, link penting, SOP.
  - **"💬 General Chat"**: bersifat **terbuka** — seluruh role (termasuk `STAFF`) bebas mengirim pesan. Digunakan sebagai ruang obrolan umum lintas divisi (non-formal, non-pekerjaan spesifik).
  - Keduanya selalu tampil di posisi paling atas sidebar (di atas daftar Topic divisi), dengan urutan: Announcement → General Chat → Topic divisi lainnya.
- **FR-2.7**: Topic/Sub-topic dapat di-archive (disembunyikan dari sidebar tapi tidak dihapus datanya) oleh yang berwenang sesuai matrix permission.
- **FR-2.8**: `STAFF` tidak dapat membuat Topic Level 1 maupun Sub-topic — hanya dapat chat, kirim file/gambar, membuat Thread (reply pesan), dan pin note jika diizinkan pada topic tersebut.

### 4.2b Permission Matrix

| Aksi | Super Admin | Admin (Corporate) | Manager | Staff |
|---|:---:|:---:|:---:|:---:|
| Buat Topic Level 1 (Divisi) | ✅ | ✅ | ❌ | ❌ |
| Buat Sub-topic (dalam divisinya) | ✅ | ✅ | ✅ | ❌ |
| Hapus/Archive Topic Level 1 | ✅ | ✅ | ❌ | ❌ |
| Hapus/Archive Sub-topic | ✅ | ✅ | ✅ (miliknya) | ❌ |
| Tambah/Hapus Member — lintas divisi | ✅ | ✅ | ❌ | ❌ |
| Tambah/Hapus Member — sub-topic miliknya | ✅ | ✅ | ✅ | ❌ |
| Posting di "📢 Announcement" | ✅ | ✅ | ❌ | ❌ |
| Posting di "💬 General Chat" | ✅ | ✅ | ✅ | ✅ |
| Chat, kirim file/gambar/link | ✅ | ✅ | ✅ | ✅ |
| Buat Thread (reply) | ✅ | ✅ | ✅ | ✅ |
| Pin/Unpin note | ✅ | ✅ | ✅ | Tergantung setting topic* |
| Kelola role user lain | ✅ | ❌ | ❌ | ❌ |

*\*Setting per-topic: Manager/Admin topic tsb dapat mengatur apakah Staff boleh pin note sendiri atau tidak (default: boleh).*

### 4.3 Thread (Sub-topik dalam Chat)
- **FR-3.1**: User dapat me-reply sebuah pesan untuk membuka thread (percakapan turunan).
- **FR-3.2**: Thread ditampilkan di panel terpisah (side panel) saat diklik, tidak mengganggu flow chat utama.
- **FR-3.3**: Pesan yang punya thread menampilkan indikator jumlah reply (misal "3 replies") di bawah pesan.
- **FR-3.4**: Notifikasi khusus untuk thread yang diikuti user (user yang pernah reply di thread itu).

### 4.4 Direct Message (Conversation type: DM)
- **FR-4.1**: User dapat memulai chat 1-on-1 dengan user lain melalui pencarian nama.
- **FR-4.2**: DM list ditampilkan terpisah dari Topic list di sidebar, diurutkan berdasarkan pesan terakhir.
- **FR-4.3**: Status online/offline/last-seen ditampilkan di header DM.
- **FR-4.4 (Fase lanjutan)**: Group DM (multi-user tanpa harus buat Topic resmi) — reuse struktur `Conversation` dengan member > 2.

### 4.5 Pesan (Message)
- **FR-5.1**: Kirim pesan teks (mendukung format dasar: bold, italic, bullet list, code block — markdown-lite).
- **FR-5.2**: Real-time delivery via WebSocket (Socket.IO), pesan muncul instan tanpa reload.
- **FR-5.3**: Optimistic UI — pesan langsung tampil di layar pengirim dengan status "sending" sebelum konfirmasi server.
- **FR-5.4**: Edit & delete pesan sendiri (dengan label "diedit" jika diubah), dibatasi maksimal **15 menit setelah pesan dikirim** untuk edit maupun delete oleh pengirim biasa (`STAFF`/`MANAGER`) — mencegah penghapusan jejak percakapan terkait pekerjaan/keputusan setelah berselang lama. Setelah lewat batas waktu, pesan hanya bisa dihapus oleh `ADMIN`/`SUPER_ADMIN` (misal untuk kasus pelanggaran/kesalahan serius). Durasi ini dapat dikonfigurasi oleh Super Admin di pengaturan workspace.
- **FR-5.5**: Reaction emoji pada pesan (👍❤️😂 dll — set emoji terbatas untuk kesederhanaan).
- **FR-5.6**: Read receipt sederhana (jumlah/daftar user yang sudah membaca — bisa fase 2 jika ingin lebih ringan).
- **FR-5.7**: Typing indicator ("Budi sedang mengetik...") — fase 2.
- **FR-5.8**: Pagination pesan: load 30-50 pesan terakhir, infinite scroll ke atas untuk memuat riwayat lama.
- **FR-5.9 (Multi-device Sync)**: Status baca (read status), unread count, dan riwayat pesan harus **sinkron real-time antar device** yang login dengan akun sama (misal HP dan laptop dibuka bersamaan) — via broadcast Socket.IO ke semua sesi/socket aktif milik user tersebut, bukan hanya device yang sedang aktif digunakan.

### 4.6 Upload File, Gambar & Link
- **FR-6.1**: Upload gambar dikompresi di sisi **client** sebelum dikirim (target maks ~500KB-1MB per gambar, resize jika resolusi terlalu besar) menggunakan `browser-image-compression`.
- **FR-6.2**: Server generate **thumbnail** otomatis (misal 300px) menggunakan `sharp`, gambar original tetap disimpan.
- **FR-6.3**: Upload file umum (PDF, Docx, Xlsx, Zip, dll) dengan batas ukuran maksimal **25MB per file** (dapat dikonfigurasi).
- **FR-6.4**: Progress bar upload + status pesan ("uploading...", "failed - retry").
- **FR-6.5**: Kirim link URL — sistem otomatis fetch **Open Graph metadata** (title, deskripsi, thumbnail) untuk menampilkan link preview card.
- **FR-6.6**: Preview gambar/file langsung di chat (klik untuk lightbox/fullscreen viewer, bukan download langsung).

### 4.7 Pinned Notes
- **FR-7.1**: User dengan role tertentu (default: siapa saja, dapat dikonfigurasi per Topic apakah "semua member" atau "admin only") dapat **pin** sebuah pesan ke tab "📌 Pinned".
- **FR-7.2**: Tab Pinned menampilkan daftar pesan yang di-pin, diurutkan dari terbaru, dengan info siapa yang pin dan kapan.
- **FR-7.3**: Pinned item dapat diberi label/catatan tambahan singkat saat di-pin (misal: "Link SOP Approval Budget").
- **FR-7.4**: Un-pin dapat dilakukan oleh yang pin atau admin.

### 4.8 Library (Galeri File & Gambar per Conversation)
- **FR-8.1**: Setiap Topic/DM memiliki tab "🗂️ Library" yang otomatis mengumpulkan seluruh attachment (gambar, file, link) yang pernah dikirim di conversation tersebut — tidak perlu aksi manual dari user.
- **FR-8.2**: Filter tampilan Library berdasarkan tipe: Semua / Gambar / Dokumen / Link.
- **FR-8.3**: Tampilan grid untuk gambar (thumbnail), list untuk dokumen & link.
- **FR-8.4**: Klik item di Library langsung meng-scroll ke pesan asal di chat ("jump to message").

### 4.9 Search — **Fitur Kritis (Wajib Fase 1, bukan Fase 2)**
- **FR-9.0**: Search bar/quick-filter selalu tampil di posisi paling atas sidebar (di atas daftar Topic), agar user bisa langsung mengetik nama project/topic yang dicari tanpa perlu scroll atau membuka menu tambahan. Hasil filter muncul instan saat mengetik (bukan setelah tekan Enter).
- **FR-9.1**: Search dalam 1 Topic/DM (pencarian teks pesan, nama file).
- **FR-9.2**: **General Search (Global)** — satu kolom pencarian yang menjangkau **seluruh isi conversation yang bisa diakses user** (semua Topic, Sub-topic, dan DM miliknya), mencakup semua jenis konten sekaligus: teks pesan, nama file/dokumen, dan link yang pernah dikirim — bukan cuma teks pesan saja. Ini jalan pintas utama saat user ingat "pernah ada obrolan/link soal X" tapi lupa di topic mana persisnya.
- **FR-9.2b**: Hasil General Search dikelompokkan per kategori (tab/section): **Pesan**, **File**, **Link** — agar user bisa langsung fokus ke jenis konten yang dicari, bukan scroll campur aduk semua tipe hasil.
- **FR-9.2c**: General Search dapat diakses dari mana saja dalam app (misal via ikon search di header/bottom nav), tidak perlu masuk ke Topic tertentu dulu.
- **FR-9.3**: Hasil pencarian menampilkan cuplikan pesan + **nama conversation + tanggal + nama pengirim** (konteks lengkap, bukan cuma cuplikan teks polos), klik untuk langsung jump ke pesan tersebut di lokasi aslinya.
- **FR-9.4** (Fase 2): Filter search lanjutan: by sender, by tanggal, by tipe (pesan/file/link) — untuk mempercepat pencarian saat riwayat chat sudah banyak.

### 4.10 Notifikasi
- **FR-10.1**: Push notification via **Web Push API** (`web-push` library di backend + Service Worker di frontend) untuk pesan baru di DM, mention, atau Topic yang tidak di-mute — notifikasi harus tetap masuk meski aplikasi dalam kondisi **tertutup/background**, tidak hanya saat dibuka.
- **FR-10.2**: Badge unread count di sidebar per Topic/DM, serta badge total di icon app (jika platform mendukung, misal via Badging API).
- **FR-10.3**: User dapat mute notifikasi per Topic/DM tertentu, dengan pilihan level: **All** (semua pesan), **Mentions only** (hanya saat di-mention), atau **None** (senyap total, badge unread tetap jalan).
- **FR-10.4**: Mention (`@nama` atau `@all` khusus Admin di General Chat) memicu notifikasi prioritas meski topic sedang di-mute level "Mentions only".
- **FR-10.5**: Klik notifikasi langsung membuka (deep link) ke pesan/topic yang relevan, bukan ke halaman utama app.
- **FR-10.6**: Notifikasi dari Topic **"📢 Announcement"** bersifat wajib (tidak bisa di-mute oleh user manapun) karena isinya pengumuman resmi perusahaan.
- **FR-10.7 (Scope Fase 1 — Android/Desktop dulu)**: Push Notification di **iOS Safari baru didukung sejak iOS 16.4+** dan **hanya berfungsi setelah "Add to Home Screen"** (tidak jalan dari tab browser biasa) — jauh lebih terbatas dibanding Android/Chrome yang mendukung penuh dari awal. Berdasarkan keputusan produk, **dukungan penuh untuk iOS ditunda ke fase lanjutan (lihat Section 10 — Fase 4)**. Fase 1-3 fokus memastikan Push Notification bekerja optimal di **Android & Desktop (Chrome/Edge)** terlebih dahulu.
- **FR-10.7b**: Untuk user iOS di Fase 1-3, sediakan *fallback* in-app notification (badge unread + banner saat app dibuka) agar tetap dapat menggunakan chat secara fungsional, meski tanpa push notification real-time saat app tertutup.
- **FR-10.8**: Saat pertama kali membuka app, tampilkan prompt izin notifikasi dengan konteks yang jelas (bukan langsung popup browser default) — misal modal singkat menjelaskan manfaatnya sebelum trigger permission request asli, untuk meningkatkan opt-in rate.

### 4.11 PWA & Pengalaman "Native-like"
- **FR-11.1**: App dapat di-install ke homescreen (manifest.json + service worker).
- **FR-11.2**: Splash screen custom saat app dibuka dari homescreen.
- **FR-11.3**: Offline-first: pesan terakhir yang sudah dimuat tetap bisa dilihat tanpa koneksi internet (cache via IndexedDB/service worker).
- **FR-11.4**: Transisi halaman & interaksi tanpa reload penuh (SPA behavior).
- **FR-11.5**: Gesture mobile-friendly: swipe untuk buka sidebar, pull-to-refresh (opsional).

### 4.12 Data Retention & Archiving (Dikontrol Admin)
- **FR-12.1**: `SUPER_ADMIN` dapat mengatur kebijakan retensi data secara global melalui pengaturan workspace, dengan opsi:
  - **Simpan selamanya** (default) — tidak ada penghapusan otomatis.
  - **Auto-archive** pesan/percakapan yang lebih tua dari periode tertentu (misal 6 bulan, dapat dikustomisasi dalam bulan) — pesan lama di-compress/zip dan dipindah ke *cold storage* (folder arsip terpisah di disk, atau nantinya object storage), sehingga tidak lagi membebani database aktif namun tetap bisa di-restore/diunduh oleh Admin bila diperlukan.
- **FR-12.2**: Proses auto-archive berjalan sebagai scheduled job (cron) di background, tidak mengganggu performa chat real-time saat berjalan.
- **FR-12.3**: Percakapan yang sudah diarsipkan tetap muncul di hasil Search dengan indikator "📦 Diarsipkan", dan Admin dapat me-restore-nya kembali ke status aktif bila dibutuhkan.
- **FR-12.4**: Admin dapat melihat perkiraan ukuran data yang akan diarsipkan sebelum menjalankan proses (preview), untuk menghindari kejutan penggunaan disk.

### 4.13 Audit Log
- **FR-13.1**: Sistem mencatat log aktivitas administratif penting: pembuatan/penghapusan/archive Topic atau Sub-topic, penambahan/penghapusan member dari suatu Topic, perubahan role user, penghapusan pesan oleh Admin (di luar hak hapus pesan sendiri oleh user biasa).
- **FR-13.2**: Log mencatat: siapa (`userId`), aksi apa, target apa (topic/user/pesan mana), dan kapan (`timestamp`).
- **FR-13.3**: Audit log hanya dapat diakses oleh `ADMIN`/`SUPER_ADMIN` melalui Admin Dashboard (lihat Section 4.14), untuk keperluan governance internal — bukan konsumsi user biasa.

### 4.14 Admin Dashboard
- **FR-14.1**: Admin Dashboard (akses `ADMIN`/`SUPER_ADMIN`) menampilkan **statistik penggunaan chat**, minimal:
  - Total pesan terkirim (harian/mingguan/bulanan, dapat divisualisasikan sebagai grafik tren).
  - Topic/Sub-topic paling aktif (berdasarkan jumlah pesan).
  - Jumlah user aktif (login dalam 7/30 hari terakhir).
  - Distribusi tipe attachment yang dikirim (gambar vs file vs link).
- **FR-14.2**: Dashboard menampilkan **penggunaan storage/disk**:
  - Total ruang disk terpakai saat ini vs kapasitas VPS.
  - Breakdown penggunaan storage per Topic/Sub-topic (untuk mengetahui topic mana yang paling "berat" filenya).
  - Estimasi ruang yang akan dihemat jika menjalankan auto-archive (terhubung dengan FR-12.4).
- **FR-14.3**: Dashboard menyediakan panel kelola: User (aktivasi/nonaktifkan akun, ubah role), Topic (lihat semua topic + member, archive/hapus), dan akses ke Audit Log (FR-13.x).
- **FR-14.4**: Statistik dan data storage di-refresh berkala (misal setiap beberapa menit via cache, bukan query real-time setiap saat) agar tidak membebani server, sesuai prinsip "ringan di server" pada spek VPS 4vCPU/4GB RAM.

---

## 5. Non-Functional Requirements

| Kategori | Requirement |
|---|---|
| Performance | First load < 2 detik di koneksi 4G; pesan realtime delay < 300ms |
| Skalabilitas | Mendukung minimal 100-300 user aktif bersamaan di spek VPS 4vCPU/4GB RAM |
| Keamanan | HTTPS wajib (WSS untuk WebSocket), password di-hash, rate limiting API, validasi file upload (tipe & ukuran) |
| Reliabilitas | Auto-restart via PM2 jika crash; backup database harian (cron job) |
| Maintainability | Kode modular, ORM untuk abstraksi database, environment variable untuk konfigurasi |
| Migrasi | Schema Prisma harus kompatibel SQLite → PostgreSQL tanpa perubahan struktur besar |
| Aksesibilitas | Kontras warna cukup (WCAG AA minimum), ukuran font readable di mobile |

---

## 6. Skema Database (Prisma-ready)

```prisma
enum Role {
  SUPER_ADMIN
  ADMIN     // Corporate: HR/IT/C-level — buat Topic Level 1
  MANAGER   // Kepala divisi/lead proyek — buat Sub-topic
  STAFF     // User biasa — chat, thread, tidak bisa buat topic
}

enum ConversationType {
  TOPIC
  DM
}

enum AttachmentType {
  IMAGE
  FILE
  LINK
}

model User {
  id            String   @id @default(cuid())
  name          String
  email         String   @unique
  passwordHash  String
  avatarUrl     String?
  division      String?
  role          Role     @default(MEMBER)
  status        String   @default("offline") // online, offline, away
  lastSeenAt    DateTime?
  createdAt     DateTime @default(now())

  memberships   ConversationMember[]
  messages      Message[]
  pinnedItems   PinnedItem[]
}

model Conversation {
  id           String            @id @default(cuid())
  type         ConversationType
  name         String?           // null untuk DM
  description  String?
  icon         String?           // emoji atau url icon
  parentId     String?           // null = Topic Level 1 (divisi); diisi = Sub-topic
  ownerId      String?           // userId Manager pemilik sub-topic (untuk kelola member)
  allowStaffPin Boolean          @default(true) // setting: staff boleh pin note?
  isArchived   Boolean           @default(false)
  isPinnedTop  Boolean          @default(false) // true utk Announcement & General Chat (selalu di atas sidebar)
  isReadOnly   Boolean          @default(false) // true khusus utk Announcement (staff/manager tidak bisa posting)
  createdAt    DateTime          @default(now())

  parent       Conversation?     @relation("SubTopics", fields: [parentId], references: [id])
  subTopics    Conversation[]    @relation("SubTopics")
  owner        User?             @relation(fields: [ownerId], references: [id])
  members      ConversationMember[]
  messages     Message[]
  pinnedItems  PinnedItem[]
}

model ConversationMember {
  id             String       @id @default(cuid())
  conversationId String
  userId         String
  role           Role         @default(MEMBER) // role spesifik di conversation ini
  isMuted        Boolean      @default(false)
  joinedAt       DateTime     @default(now())

  conversation   Conversation @relation(fields: [conversationId], references: [id])
  user           User         @relation(fields: [userId], references: [id])

  @@unique([conversationId, userId])
}

model Message {
  id             String       @id @default(cuid())
  conversationId String
  userId         String
  parentId       String?      // untuk thread (reply ke message lain)
  content        String?
  isEdited       Boolean      @default(false)
  isDeleted      Boolean      @default(false)
  isArchived     Boolean      @default(false) // true jika sudah di-auto-archive (FR-12.x)
  createdAt      DateTime     @default(now())

  conversation   Conversation @relation(fields: [conversationId], references: [id])
  user           User         @relation(fields: [userId], references: [id])
  parent         Message?     @relation("ThreadReplies", fields: [parentId], references: [id])
  replies        Message[]    @relation("ThreadReplies")
  attachments    Attachment[]
  pinnedAs       PinnedItem[]
  reactions      Reaction[]
}

model Attachment {
  id            String         @id @default(cuid())
  messageId     String
  type          AttachmentType
  fileUrl       String
  thumbnailUrl  String?
  fileName      String?
  fileSize      Int?
  linkMetadata  Json?          // { title, description, image } untuk OG preview
  createdAt     DateTime       @default(now())

  message       Message        @relation(fields: [messageId], references: [id])
}

model PinnedItem {
  id             String       @id @default(cuid())
  conversationId String
  messageId      String
  pinnedById     String
  note           String?
  pinnedAt       DateTime     @default(now())

  conversation   Conversation @relation(fields: [conversationId], references: [id])
  message        Message      @relation(fields: [messageId], references: [id])
  pinnedBy       User         @relation(fields: [pinnedById], references: [id])
}

model Reaction {
  id        String   @id @default(cuid())
  messageId String
  userId    String
  emoji     String
  createdAt DateTime @default(now())

  message   Message  @relation(fields: [messageId], references: [id])

  @@unique([messageId, userId, emoji])
}

model AuditLog {
  id        String   @id @default(cuid())
  userId    String   // siapa yang melakukan aksi
  action    String   // misal: "TOPIC_CREATE", "MEMBER_REMOVE", "ROLE_CHANGE", "MESSAGE_DELETE_BY_ADMIN"
  targetId  String?  // id target (topicId/userId/messageId terkait)
  metadata  Json?    // detail tambahan, misal { oldRole, newRole }
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id])
}
```

---

## 7. API Endpoints (REST + WebSocket Events)

### 7.1 REST API

| Method | Endpoint | Deskripsi |
|---|---|---|
| POST | `/api/auth/login` | Login, return access + refresh token |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | Logout, invalidate refresh token |
| GET | `/api/users/me` | Get profile user login |
| GET | `/api/users` | List semua user (untuk mulai DM) |
| GET | `/api/conversations` | List Topic + DM milik user |
| POST | `/api/conversations` | Buat Topic baru (admin) |
| GET | `/api/conversations/:id/messages?cursor=` | Get pesan (pagination) |
| POST | `/api/conversations/:id/messages` | Kirim pesan baru |
| PATCH | `/api/messages/:id` | Edit pesan |
| DELETE | `/api/messages/:id` | Hapus pesan |
| POST | `/api/messages/:id/pin` | Pin pesan |
| DELETE | `/api/messages/:id/pin` | Unpin pesan |
| GET | `/api/conversations/:id/pinned` | List pinned items |
| GET | `/api/conversations/:id/library?type=` | List attachment (library) |
| POST | `/api/upload` | Upload file/gambar (multipart) |
| GET | `/api/search?q=&scope=&type=&conversationId=` | General Search — `scope`: `global`/`conversation`; `type` (opsional): `message`/`file`/`link` untuk filter kategori hasil; `conversationId` wajib diisi jika `scope=conversation` |
| GET | `/api/admin/dashboard/stats` | Statistik chat (total pesan, topic teraktif, user aktif) — akses Admin/Super Admin |
| GET | `/api/admin/dashboard/storage` | Penggunaan storage/disk total & per-topic — akses Admin/Super Admin |
| GET | `/api/admin/audit-log?page=` | List audit log (paginated) — akses Admin/Super Admin |
| GET | `/api/admin/retention-settings` | Get kebijakan retensi data saat ini |
| PATCH | `/api/admin/retention-settings` | Update kebijakan retensi (selamanya / auto-archive N bulan) — akses Super Admin |
| POST | `/api/admin/retention/preview` | Preview estimasi ukuran data yang akan diarsipkan sebelum dijalankan |
| POST | `/api/admin/retention/run-archive` | Trigger manual proses archive (selain berjalan otomatis via cron) |
| GET | `/api/conversations/:id/archived-messages?cursor=` | Get pesan yang sudah diarsipkan dalam suatu conversation (untuk restore/lihat) |

### 7.2 WebSocket Events (Socket.IO)

| Event | Arah | Payload |
|---|---|---|
| `message:send` | Client → Server | `{ conversationId, content, attachments, parentId }` |
| `message:new` | Server → Client (broadcast room) | `{ message }` |
| `message:edit` | Client → Server | `{ messageId, content }` |
| `message:delete` | Client → Server | `{ messageId }` |
| `typing:start` / `typing:stop` | Client → Server → broadcast | `{ conversationId, userId }` |
| `presence:update` | Server → Client | `{ userId, status }` |
| `reaction:add` / `reaction:remove` | Client ↔ Server | `{ messageId, emoji }` |

---

## 8. UI/UX Design Guideline — Modern Light Professional Theme

### 8.1 Prinsip Desain
- **Clean, minim clutter, professional** — bukan playful/casual seperti Discord, lebih ke arah **Slack/Linear/Notion style**.
- Banyak whitespace, elemen tidak berdesakan.
- Konsisten menggunakan sistem spacing (kelipatan 4px: 4, 8, 12, 16, 24, 32).
- Sudut membulat halus (rounded-lg / rounded-xl), tidak tajam, tidak juga terlalu bulat (hindari kesan "kekanak-kanakan").

### 8.2 Palet Warna

```
Background utama    : #FFFFFF
Background sidebar   : #F7F8FA
Background hover     : #EEF0F3
Border/divider       : #E5E7EB

Primary (aksen utama): #2563EB (biru — untuk tombol, link, active state)
Primary hover        : #1D4ED8

Text primary         : #111827
Text secondary       : #6B7280
Text muted           : #9CA3AF

Success              : #16A34A
Warning              : #D97706
Danger               : #DC2626

Unread badge         : #EF4444
Online indicator     : #22C55E
```

### 8.3 Tipografi
- Font: **Inter** atau **Plus Jakarta Sans** (Google Fonts, terkesan modern & profesional).
- Heading: 600-700 weight.
- Body text: 400-500 weight, ukuran 14-15px untuk chat, 13px untuk metadata/timestamp.
- Line-height nyaman dibaca: 1.5 untuk body text.

### 8.4 Layout Utama (Desktop)

```
┌───────────┬──────────────────────────────┬─────────────┐
│  Sidebar   │        Chat Area              │  Detail     │
│  (~280px)  │                                │  Panel      │
│            │  [Header: nama topic + tab]    │  (opsional, │
│  Workspace │  ────────────────────────────  │  utk thread │
│  logo      │                                │  atau       │
│            │  [Chat bubble stream]          │  library    │
│  📢Announ..│                                │  detail)    │
│  💬General │                                │             │
│  📁 Topic..│                                │  (~320px)   │
│  ──DM──    │                                │             │
│  👤 user.. │  [Input box + attach + emoji]  │             │
└───────────┴──────────────────────────────┴─────────────┘
```

### 8.5 Layout Mobile (PWA) — **Prioritas Utama Desain**

> **Catatan penting:** karena mayoritas pengguna mengakses lewat mobile, desain harus dikerjakan **mobile-first** — rancang & uji tampilan mobile terlebih dahulu, baru sesuaikan/lebarkan untuk desktop. Bukan sebaliknya (desktop-first lalu di-"ciutkan").

- **Navigasi layar penuh (bukan kolom sempit)**: Sidebar (list Topic/DM) dan Chat Area adalah 2 layar terpisah, bukan ditampilkan berdampingan. User tap salah satu Topic/DM → transisi slide dari kanan ke layar Chat penuh, dengan tombol back (`<`) di kiri atas header untuk kembali ke list.
- **Tab Chat/Pinned/Library**: horizontal tab full-width, sticky tepat di bawah header topic, mudah dijangkau ibu jari.
- **Bottom navigation bar** (sticky di bawah layar): 3-4 menu utama — `Chats` (list Topic), `Direct Messages`, `Search`, `Profil/Notifikasi`. Pola ini familiar bagi user HP (mirip WhatsApp/Telegram) sehingga tidak perlu belajar navigasi baru.
- **Touch target minimum 44x44px** untuk semua tombol, icon interaktif, dan area tap (standar Apple HIG & Material Design) — hindari tombol kecil ala desktop yang sulit ditekan jari.
- **Tombol attach/upload lebih menonjol**: karena kirim gambar/file dari HP adalah aksi utama, ikon attach & kamera ditempatkan jelas di sebelah kolom input, bukan disembunyikan di menu.
- **Ukuran font & spacing sedikit lebih besar** dibanding versi desktop (body text 14-15px, bukan 13px) untuk kenyamanan baca di layar kecil.
- **PWA install prompt** ditampilkan jelas (banner "Tambahkan ke Layar Utama") pada kunjungan pertama/kedua — ini pintu masuk utama menuju pengalaman "native-like" bagi mayoritas pengguna mobile.
- **Gesture mobile-friendly**: swipe kanan dari tepi layar untuk kembali (back gesture), pull-to-refresh untuk memuat pesan terbaru (opsional).
- **Keyboard-aware input**: kolom input pesan harus otomatis naik mengikuti keyboard HP (tidak tertutup keyboard), dan area chat auto-scroll ke pesan terbaru saat keyboard muncul.
- **Testing wajib**: setiap fitur baru harus diuji dulu di viewport mobile (~375-414px width) sebelum dianggap selesai, bukan hanya diuji di desktop.

### 8.6 Komponen Kunci
- **Chat bubble**: sender lain rata kiri dengan avatar kecil, sender sendiri rata kanan warna primary muda (`#EFF6FF`) dengan teks warna primary.
- **Sidebar item aktif**: background `#EEF0F3` + border-left aksen primary 3px.
- **Unread badge**: pill merah kecil dengan jumlah unread, di kanan nama Topic/DM.
- **Pinned tab**: card dengan border kiri warna kuning/amber tipis untuk membedakan dari chat biasa.
- **Library grid**: gambar dalam grid 3-4 kolom (mobile: 2 kolom), file dalam list dengan icon sesuai tipe file.
- **Link preview card**: border tipis, thumbnail di kiri, title bold + deskripsi 2 baris + domain kecil di bawah.
- **Upload progress**: bubble pesan dengan progress bar tipis di bawah preview gambar/file, opacity 70% saat masih uploading.

### 8.7 Micro-interaction
- Transisi hover/klik halus (150-200ms ease).
- Pesan baru muncul dengan fade-in + slide-up halus (bukan langsung "pop").
- Skeleton loading (bukan spinner) saat memuat riwayat chat — kesan lebih modern & cepat.

---

## 9. User Flow Utama

### 9.1 Flow: Kirim Pesan dengan Gambar
1. User klik icon attach → pilih gambar dari galeri/file.
2. Client compress gambar (`browser-image-compression`) → tampilkan preview + progress upload.
3. Pesan muncul optimistic di chat dengan status "uploading".
4. Setelah server selesai proses (generate thumbnail via `sharp`), status berubah jadi "sent", broadcast ke seluruh member via Socket.IO.

### 9.2 Flow: Cari Info Lama
1. User buka Topic → klik tab "📌 Pinned" → temukan link/note relevan tanpa scroll.
2. Jika tidak ada di Pinned → gunakan Search (icon kaca pembesar) → ketik keyword → klik hasil → otomatis jump ke pesan asli di chat.

### 9.3 Flow: Melihat Semua File di Suatu Topic
1. User buka Topic → klik tab "🗂️ Library" → filter by "Gambar"/"Dokumen"/"Link" → klik salah satu untuk lihat detail atau jump ke chat asal.

---

## 10. Roadmap Pengembangan (Fase MVP)

### Fase 1 — Core (Wajib untuk Launch)
- Auth (login/logout, JWT)
- Topic (CRUD dasar oleh Admin/Manager sesuai permission) + Announcement & General Chat otomatis
- Direct Message 1-on-1
- Kirim/terima pesan realtime (Socket.IO)
- Upload gambar (kompresi + thumbnail) & file dasar
- **Search bar di sidebar (filter topic/DM by nama) + Search dasar dalam 1 conversation (FR-9.0, 9.1)** — prinsip *discoverability* wajib ada sejak awal, bukan ditunda
- Onboarding otomatis ke Announcement & General Chat (FR-1.4b) + invite manual ke topic divisi
- Multi-device sync dasar (status baca & pesan real-time antar device, FR-5.9)
- PWA installable (manifest + service worker dasar)
- UI sesuai design guideline (light theme, responsive, mobile-first), mendukung Bahasa Indonesia & Inggris (FR-1.4e)

### Fase 2 — Organisasi & Pencarian Lanjutan
- Thread (reply ke pesan)
- Pinned Notes per Topic/DM
- Library tab (gambar/file/link)
- Search global lintas Topic/DM (FR-9.2, 9.3) + filter lanjutan by sender/tanggal/tipe (FR-9.4)
- Link preview (OG metadata)
- Unread badge & notifikasi dasar (in-app)
- Batasan waktu edit/delete pesan (FR-5.4)

### Fase 3 — Polish & Skalabilitas
- Push notification (Web Push API) — **fokus Android & Desktop (Chrome/Edge)**
- Typing indicator & read receipt
- Reaction emoji
- Online/offline/last-seen status
- Migrasi persiapan ke PostgreSQL (jika user tumbuh)
- **Admin Dashboard**: statistik chat, monitoring storage/disk, kelola user & topic (FR-14.x)
- **Audit Log** (FR-13.x)
- **Data Retention & Auto-archive** (FR-12.x) — kebijakan diatur Super Admin, termasuk fitur zip/archive pesan lebih tua dari periode tertentu


### Fase 4 — Dukungan Penuh iOS (Next Stage)
- Push Notification penuh untuk iOS Safari (16.4+), termasuk edukasi/prompt ke user iOS untuk melakukan "Add to Home Screen" agar notifikasi aktif.
- Uji & perbaikan quirk PWA khusus iOS (perilaku splash screen, icon, service worker cache yang berbeda dari Android/Chrome).
- Evaluasi kebutuhan tambahan lain yang spesifik platform iOS jika muncul selama Fase 1-3 berjalan.

---

## 11. Batasan & Asumsi (Constraints)

- Server: VPS 4vCPU/4GB RAM, single instance (belum multi-server/load balancer di Fase 1-2).
- Database awal SQLite — write concurrency terbatas, cukup untuk skala internal perusahaan menengah (~ratusan user). Migrasi ke PostgreSQL jika mulai terjadi lock/timeout pada penulisan data.
- File storage awal di local disk VPS — perlu monitoring kapasitas disk, migrasi ke object storage (S3/MinIO) saat volume file besar.
- Tidak ada native mobile app (Android/iOS) di versi awal — cukup PWA.
- Tidak mendukung video/voice call di versi awal (bisa dipertimbangkan integrasi pihak ketiga di fase jauh berikutnya jika dibutuhkan).
- **Push notification di Fase 1-3 difokuskan untuk Android & Desktop.** Dukungan penuh untuk iOS (Safari 16.4+) ditunda ke Fase 4 karena keterbatasan platform (lihat FR-10.7). User iOS tetap bisa memakai chat secara fungsional di fase awal, hanya belum mendapat push notification real-time saat app tertutup.

---

## 12. Kriteria Sukses (Acceptance Criteria Tingkat Tinggi)

- [ ] User dapat login dan melihat daftar Topic + DM sesuai akses mereka.
- [ ] Pesan terkirim dan diterima real-time (< 300ms) tanpa reload halaman.
- [ ] Gambar yang diupload otomatis terkompresi di client dan tampil dengan thumbnail cepat.
- [ ] Pesan yang di-pin dapat diakses langsung dari tab Pinned tanpa scroll di chat.
- [ ] Semua attachment (gambar/file/link) sebuah Topic/DM otomatis muncul di tab Library.
- [ ] User dapat mencari pesan/file lama via Search dan langsung "jump" ke lokasi pesan asli.
- [ ] Topic "Announcement" bisa dilihat semua user namun hanya Admin/Super Admin yang bisa posting.
- [ ] Topic "General Chat" bisa dilihat dan diisi (posting) oleh semua user tanpa batasan role.
- [ ] App dapat di-install ke homescreen HP dan terbuka fullscreen seperti native app.
- [ ] Server tetap responsif (tidak crash/lag signifikan) dengan simulasi ±100-200 user aktif bersamaan pada VPS 4vCPU/4GB RAM.
- [ ] Antarmuka dapat dialihkan antara Bahasa Indonesia dan Bahasa Inggris dari halaman profil/setting.
- [ ] Status baca dan riwayat pesan tersinkron real-time saat user login di lebih dari 1 device bersamaan.
- [ ] Super Admin dapat mengatur kebijakan retensi (selamanya / auto-archive N bulan) dan melihat preview estimasi ukuran data sebelum proses archive dijalankan.
- [ ] Admin dapat melihat Admin Dashboard berisi statistik chat (total pesan, topic teraktif, user aktif) dan penggunaan storage/disk saat ini.
- [ ] Aktivitas administratif penting (buat/hapus topic, ubah role, hapus pesan oleh admin) tercatat di Audit Log dan dapat ditinjau oleh Admin/Super Admin.
- [ ] User baru otomatis menjadi member Announcement & General Chat saat akun diaktifkan, dan ditambahkan ke topic divisi lain secara manual oleh Admin/Manager terkait.

---

*Dokumen ini dirancang agar dapat langsung digunakan sebagai acuan development, termasuk oleh AI coding assistant (vibe coding), karena mencakup skema database siap pakai (Prisma), daftar API endpoint, serta panduan desain visual yang konkret.*
