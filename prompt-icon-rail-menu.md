# Prompt: Icon Rail Menu (ala Slack) — PVChat

Tambahkan **Icon Rail** — kolom navigasi sempit (72px) di paling kiri layar, terinspirasi pola Slack (kolom navigasi gelap yang selalu terlihat sebagai "anchor", terpisah dari daftar Topic/DM di sebelahnya). Gunakan kelas `.icon-rail` dari design system CSS (`pvchat-design-system.css`, variable `--color-rail-bg` dkk).

## Isi Icon Rail (dari atas ke bawah)

1. **Logo/mark PVChat** — kotak kecil rounded, gradient brand color, di paling atas rail. Kelas: `.icon-rail-logo`.

2. **Menu utama** (masing-masing icon 48x48px, klik untuk mengganti konten sidebar di sebelahnya):
   - 🏠 **Home** — menampilkan daftar semua Topic (Announcement, General Chat, Topic divisi & sub-topic).
   - 💬 **Direct Messages** — menampilkan daftar DM 1-on-1, dengan badge unread jika ada pesan belum dibaca.
   - 🔔 **Activity** — notifikasi/mention yang ditujukan ke user (pesan yang mention dia, reply ke thread yang diikuti).
   - 🔍 **Search** — membuka General Search (FR-9.2 di PRD) dalam bentuk modal/overlay, bisa diakses dari mana saja tanpa harus pindah menu dulu.

3. **Spacer** — ruang kosong mengisi sisa tinggi rail (kelas `.icon-rail-spacer`).

4. **Avatar profil user** di paling bawah rail (kelas `.icon-rail-avatar`) — klik untuk membuka menu: ubah status (online/away), pengaturan bahasa (ID/EN), notifikasi, logout.

## Perilaku & Styling

- Icon yang sedang aktif diberi highlight: background lebih terang dari rail + garis putih tipis di sisi kiri icon. Sudah tersedia lewat kelas `.icon-rail-item.is-active` — jangan buat state style baru dari nol.
- Badge unread merah kecil muncul di pojok kanan-atas icon jika ada notifikasi baru. Kelas `.badge-unread` sudah disediakan di design system — tinggal posisikan `position: absolute` di dalam `.icon-rail-item`.
- Warna rail memakai **"Midnight Indigo"** (`--color-rail-bg: #1C1A3D`), BUKAN warna baru — ini pilihan sengaja: navigasi gelap yang tenang sebagai anchor, kontras dengan area konten (sidebar + chat) yang tetap terang. Jangan ubah ke warna lain tanpa alasan kuat.
- Highlight icon aktif memakai gradient brand blue→ungu (`--color-rail-active-pill`), konsisten dengan warna primary aplikasi — bukan warna lepas yang tidak ada di token system.

## Perilaku Mobile (Wajib — App ini Mobile-First)

- Icon Rail **disembunyikan sepenuhnya** di layar <768px (sudah diatur via media query `.icon-rail { display: none; }` di CSS).
- Digantikan oleh **Bottom Navigation** (`.bottom-nav`) dengan menu yang sama persis: Home, DM, Activity, Search — supaya pengalaman tetap konsisten meski bentuk navigasinya beda per platform.
- Semua touch target di Bottom Navigation minimal 44x44px sesuai standar mobile-first yang sudah ditetapkan di PRD.

## Referensi Kelas CSS yang Sudah Tersedia

```
.icon-rail                 → container rail
.icon-rail-logo            → logo/mark di atas
.icon-rail-item            → setiap tombol menu (Home, DM, Activity, Search)
.icon-rail-item.is-active  → state aktif
.icon-rail-spacer          → pengisi ruang kosong
.icon-rail-avatar          → avatar profil di bawah
.badge-unread              → badge notifikasi merah (reusable, dipakai juga di sidebar)
```

Jangan buat ulang style ini dari nol — pakai token & kelas yang sudah ada di `pvchat-design-system.css` agar konsisten dengan seluruh bagian aplikasi lain.
