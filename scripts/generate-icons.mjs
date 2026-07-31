// PWA 아이콘 v3 생성 — 소스: public/icon-v2.png (512x512, 흰 배경 불투명)
// any용 192/512 + maskable용 192/512 (로고 90% 축소 배치로 safe zone 확보, 흰색 패딩)
import sharp from "sharp";

const SRC = "public/icon-v2.png";
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

// any: 원본 512 + 축소 192
await sharp(SRC).resize(512, 512).png().toFile("public/icon-v3-512.png");
await sharp(SRC).resize(192, 192).png().toFile("public/icon-v3-192.png");

// maskable: 512 흰 캔버스 중앙에 원본을 90%(461px)로 축소 배치
const inner = await sharp(SRC).resize(461, 461).png().toBuffer();
const maskable512 = await sharp({
  create: { width: 512, height: 512, channels: 4, background: WHITE },
})
  .composite([{ input: inner, gravity: "center" }])
  .png()
  .toBuffer();
await sharp(maskable512).toFile("public/icon-v3-maskable-512.png");
await sharp(maskable512).resize(192, 192).png().toFile("public/icon-v3-maskable-192.png");

console.log("완료: icon-v3-{192,512}.png, icon-v3-maskable-{192,512}.png 생성");
