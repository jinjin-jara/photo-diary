// =============================================================
// 기존 {url} 일기 데이터에 thumb 추가 재이관 스크립트
// 사용법: 앱 로그인 후 브라우저 콘솔에 전체 내용 붙여넣기
// =============================================================

async function generateThumbFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');
      const srcRatio = img.width / img.height;
      const targetRatio = 3 / 4;
      let sx, sy, sw, sh;
      if (srcRatio > targetRatio) {
        sh = img.height; sw = sh * targetRatio;
        sx = (img.width - sw) / 2; sy = 0;
      } else {
        sw = img.width; sh = sw / targetRatio;
        sx = 0; sy = (img.height - sh) / 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 300, 400);
      resolve(canvas.toDataURL('image/jpeg', 0.35));
    };
    img.onerror = reject;
    img.src = url;
  });
}

(async function remigrateAddThumbs() {
  const coupleId = App.Couple.currentCouple.id;
  console.log(`[remigrate] coupleId: ${coupleId}`);

  const snap = await App.db.collection('diaries')
    .where('coupleId', '==', coupleId)
    .get();

  console.log(`[remigrate] 총 일기 수: ${snap.docs.length}`);

  let done = 0, skipped = 0, failed = 0;

  for (const doc of snap.docs) {
    const diary = { id: doc.id, ...doc.data() };

    // thumb 이미 있으면 스킵
    if (diary.images && diary.images.length > 0 && diary.images[0].thumb) {
      skipped++;
      continue;
    }

    // url 없으면 스킵 (이미지 없는 일기 또는 base64만 있는 경우)
    if (!diary.images || !diary.images[0] || !diary.images[0].url) {
      skipped++;
      continue;
    }

    try {
      const updatedImages = await Promise.all(
        diary.images.map(async (img) => {
          if (!img.url) return img;
          const thumb = await generateThumbFromUrl(img.url);
          return { thumb, url: img.url };
        })
      );

      await App.db.collection('diaries').doc(diary.id).update({ images: updatedImages });
      done++;
      console.log(`[remigrate] ✓ ${diary.id} (${updatedImages.length}장)`);
    } catch (err) {
      failed++;
      console.error(`[remigrate] ✗ ${diary.id}:`, err);
    }
  }

  console.log(`\n[remigrate] 완료 — 처리: ${done}, 스킵: ${skipped}, 실패: ${failed}`);
})();
