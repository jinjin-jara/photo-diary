window.App = window.App || {};

App.Image = {
  MAX_WIDTH: 800,
  QUALITY: 0.7,
  MAX_BASE64_BYTES: 300 * 1024, // 300KB per image → 3 photos safely under Firestore 1MB limit

  compressToTarget(canvas, targetBytes) {
    let quality = App.Image.QUALITY;
    let result = canvas.toDataURL('image/jpeg', quality);
    while (result.length > targetBytes && quality > 0.5) {
      quality -= 0.1;
      result = canvas.toDataURL('image/jpeg', quality);
    }
    return result;
  },

  async uploadToStorage(base64, path) {
    const ref = App.storage.ref(path);
    await ref.putString(base64, 'data_url');
    return await ref.getDownloadURL();
  },

  async fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > App.Image.MAX_WIDTH) {
          height = (height * App.Image.MAX_WIDTH) / width;
          width = App.Image.MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const base64 = App.Image.compressToTarget(canvas, App.Image.MAX_BASE64_BYTES);
        resolve(base64);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  },

  openCropModal(imageSrc) {
    return new Promise((resolve) => {
      let cropper = null;

      // Create modal
      const modal = document.createElement('div');
      modal.className = 'crop-modal';
      modal.innerHTML = `
        <div class="crop-modal-header">
          <button class="crop-cancel">취소</button>
          <span>사진 자르기</span>
          <button class="crop-confirm">확인</button>
        </div>
        <div class="crop-container">
          <img id="crop-image" src="${imageSrc}">
        </div>
        <div class="crop-preview-section">
          <div class="crop-preview-label">피드 미리보기</div>
          <div class="crop-preview-grid">
            <div class="crop-preview-cell"><canvas id="crop-preview-1"></canvas></div>
            <div class="crop-preview-cell"><canvas id="crop-preview-2"></canvas></div>
            <div class="crop-preview-cell"><canvas id="crop-preview-3"></canvas></div>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      const cropImage = document.getElementById('crop-image');

      cropper = new Cropper(cropImage, {
        aspectRatio: 3 / 4,
        viewMode: 1,
        movable: true,
        zoomable: false,
        rotatable: false,
        scalable: false,
        cropBoxMovable: false,
        cropBoxResizable: false,
        dragMode: 'move',
        guides: false,
        center: false,
        highlight: false,
        background: false,
        crop() {
          updatePreview(cropper);
        },
        ready() {
          updatePreview(cropper);
        }
      });

      function updatePreview(cr) {
        const canvas = cr.getCroppedCanvas({
          width: 180,
          height: 240
        });
        if (!canvas) return;

        for (let i = 1; i <= 3; i++) {
          const previewCanvas = document.getElementById(`crop-preview-${i}`);
          const ctx = previewCanvas.getContext('2d');
          previewCanvas.width = 60;
          previewCanvas.height = 80;
          ctx.drawImage(canvas, 0, 0, 60, 80);
        }
      }

      function cleanup() {
        if (cropper) cropper.destroy();
        modal.remove();
      }

      modal.querySelector('.crop-cancel').onclick = () => {
        cleanup();
        resolve(null);
      };

      modal.querySelector('.crop-confirm').onclick = () => {
        const croppedCanvas = cropper.getCroppedCanvas({
          width: App.Image.MAX_WIDTH,
          maxHeight: Math.round(App.Image.MAX_WIDTH * 4 / 3)
        });
        const croppedBase64 = App.Image.compressToTarget(croppedCanvas, App.Image.MAX_BASE64_BYTES);
        cleanup();
        resolve(croppedBase64);
      };
    });
  }
};
