# 17Chills — Professional Music Shop Frontend (v2)

A beautiful, modern, fully functional music website for Ugandan Afro-soul artist 17Chills.

## What's New & Professional in v2
- **Stunning modern design** with smooth interactions, better typography, and professional polish
- **Editable artist biography** — change it live from the admin panel (persists via MongoDB)
- **TikTok + secondary phone/WhatsApp** fully supported and editable
- **My Library** page — fans enter their phone number and instantly see + download everything they bought
- **Powerful catalog filters** — search, genre chips, price/newest sort on both Music and Merch
- **Clear payment method badges** — shows MTN, Airtel, Visa, Mastercard, Bank supported via Pesapal
- **Testimonials section** to build trust
- **Improved navigation** — sticky professional nav works from every page
- **Admin dashboard** enhanced with bio editor, better organization
- All data (including bio, contacts, prices, featured status) lives safely in MongoDB Atlas

## How to Use (Free Cloud)
1. Deploy backend first (see 17-backend/README-BACKEND.md)
2. Update `config.js` with your live backend URL
3. Deploy this folder to **Netlify** (drag & drop or connect GitHub — takes 30 seconds)
4. Set backend `FRONTEND_URL` env var to your Netlify URL
5. Log in via the tiny dot in footer → enjoy full admin control

## Key Pages
- **Home** — Hero + editable bio + story + testimonials + quick contact
- **Music** — Full catalog with live search, genre filters, sorting, previews, buy/download
- **Merch** — Shop with same powerful controls
- **My Library** — Fan self-service downloads (enter phone → see owned items)
- **Admin Dashboard** (artist only) — Upload/edit tracks & merch, change bio & contacts, bulk prices, view sales

## Payments
Everything goes through Pesapal's secure gateway:
- Mobile Money (MTN MoMo & Airtel Money)
- International Cards (Visa, Mastercard)
- Bank transfers where available

Fans get instant redirect and reliable confirmation.

## File Persistence Note
Track audio and cover/merch images are uploaded to the backend server. For true permanence across deploys, enable Cloudinary (instructions in backend README). Catalog data, bio, prices, and purchase records are 100% safe in MongoDB.

This is now a complete professional independent artist music shop ready for real fans and real revenue.

Built with love for Ugandan music. Enjoy! 🎵
