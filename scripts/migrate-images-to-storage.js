// =============================================================
// 일기 이미지 Firebase Storage 이관 스크립트
// 사용법: 앱 로그인 후 브라우저 콘솔에 전체 내용 붙여넣기
// =============================================================

(async function migrateImagesToStorage() {
  const coupleId = App.Couple.currentCouple.id;
  console.log(`[migrate] coupleId: ${coupleId}`);

  const snap = await App.db.collection('diaries')
    .where('coupleId', '==', coupleId)
    .get();

  console.log(`[migrate] 총 일기 수: ${snap.docs.length}`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of snap.docs) {
    const diary = { id: doc.id, ...doc.data() };

    // 이미 이관된 경우 (images[0].url 존재) 스킵
    if (diary.images && diary.images.length > 0 && diary.images[0].url) {
      skipped++;
      continue;
    }

    // 이미지 없는 일기 스킵
    const hasImages = (diary.images && diary.images.length > 0) || diary.imageBase64;
    if (!hasImages) {
      skipped++;
      continue;
    }

    try {
      // 이관할 base64 목록 정규화
      let base64List = [];
      if (diary.images && diary.images.length > 0) {
        base64List = diary.images.map(img => img.base64 || img.originalBase64).filter(Boolean);
      } else if (diary.imageBase64) {
        base64List = [diary.imageBase64];
      }

      // Storage 업로드
      const uploadedImages = await Promise.all(
        base64List.map(async (base64, idx) => {
          const path = `diaries/${coupleId}/${diary.id}/${idx}.jpg`;
          const ref = App.storage.ref(path);
          await ref.putString(base64, 'data_url');
          const url = await ref.getDownloadURL();
          return { url };
        })
      );

      // Firestore 업데이트 - url로 교체, 구버전 필드 제거
      const updateData = { images: uploadedImages };
      if (diary.imageBase64) {
        updateData.imageBase64 = firebase.firestore.FieldValue.delete();
      }
      if (diary.imageOriginalBase64) {
        updateData.imageOriginalBase64 = firebase.firestore.FieldValue.delete();
      }

      await App.db.collection('diaries').doc(diary.id).update(updateData);

      migrated++;
      console.log(`[migrate] ✓ ${diary.id} (${uploadedImages.length}장)`);
    } catch (err) {
      failed++;
      console.error(`[migrate] ✗ ${diary.id}:`, err);
    }
  }

  console.log(`\n[migrate] 완료 — 이관: ${migrated}, 스킵: ${skipped}, 실패: ${failed}`);
})();
